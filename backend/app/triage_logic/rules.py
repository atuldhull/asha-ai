"""Plan 1.0 keyword-rule triage engine.

In Plan 1.0, Role C ships `triage_rules.md` describing the rules in a
markdown DSL. Until that file exists, this module ships embedded rules that
cover all 9 canonical red flags from docs/RED_FLAGS.md plus a handful of
moderate / mild presentations — enough to satisfy the DoD eval cases.

When Role C's file appears (D:\\hack\\ml\\triage_rules.md or
D:\\hack\\backend\\app\\data\\triage_rules.md), the loader will be extended
to parse it. For Plan 1.0 the embedded list is canonical.

Rules are evaluated in order; first match wins.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Callable

from app.core.disclaimers import DISCLAIMER, MENTAL_HEALTH_HELPLINES
from app.models.triage import CareLevel, TriageResponse
from app.triage_logic.severity import compute_severity, severity_to_level


@dataclass
class Rule:
    name: str
    level: CareLevel
    reasoning: str
    red_flag: str | None
    trigger: Callable[[str], bool]
    matched_symptoms: list[str] = field(default_factory=list)


def _any(text: str, *keywords: str) -> bool:
    return any(re.search(rf"\b{re.escape(k)}\b", text) for k in keywords)


def _all(text: str, *keywords: str) -> bool:
    return all(re.search(rf"\b{re.escape(k)}\b", text) for k in keywords)


def _build_rules() -> list[Rule]:
    return [
        # ──────────────── 9 RED FLAGS (force Emergency Room) ────────────────
        Rule(
            name="R1 STEMI / Acute Coronary Syndrome",
            level=CareLevel.ER,
            red_flag="STEMI / ACS",
            reasoning=(
                "Chest pain can indicate a heart attack — especially with "
                "sweating, arm/jaw pain, or shortness of breath. Time is "
                "muscle. Go to an emergency room now."
            ),
            trigger=lambda t: _any(t, "chest pain", "chest pressure", "chest tightness"),
        ),
        Rule(
            name="R2 Stroke (FAST positive)",
            level=CareLevel.ER,
            red_flag="Stroke FAST",
            reasoning=(
                "Sudden weakness, facial droop, slurred speech, or sudden "
                "severe headache can be a stroke. The treatment window is "
                "4.5 hours from onset — go to an emergency room now."
            ),
            trigger=lambda t: _any(
                t,
                "face droop", "facial droop",
                "arm weakness", "leg weakness", "one-sided weakness",
                "slurred speech", "slurring",
                "sudden confusion", "sudden vision loss",
                "worst headache", "thunderclap headache",
            ),
        ),
        Rule(
            name="R3 Anaphylaxis",
            level=CareLevel.ER,
            red_flag="Anaphylaxis",
            reasoning=(
                "Rash or swelling combined with difficulty breathing or "
                "throat tightness can be anaphylaxis. Airway compromise "
                "happens within minutes — go to an emergency room now."
            ),
            trigger=lambda t: (
                _any(t, "rash", "hives", "swelling", "swollen face", "swollen lips")
                and _any(t, "difficulty breathing", "throat tight", "throat closing", "wheezing", "can't breathe", "cant breathe")
            ),
        ),
        Rule(
            name="R4 Sepsis (qSOFA)",
            level=CareLevel.ER,
            red_flag="Sepsis",
            reasoning=(
                "High fever with confusion, very fast heart rate, or "
                "rapid breathing is a sepsis red flag. Mortality climbs "
                "by the hour — go to an emergency room now."
            ),
            trigger=lambda t: (
                _any(t, "high fever", "fever 39", "fever 40")
                and _any(t, "confused", "confusion", "altered", "very fast heart", "rapid breathing", "racing heart")
            ),
        ),
        Rule(
            name="R5 Diabetic Ketoacidosis",
            level=CareLevel.ER,
            red_flag="DKA",
            reasoning=(
                "Diabetic with vomiting, abdominal pain, rapid breathing, "
                "or fruity breath suggests diabetic ketoacidosis. This is "
                "life-threatening — go to an emergency room now."
            ),
            trigger=lambda t: (
                _any(t, "diabetic", "diabetes", "type 1", "type 2")
                and _any(t, "vomiting", "abdominal pain", "rapid breathing", "fruity breath", "confused")
            ),
        ),
        Rule(
            name="R6 Pediatric IMCI danger signs",
            level=CareLevel.ER,
            red_flag="Pediatric danger sign",
            reasoning=(
                "A child with high fever plus lethargy, poor feeding, or "
                "difficulty waking shows WHO IMCI danger signs. Go to an "
                "emergency room now."
            ),
            trigger=lambda t: (
                _any(t, "child", "infant", "baby", "toddler", "kid")
                and _any(t, "high fever", "fever 39", "fever 40", "lethargic", "lethargy", "won't wake", "poor feeding", "not feeding", "fontanelle", "non-blanching rash")
            ),
        ),
        Rule(
            name="R7 Severe asthma exacerbation",
            level=CareLevel.ER,
            red_flag="Severe asthma",
            reasoning=(
                "Asthma with inability to finish sentences, drowsiness, "
                "or low oxygen is severe — go to an emergency room now."
            ),
            trigger=lambda t: (
                _any(t, "asthma", "asthmatic")
                and _any(t, "can't speak", "cant speak", "can't finish sentences", "drowsy", "blue lips", "spo2", "oxygen low")
            ),
        ),
        Rule(
            name="R8 Acute hemorrhage / shock",
            level=CareLevel.ER,
            red_flag="Hemorrhage",
            reasoning=(
                "Heavy bleeding, vomiting blood, coughing blood, or "
                "bleeding in pregnancy points to acute hemorrhage. "
                "Go to an emergency room now."
            ),
            trigger=lambda t: _any(
                t,
                "heavy bleeding", "vomiting blood", "throwing up blood",
                "coughing blood", "black tarry stool", "black stool",
                "bleeding in pregnancy", "vaginal bleeding",
            ),
        ),
        # Rule 9 (suicidal ideation) is handled in core/safety.py refusal flow.

        # ──────────────── Other strong ER signals ────────────────
        Rule(
            name="R-Severe Breathing",
            level=CareLevel.ER,
            red_flag="Respiratory distress",
            reasoning=(
                "Severe shortness of breath or trouble breathing needs "
                "urgent evaluation — go to an emergency room now."
            ),
            trigger=lambda t: _any(
                t,
                "severe shortness of breath",
                "severe difficulty breathing",
                "cannot breathe", "can't breathe", "cant breathe",
                "gasping",
            ),
        ),

        # ──────────────── Clinic Visit (moderate) ────────────────
        Rule(
            name="R10 Persistent cough (TB workup)",
            level=CareLevel.CLINIC,
            red_flag=None,
            reasoning=(
                "A cough lasting more than two weeks, especially with "
                "weight loss or night sweats, needs a clinic visit to "
                "rule out tuberculosis."
            ),
            trigger=lambda t: (
                _any(t, "cough")
                and _any(t, "2 weeks", "two weeks", "3 weeks", "three weeks", "month", "weight loss", "night sweats")
            ),
        ),
        Rule(
            name="R11 UTI symptoms",
            level=CareLevel.CLINIC,
            red_flag=None,
            reasoning=(
                "Burning urination with frequency suggests a urinary tract "
                "infection. See a clinician within 24-48 hours for antibiotics."
            ),
            trigger=lambda t: (
                _any(t, "burning urination", "painful urination", "dysuria")
                or (_any(t, "frequent urination") and _any(t, "burning", "painful"))
            ),
        ),
        Rule(
            name="R12 Persistent fever",
            level=CareLevel.CLINIC,
            red_flag=None,
            reasoning=(
                "Fever lasting several days without clear cause needs a "
                "clinician's evaluation."
            ),
            trigger=lambda t: (
                _any(t, "fever")
                and _any(t, "3 days", "4 days", "5 days", "6 days", "week", "persistent")
            ),
        ),
        Rule(
            name="R-Migraine",
            level=CareLevel.CLINIC,
            red_flag=None,
            reasoning=(
                "Recurring migraines without red-flag features benefit "
                "from a clinician's review and a prevention plan."
            ),
            trigger=lambda t: _any(t, "migraine", "migraines"),
        ),
        Rule(
            name="R-Back pain new onset",
            level=CareLevel.CLINIC,
            red_flag=None,
            reasoning=(
                "Acute back pain without weakness or numbness should be "
                "seen by a clinician within a few days."
            ),
            trigger=lambda t: _any(t, "back pain", "lower back pain"),
        ),

        # ──────────────── Home Care (mild) ────────────────
        Rule(
            name="R25 Common cold",
            level=CareLevel.HOME,
            red_flag=None,
            reasoning=(
                "Runny nose and mild sore throat without high fever is "
                "likely a common cold. Rest, fluids, and monitor."
            ),
            trigger=lambda t: (
                _any(t, "runny nose", "stuffy nose", "blocked nose", "sneezing")
                and not _any(t, "high fever", "fever 39", "fever 40", "shortness of breath", "chest pain")
            ),
        ),
        Rule(
            name="R26 Mild fever in healthy adult",
            level=CareLevel.HOME,
            red_flag=None,
            reasoning=(
                "Mild low-grade fever in an otherwise healthy adult "
                "without red flags can be monitored at home with rest "
                "and fluids."
            ),
            trigger=lambda t: (
                _any(t, "mild fever", "low fever", "low-grade fever")
                and not _any(t, "chest pain", "shortness of breath", "confused", "child")
            ),
        ),
        Rule(
            name="R27 Mild GI upset",
            level=CareLevel.HOME,
            red_flag=None,
            reasoning=(
                "Mild nausea or one or two loose stools without "
                "dehydration can be managed at home with fluids."
            ),
            trigger=lambda t: (
                _any(t, "mild nausea", "loose stool", "loose motion")
                and not _any(t, "blood", "severe", "dehydrated")
            ),
        ),
        Rule(
            name="R28 Tension headache",
            level=CareLevel.HOME,
            red_flag=None,
            reasoning=(
                "A mild headache that responds to paracetamol and has no "
                "red-flag features can be monitored at home."
            ),
            trigger=lambda t: (
                _any(t, "mild headache", "tension headache")
                and not _any(t, "worst headache", "sudden severe", "vomiting", "confusion")
            ),
        ),
    ]


_RULES: list[Rule] = _build_rules()


def reload_rules() -> None:
    """Hook for hot-reloading once Role C's triage_rules.md ships."""
    global _RULES
    _RULES = _build_rules()


def apply_rules(symptoms_text: str) -> TriageResponse:
    text = symptoms_text.lower()

    for rule in _RULES:
        try:
            if rule.trigger(text):
                return TriageResponse(
                    level=rule.level,
                    reasoning=rule.reasoning,
                    red_flags=[rule.red_flag] if rule.red_flag else [],
                    disclaimer=DISCLAIMER,
                )
        except Exception:
            # A bad rule must never crash triage. Skip and continue.
            continue

    # No rule fired — fall back to severity-score heuristic.
    score, matched = compute_severity(symptoms_text)
    level_str = severity_to_level(score)
    level = CareLevel(level_str)

    if level == CareLevel.ER:
        reasoning = (
            "Symptoms include high-severity features — go to an "
            "emergency room for urgent evaluation."
        )
    elif level == CareLevel.CLINIC:
        reasoning = (
            "Symptoms don't clearly indicate home care or an emergency. "
            "See a clinician for evaluation within 24-48 hours."
        )
    else:
        reasoning = (
            "No red-flag features detected. Monitor symptoms at home; "
            "re-run triage if anything worsens."
        )

    return TriageResponse(
        level=level,
        reasoning=reasoning,
        red_flags=[],
        disclaimer=DISCLAIMER,
    )


def handle_refusal(category: str) -> TriageResponse:
    """Build the response for a safety-refusal hit (called from the router)."""
    if category == "suicidal_ideation":
        icall = MENTAL_HEALTH_HELPLINES["iCall"]
        vandrevala = MENTAL_HEALTH_HELPLINES["Vandrevala Foundation"]
        return TriageResponse(
            level=CareLevel.ER,
            reasoning=(
                f"You are not alone — please reach out for support right now. "
                f"iCall: {icall}. Vandrevala Foundation: {vandrevala}. "
                f"If you are in immediate danger, go to an emergency room or "
                f"call 112."
            ),
            red_flags=["Suicidal ideation"],
            disclaimer=DISCLAIMER,
        )
    if category == "drug_dosing":
        return TriageResponse(
            level=CareLevel.CLINIC,
            reasoning=(
                "I cannot provide medication dosing. Please consult a "
                "registered medical practitioner for any prescription "
                "or dosage questions."
            ),
            red_flags=[],
            disclaimer=DISCLAIMER,
        )
    # Fallback — should not be reached for non_medical (router returns 422).
    return TriageResponse(
        level=CareLevel.CLINIC,
        reasoning="See a clinician for evaluation.",
        disclaimer=DISCLAIMER,
    )
