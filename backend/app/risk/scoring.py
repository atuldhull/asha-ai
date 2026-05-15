"""Plan 5.1 — deterministic 0–100 risk score.

Pure function from (symptoms, age, comorbidities, vitals, history) →
RiskAssessment. No I/O, no LLM, no DB. p95 target < 10ms.

Weights are anchored to ESI v5 acuity buckets (Gilboy 2020) + WHO IMCI
danger-sign weights (WHO/UNICEF 2014). The intent is NOT to replace the
9 deterministic red-flag rules or the ESI level — it is to give the
doctor cockpit a continuous tie-breaker between same-ESI cases.

Safety invariants (load-bearing — see [[verify-before-deploy]]):
  1. Risk score can only ESCALATE a verdict, never downgrade.
  2. An existing red-flag-driven Emergency Room verdict is NEVER
     overridden, regardless of risk score.

The mirror implementation in `frontend/lib/risk.ts` MUST stay in sync
with this module — same weights, same factors, same trajectory math.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import Iterable

from app.models.risk import (
    RiskAssessment,
    RiskComponents,
    RiskComputeRequest,
    RiskHistoryPoint,
    RiskLevel,
    RiskTrajectory,
)
from app.models.triage import CareLevel

# Per-symptom base weight in points (capped at 100 before age multiplier).
# Sources by symptom:
#   chest_pain / shortness_of_breath / loss_of_consciousness / blueness_lips
#   / neck_stiffness / confusion : ESI v5 high-risk / immediate-acuity criteria.
#   fever / high_fever / vomiting / diarrhea / cough / rash
#   / abdominal_pain / dizziness : WHO IMCI danger-sign + supporting symptom
#   weights for primary-care presentations.
#   bleeding / severe_headache / fatigue / joint_pain : ESI v5 mid-acuity.
SYMPTOM_BASE_SCORES: dict[str, int] = {
    "fever": 20,                       # WHO IMCI fever section
    "high_fever": 35,                  # WHO IMCI danger sign (≥39°C with co-symptoms)
    "chest_pain": 45,                  # ESI v5 high-risk acuity
    "difficulty_breathing": 50,        # ESI v5 immediate-acuity
    "shortness_of_breath": 50,         # ESI v5 immediate-acuity
    "severe_headache": 35,             # ESI v5 mid-acuity, ?thunderclap
    "vomiting": 15,                    # WHO IMCI persistent vomiting
    "diarrhea": 10,                    # WHO IMCI diarrhea section
    "cough": 12,                       # WHO IMCI cough/difficult breathing
    "fatigue": 8,                      # ESI v5 low-acuity supporting
    "joint_pain": 15,                  # ESI v5 mid-acuity
    "rash": 20,                        # WHO IMCI measles/dengue indicator
    "confusion": 55,                   # ESI v5 immediate-acuity (AMS)
    "loss_of_consciousness": 90,       # ESI v5 acuity 1
    "neck_stiffness": 60,              # Meningitis red flag — ESI 1-2
    "blueness_lips": 85,               # Cyanosis — ESI v5 acuity 1
    "abdominal_pain": 18,              # ESI v5 mid-acuity supporting
    "dizziness": 12,                   # ESI v5 mid-acuity supporting
    "bleeding": 40,                    # ESI v5 high-acuity supporting
}

# Comorbidity additive scores (capped at 30 total). Derived from WHO IMCI
# high-risk modifiers + India MoHFW STG comorbidity flags.
COMORBIDITY_SCORES: dict[str, int] = {
    "diabetes": 15,
    "hypertension": 10,
    "heart_disease": 20,
    "asthma": 12,
    "copd": 18,
    "immunocompromised": 25,
    "pregnancy": 20,
    "malnutrition": 15,
    "hiv": 20,
}

# Age multipliers — pediatric and geriatric extremes get amplified.
# 0–2: WHO IMCI under-2 high-risk window (×1.8)
# 2–5: under-5 still elevated (×1.5)
# 5–12: pediatric mid (×1.2)
# 12–60: adult baseline (×1.0)
# 60–75: geriatric elevated (×1.4)
# 75+:  frail elderly (×1.8)
def _age_multiplier(age: int) -> float:
    if age < 2:
        return 1.8
    if age < 5:
        return 1.5
    if age < 12:
        return 1.2
    if age < 60:
        return 1.0
    if age < 75:
        return 1.4
    return 1.8


def _severity_factor(severity: int) -> float:
    """Non-linear amplifier — a 10 is much worse than a 5."""
    sev = max(1, min(10, severity))
    return (sev / 10.0) ** 0.7 * 1.5


def _time_factor(onset_hours_ago: float) -> float:
    """Acute presentations weigh more than week-old complaints."""
    if onset_hours_ago < 6:
        return 1.3
    if onset_hours_ago < 24:
        return 1.1
    if onset_hours_ago >= 72:
        return 0.85
    return 1.0


def _symptom_score(symptoms: Iterable) -> float:
    total = 0.0
    for s in symptoms:
        name = (s.name if hasattr(s, "name") else s["name"]).lower().replace(" ", "_")
        base = SYMPTOM_BASE_SCORES.get(name, 10)
        sev = s.severity if hasattr(s, "severity") else s["severity"]
        onset = s.onset_hours_ago if hasattr(s, "onset_hours_ago") else s["onset_hours_ago"]
        total += base * _severity_factor(sev) * _time_factor(onset)
    return min(total, 100.0)


def _comorbidity_score(items: Iterable[str]) -> int:
    total = 0
    for c in items:
        key = c.lower().replace(" ", "_")
        total += COMORBIDITY_SCORES.get(key, 0)
    return min(total, 30)


def _vital_score(v) -> int:
    if v is None:
        return 0
    bonus = 0
    rr = getattr(v, "breathing_rate", None) if not isinstance(v, dict) else v.get("breathing_rate")
    hr = getattr(v, "heart_rate", None) if not isinstance(v, dict) else v.get("heart_rate")
    if isinstance(rr, (int, float)):
        if rr > 30 or rr < 10:
            bonus += 25
        elif rr > 25:
            bonus += 10
    if isinstance(hr, (int, float)):
        if hr > 130 or hr < 45:
            bonus += 20
        elif hr > 110:
            bonus += 8
    return bonus


def _trajectory(history: list[RiskHistoryPoint] | list[dict]) -> RiskTrajectory:
    """Linear-regression slope on prior risk scores."""
    if not history or len(history) < 2:
        return RiskTrajectory.INSUFFICIENT_DATA
    scores = [
        float(p.score if hasattr(p, "score") else p["score"])
        for p in history
    ]
    n = len(scores)
    xs = list(range(n))
    sum_x = sum(xs)
    sum_y = sum(scores)
    sum_xy = sum(x * y for x, y in zip(xs, scores))
    sum_x2 = sum(x * x for x in xs)
    denom = n * sum_x2 - sum_x * sum_x
    slope = (n * sum_xy - sum_x * sum_y) / denom if denom else 0.0
    if slope > 3:
        return RiskTrajectory.RAPIDLY_WORSENING
    if slope > 0.5:
        return RiskTrajectory.WORSENING
    if slope > -0.5:
        return RiskTrajectory.STABLE
    return RiskTrajectory.IMPROVING


def _trajectory_multiplier(t: RiskTrajectory) -> float:
    return {
        RiskTrajectory.RAPIDLY_WORSENING: 1.3,
        RiskTrajectory.WORSENING: 1.15,
        RiskTrajectory.STABLE: 1.0,
        RiskTrajectory.IMPROVING: 0.9,
        RiskTrajectory.INSUFFICIENT_DATA: 1.0,
    }[t]


def _classify(score: int) -> tuple[RiskLevel, str]:
    if score >= 70:
        return RiskLevel.CRITICAL, "Go to emergency room now."
    if score >= 50:
        return RiskLevel.HIGH, "See a doctor within 2 hours."
    if score >= 30:
        return RiskLevel.MODERATE, "See a doctor within 24 hours."
    return RiskLevel.LOW, "Monitor at home — rest and hydrate."


def compute_score(req: RiskComputeRequest) -> RiskAssessment:
    """Pure deterministic scorer. Mirrors `frontend/lib/risk.ts`."""
    sym = _symptom_score(req.symptoms)
    age_mult = _age_multiplier(req.age)
    com = _comorbidity_score(req.comorbidities or [])
    vit = _vital_score(req.vital_proxy)

    raw = sym * age_mult + com + vit
    base = min(round(raw), 100)

    trajectory = _trajectory(req.history or [])
    score = min(round(base * _trajectory_multiplier(trajectory)), 100)

    level, action = _classify(score)
    return RiskAssessment(
        score=int(score),
        level=level,
        trajectory=trajectory,
        action=action,
        components=RiskComponents(
            symptoms=int(round(sym)),
            age_factor=round(age_mult, 2),
            comorbidities=int(round(com)),
            vitals=int(round(vit)),
        ),
        computed_at=datetime.now(timezone.utc).isoformat(),
    )


# Care-level escalation ordering for the safety property.
_LEVEL_RANK = {"Home Care": 0, "Clinic Visit": 1, "Emergency Room": 2}


def escalate_care_level(
    original_level: str | CareLevel,
    risk: RiskAssessment,
    *,
    has_red_flag_er: bool = False,
) -> str:
    """Apply the Plan 5.1 safety property.

    Risk can ONLY escalate the verdict, never downgrade. Existing
    red-flag-driven Emergency Room verdicts are protected — they are
    never overridden, even if the risk score is LOW.
    """
    current = original_level.value if isinstance(original_level, CareLevel) else original_level
    if current == "Emergency Room":
        return current

    if risk.level == RiskLevel.CRITICAL:
        target = "Emergency Room"
    elif risk.level == RiskLevel.HIGH and current == "Home Care":
        target = "Clinic Visit"
    else:
        target = current

    if has_red_flag_er:
        return "Emergency Room"

    return target if _LEVEL_RANK[target] >= _LEVEL_RANK[current] else current


__all__ = [
    "SYMPTOM_BASE_SCORES", "COMORBIDITY_SCORES",
    "compute_score", "escalate_care_level",
]
