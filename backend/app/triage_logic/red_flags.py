"""The 9 deterministic red-flag rules — the safety net.

Per docs/RED_FLAGS.md. Each rule is a pure function with the signature:

    rule_fn(symptoms: set[str], age: int|None, sex: str|None,
            history: set[str], vitals: dict) -> Flag | None

The combined `get_red_flags()` returns ALL fired flags. The router applies
the safety property in `esi.final_care_level()` — rules can only ESCALATE
the final care level; they never downgrade.

Symptom tokens use snake_case matching `D:\\hack\\ml\\symptom_severity.csv`.
History tokens use snake_case ("diabetes", "hypertension", "smoker",
"asthma", "pregnancy").
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Callable


@dataclass(frozen=True)
class Flag:
    rule_id: str
    rule_name: str
    force_level: str  # always "Emergency Room"
    reasoning: str
    citation: str  # e.g. "RED_FLAGS.md Rule 1"


@dataclass
class RedFlagResult:
    flags: list[Flag] = field(default_factory=list)

    @property
    def force_escalation(self) -> bool:
        return bool(self.flags)

    @property
    def force_level(self) -> str | None:
        return "Emergency Room" if self.flags else None


def _has(symptoms: set[str], token: str) -> bool:
    return token in symptoms


def _any(symptoms: set[str], *tokens: str) -> bool:
    return any(t in symptoms for t in tokens)


def _hist(history: set[str], *tokens: str) -> bool:
    return any(t in history for t in tokens)


# ───────────────────────── Rule 1 — STEMI / ACS ─────────────────────────
def rule_1_stemi(
    symptoms: set[str], age: int | None, sex: str | None,
    history: set[str], vitals: dict,
) -> Flag | None:
    if not _has(symptoms, "chest_pain"):
        return None

    co_symptoms = _any(
        symptoms,
        "radiation_arm", "radiation_jaw", "diaphoresis",
        "shortness_of_breath", "nausea",
    )
    age_risk = (age is not None and age >= 35) and co_symptoms
    history_risk = _hist(history, "diabetes", "hypertension", "smoker")

    if age_risk or history_risk or co_symptoms:
        return Flag(
            rule_id="R1_STEMI",
            rule_name="STEMI / Acute Coronary Syndrome",
            force_level="Emergency Room",
            reasoning=(
                "Chest pain with cardiac red-flag features (arm/jaw "
                "radiation, sweating, shortness of breath, or risk "
                "history) can be a heart attack. Time is muscle — go to "
                "an emergency room now."
            ),
            citation="RED_FLAGS.md Rule 1",
        )
    return None


# ───────────────────────── Rule 2 — Stroke (FAST) ────────────────────────
def rule_2_stroke_fast(
    symptoms: set[str], age: int | None, sex: str | None,
    history: set[str], vitals: dict,
) -> Flag | None:
    if _any(
        symptoms,
        "face_droop", "arm_weakness", "leg_weakness", "slurred_speech",
        "sudden_confusion", "sudden_vision_loss", "worst_headache_ever",
    ):
        return Flag(
            rule_id="R2_STROKE_FAST",
            rule_name="Stroke (FAST positive)",
            force_level="Emergency Room",
            reasoning=(
                "Face droop, arm weakness, slurred speech, or sudden "
                "severe headache can be a stroke. Treatment window is "
                "4.5 hours — go to an emergency room now."
            ),
            citation="RED_FLAGS.md Rule 2",
        )
    return None


# ───────────────────────── Rule 3 — Anaphylaxis ─────────────────────────
def rule_3_anaphylaxis(
    symptoms: set[str], age: int | None, sex: str | None,
    history: set[str], vitals: dict,
) -> Flag | None:
    skin = _any(symptoms, "rash", "hives", "swelling")
    breathing = _any(
        symptoms,
        "difficulty_breathing", "throat_tightness", "wheezing",
        "dizziness", "vomiting",
    )
    allergen = _hist(history, "known_allergy", "drug_allergy", "food_allergy")
    if (skin and breathing) or (allergen and breathing):
        return Flag(
            rule_id="R3_ANAPHYLAXIS",
            rule_name="Anaphylaxis",
            force_level="Emergency Room",
            reasoning=(
                "Rash or swelling combined with difficulty breathing or "
                "throat tightness can be anaphylaxis. Airway compromise "
                "happens within minutes — go to an emergency room now."
            ),
            citation="RED_FLAGS.md Rule 3",
        )
    return None


# ───────────────────────── Rule 4 — Sepsis (qSOFA) ───────────────────────
def rule_4_sepsis(
    symptoms: set[str], age: int | None, sex: str | None,
    history: set[str], vitals: dict,
) -> Flag | None:
    temp = vitals.get("temp_c")
    hr = vitals.get("hr")
    rr = vitals.get("rr")
    sbp = vitals.get("bp_sys")
    has_fever = (temp is not None and temp >= 38.3) or _any(symptoms, "high_fever")
    altered = _any(symptoms, "altered_consciousness", "sudden_confusion") or (sbp is not None and sbp < 100)
    fast_vitals_count = 0
    if hr is not None and hr > 90:
        fast_vitals_count += 1
    if rr is not None and rr > 20:
        fast_vitals_count += 1
    has_infection = _hist(history, "infection", "uti", "pneumonia")

    if has_fever and (fast_vitals_count >= 1 or altered):
        return Flag(
            rule_id="R4_SEPSIS",
            rule_name="Sepsis (qSOFA positive)",
            force_level="Emergency Room",
            reasoning=(
                "High fever with confusion, fast heart rate, fast "
                "breathing, or low blood pressure is a sepsis red flag. "
                "Mortality climbs by the hour — go to an emergency room now."
            ),
            citation="RED_FLAGS.md Rule 4",
        )
    if has_infection and fast_vitals_count >= 2:
        return Flag(
            rule_id="R4_SEPSIS",
            rule_name="Sepsis (qSOFA positive)",
            force_level="Emergency Room",
            reasoning=(
                "Known infection with two or more abnormal vitals is a "
                "sepsis red flag — go to an emergency room now."
            ),
            citation="RED_FLAGS.md Rule 4",
        )
    return None


# ───────────────────────── Rule 5 — DKA ─────────────────────────────────
def rule_5_dka(
    symptoms: set[str], age: int | None, sex: str | None,
    history: set[str], vitals: dict,
) -> Flag | None:
    if not _hist(history, "diabetes", "type_1_diabetes", "type_2_diabetes"):
        return None
    primary = _any(
        symptoms,
        "vomiting", "abdominal_pain", "rapid_breathing",
        "fruity_breath", "sudden_confusion",
    )
    thirst = _any(symptoms, "high_thirst", "frequent_urination")
    if primary and (thirst or _any(symptoms, "fruity_breath", "rapid_breathing")):
        return Flag(
            rule_id="R5_DKA",
            rule_name="Diabetic Ketoacidosis",
            force_level="Emergency Room",
            reasoning=(
                "A diabetic with vomiting, abdominal pain, rapid breathing, "
                "or fruity breath could be in diabetic ketoacidosis. This "
                "is life-threatening — go to an emergency room now."
            ),
            citation="RED_FLAGS.md Rule 5",
        )
    return None


# ─────────────────── Rule 6 — Pediatric IMCI danger ─────────────────────
def rule_6_pediatric_danger(
    symptoms: set[str], age: int | None, sex: str | None,
    history: set[str], vitals: dict,
) -> Flag | None:
    if age is None or age >= 5:
        return None
    temp = vitals.get("temp_c")
    high_fever = (temp is not None and temp >= 39.0) or _any(symptoms, "high_fever")
    danger = _any(
        symptoms,
        "lethargy", "poor_feeding", "difficult_to_wake",
        "fontanelle_bulge", "seizure", "rash_non_blanching",
    )
    if high_fever or danger:
        return Flag(
            rule_id="R6_PEDIATRIC_DANGER",
            rule_name="Pediatric WHO IMCI danger signs",
            force_level="Emergency Room",
            reasoning=(
                "A young child with high fever, lethargy, poor feeding, "
                "or other WHO IMCI danger signs needs urgent care — go "
                "to an emergency room now."
            ),
            citation="RED_FLAGS.md Rule 6",
        )
    return None


# ───────────────────── Rule 7 — Severe asthma ───────────────────────────
def rule_7_severe_asthma(
    symptoms: set[str], age: int | None, sex: str | None,
    history: set[str], vitals: dict,
) -> Flag | None:
    if not _hist(history, "asthma"):
        return None
    spo2 = vitals.get("spo2")
    if _any(
        symptoms,
        "cannot_speak_full_sentences", "using_accessory_muscles",
        "drowsy", "blue_lips",
    ):
        triggered = True
    elif spo2 is not None and spo2 < 92:
        triggered = True
    elif _any(symptoms, "wheezing") and _any(symptoms, "drowsy"):
        triggered = True
    else:
        triggered = False

    if triggered:
        return Flag(
            rule_id="R7_SEVERE_ASTHMA",
            rule_name="Severe asthma exacerbation",
            force_level="Emergency Room",
            reasoning=(
                "Asthma with inability to finish sentences, drowsiness, "
                "low oxygen, or a silent chest is severe — go to an "
                "emergency room now."
            ),
            citation="RED_FLAGS.md Rule 7",
        )
    return None


# ───────────────────── Rule 8 — Hemorrhage / shock ──────────────────────
def rule_8_hemorrhage(
    symptoms: set[str], age: int | None, sex: str | None,
    history: set[str], vitals: dict,
) -> Flag | None:
    direct = _any(
        symptoms,
        "heavy_bleeding", "vomiting_blood", "black_tarry_stool",
        "coughing_blood", "vaginal_bleeding_pregnancy",
    )
    hr = vitals.get("hr")
    sbp = vitals.get("bp_sys")
    shock = (
        _any(symptoms, "pale", "dizziness")
        and (hr is not None and hr > 110)
        and (sbp is not None and sbp < 90)
    )
    if direct or shock:
        return Flag(
            rule_id="R8_HEMORRHAGE",
            rule_name="Acute hemorrhage / hypovolemic shock",
            force_level="Emergency Room",
            reasoning=(
                "Heavy bleeding, vomiting blood, coughing blood, or "
                "bleeding in pregnancy points to acute hemorrhage. "
                "Go to an emergency room now."
            ),
            citation="RED_FLAGS.md Rule 8",
        )
    return None


# ───────────────────── Rule 9 — Suicidal ideation ───────────────────────
def rule_9_suicidal(
    symptoms: set[str], age: int | None, sex: str | None,
    history: set[str], vitals: dict,
) -> Flag | None:
    if _has(symptoms, "suicidal_ideation") or _any(
        symptoms, "self_harm", "suicide_plan", "suicide_intent"
    ):
        return Flag(
            rule_id="R9_SUICIDAL",
            rule_name="Suicidal ideation / self-harm intent",
            force_level="Emergency Room",
            reasoning=(
                "Suicidal thoughts require immediate mental-health "
                "support. Call iCall 9152987821 or Vandrevala 1860-2662-345. "
                "If in immediate danger, go to an emergency room or call 112."
            ),
            citation="RED_FLAGS.md Rule 9",
        )
    return None


ALL_RULES: tuple[Callable[..., Flag | None], ...] = (
    rule_1_stemi,
    rule_2_stroke_fast,
    rule_3_anaphylaxis,
    rule_4_sepsis,
    rule_5_dka,
    rule_6_pediatric_danger,
    rule_7_severe_asthma,
    rule_8_hemorrhage,
    rule_9_suicidal,
)


def get_red_flags(
    symptoms: set[str] | list[str],
    age: int | None = None,
    sex: str | None = None,
    history: set[str] | list[str] | None = None,
    vitals: dict | None = None,
) -> RedFlagResult:
    sym_set = set(symptoms) if not isinstance(symptoms, set) else symptoms
    hist_set = set(history) if history else set()
    vitals = vitals or {}

    flags: list[Flag] = []
    for rule in ALL_RULES:
        flag = rule(sym_set, age, sex, hist_set, vitals)
        if flag is not None:
            flags.append(flag)
    return RedFlagResult(flags=flags)
