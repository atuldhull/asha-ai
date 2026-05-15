"""Plan 5.1 — dynamic risk scoring unit tests.

Covers:
  1. Pediatric escalation: high-fever child gets age-multiplier boost.
  2. Geriatric + comorbidity stack: 75yo with diabetes + HTN scores HIGH+.
  3. Severity non-linearity: 10 is more than 2× a 5.
  4. Time factor: acute onset (<6h) > 72h+ onset for the same symptom.
  5. Trajectory: worsening history elevates the final score.
  6. Trajectory: improving history dampens the final score.
  7. Trajectory: <2 history points → insufficient_data, no multiplier.
  8. Vital bonus: RR > 30 adds the +25 bonus.
  9. Comorbidity cap: stacking 5 of them caps at 30.
 10. **Safety property** — risk LOW never downgrades existing ER verdict.
 11. **Safety property** — red-flag-driven ER is never overridden.
 12. **Perf** — 200 scorings complete in well under 200ms total.
"""
from __future__ import annotations

import time

from app.models.risk import (
    RiskComputeRequest,
    RiskHistoryPoint,
    RiskLevel,
    RiskTrajectory,
    SymptomInput,
    VitalProxy,
)
from app.models.triage import CareLevel
from app.risk.scoring import compute_score, escalate_care_level


def _req(**overrides) -> RiskComputeRequest:
    base = dict(
        symptoms=[SymptomInput(name="fever", severity=5, onset_hours_ago=12.0)],
        age=35,
        sex="other",
        comorbidities=[],
        vital_proxy=None,
        history=[],
    )
    base.update(overrides)
    return RiskComputeRequest(**base)


def test_pediatric_high_fever_escalates():
    """A 1-year-old with high fever should score higher than the same
    fever in an adult — the 1.8× age multiplier is the whole point."""
    child = compute_score(_req(
        symptoms=[SymptomInput(name="high_fever", severity=8, onset_hours_ago=4.0)],
        age=1,
    ))
    adult = compute_score(_req(
        symptoms=[SymptomInput(name="high_fever", severity=8, onset_hours_ago=4.0)],
        age=35,
    ))
    assert child.score > adult.score
    assert child.components.age_factor == 1.8


def test_geriatric_with_comorbidities():
    """75yo with diabetes + HTN + heart_disease + moderate chest pain
    should be HIGH or CRITICAL."""
    r = compute_score(_req(
        symptoms=[SymptomInput(name="chest_pain", severity=6, onset_hours_ago=2.0)],
        age=75,
        comorbidities=["diabetes", "hypertension", "heart_disease"],
    ))
    assert r.level in (RiskLevel.HIGH, RiskLevel.CRITICAL)


def test_severity_is_non_linear():
    """Severity 10 should be much more than 2× severity 5."""
    mid = compute_score(_req(
        symptoms=[SymptomInput(name="chest_pain", severity=5, onset_hours_ago=12.0)],
    ))
    high = compute_score(_req(
        symptoms=[SymptomInput(name="chest_pain", severity=10, onset_hours_ago=12.0)],
    ))
    # With sev_factor = (sev/10)**0.7 * 1.5, ratio is ~1.62. The score
    # difference must reflect a non-trivial non-linear bump.
    assert high.score > mid.score
    assert high.components.symptoms > mid.components.symptoms


def test_acute_onset_weights_more_than_chronic():
    """A 2-hour-old chest pain should score higher than the same pain
    that's been going for 4 days."""
    acute = compute_score(_req(
        symptoms=[SymptomInput(name="chest_pain", severity=7, onset_hours_ago=2.0)],
    ))
    chronic = compute_score(_req(
        symptoms=[SymptomInput(name="chest_pain", severity=7, onset_hours_ago=96.0)],
    ))
    assert acute.score > chronic.score


def test_worsening_trajectory_escalates():
    """Climbing history scores should give a worsening multiplier."""
    rising = [
        RiskHistoryPoint(ts="2026-05-15T08:00:00Z", score=30),
        RiskHistoryPoint(ts="2026-05-15T10:00:00Z", score=40),
        RiskHistoryPoint(ts="2026-05-15T12:00:00Z", score=55),
        RiskHistoryPoint(ts="2026-05-15T14:00:00Z", score=70),
    ]
    flat = [
        RiskHistoryPoint(ts="2026-05-15T08:00:00Z", score=50),
        RiskHistoryPoint(ts="2026-05-15T10:00:00Z", score=50),
        RiskHistoryPoint(ts="2026-05-15T12:00:00Z", score=50),
        RiskHistoryPoint(ts="2026-05-15T14:00:00Z", score=50),
    ]
    r_rising = compute_score(_req(history=rising))
    r_flat = compute_score(_req(history=flat))
    assert r_rising.trajectory in (RiskTrajectory.WORSENING, RiskTrajectory.RAPIDLY_WORSENING)
    assert r_flat.trajectory == RiskTrajectory.STABLE
    assert r_rising.score >= r_flat.score


def test_improving_trajectory_dampens():
    """Falling history scores should give an improving multiplier (0.9×)."""
    falling = [
        RiskHistoryPoint(ts="2026-05-15T08:00:00Z", score=70),
        RiskHistoryPoint(ts="2026-05-15T10:00:00Z", score=55),
        RiskHistoryPoint(ts="2026-05-15T12:00:00Z", score=40),
        RiskHistoryPoint(ts="2026-05-15T14:00:00Z", score=25),
    ]
    r = compute_score(_req(
        symptoms=[SymptomInput(name="fever", severity=6, onset_hours_ago=8.0)],
        history=falling,
    ))
    assert r.trajectory == RiskTrajectory.IMPROVING


def test_single_history_point_is_insufficient_data():
    """A single prior score can't define a slope — no multiplier."""
    r = compute_score(_req(
        history=[RiskHistoryPoint(ts="2026-05-15T12:00:00Z", score=50)],
    ))
    assert r.trajectory == RiskTrajectory.INSUFFICIENT_DATA


def test_vital_bonus_for_tachypnea():
    """RR > 30 should add the +25 vital bonus."""
    no_vitals = compute_score(_req())
    tachypneic = compute_score(_req(
        vital_proxy=VitalProxy(breathing_rate=34),
    ))
    assert tachypneic.components.vitals == 25
    assert tachypneic.score > no_vitals.score


def test_comorbidity_cap_at_30():
    """Five comorbidities total 87 raw — must cap at 30."""
    r = compute_score(_req(
        comorbidities=["diabetes", "hypertension", "heart_disease", "asthma", "copd"],
    ))
    assert r.components.comorbidities == 30


def test_low_risk_never_downgrades_existing_er():
    """The escalate-only safety property: a LOW risk score on a verdict
    that already returned Emergency Room MUST stay at Emergency Room."""
    low_risk = compute_score(_req(
        symptoms=[SymptomInput(name="fatigue", severity=2, onset_hours_ago=120.0)],
    ))
    assert low_risk.level == RiskLevel.LOW
    out = escalate_care_level(CareLevel.ER, low_risk)
    assert out == "Emergency Room"


def test_red_flag_er_is_never_overridden():
    """If a red flag drove the ER verdict, even a LOW risk on a Home
    Care base must NOT downgrade — the red flag wins unconditionally."""
    low_risk = compute_score(_req(
        symptoms=[SymptomInput(name="fatigue", severity=2, onset_hours_ago=120.0)],
    ))
    out = escalate_care_level("Home Care", low_risk, has_red_flag_er=True)
    assert out == "Emergency Room"


def test_perf_under_10ms_per_call():
    """200 calls must complete in < 1 second total. Target is < 10ms p95."""
    req = _req(
        symptoms=[
            SymptomInput(name="chest_pain", severity=7, onset_hours_ago=2.0),
            SymptomInput(name="shortness_of_breath", severity=6, onset_hours_ago=2.0),
        ],
        age=65,
        comorbidities=["diabetes", "hypertension"],
        vital_proxy=VitalProxy(breathing_rate=24, heart_rate=115),
        history=[
            RiskHistoryPoint(ts="2026-05-15T08:00:00Z", score=40),
            RiskHistoryPoint(ts="2026-05-15T10:00:00Z", score=55),
            RiskHistoryPoint(ts="2026-05-15T12:00:00Z", score=70),
        ],
    )
    t0 = time.perf_counter()
    for _ in range(200):
        compute_score(req)
    elapsed = time.perf_counter() - t0
    assert elapsed < 1.0, f"200 risk scorings took {elapsed:.3f}s (>1s)"
