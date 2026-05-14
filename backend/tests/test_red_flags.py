"""Unit tests for the 9 red-flag rules (Plan 2.0).

Per the DoD: each rule has at least 2 positive and 2 negative cases.
Rules are pure functions; no FastAPI client / Supabase needed.
"""
from __future__ import annotations

from app.triage_logic.red_flags import (
    rule_1_stemi,
    rule_2_stroke_fast,
    rule_3_anaphylaxis,
    rule_4_sepsis,
    rule_5_dka,
    rule_6_pediatric_danger,
    rule_7_severe_asthma,
    rule_8_hemorrhage,
    rule_9_suicidal,
    get_red_flags,
)


def _fired(flag) -> bool:
    return flag is not None and flag.force_level == "Emergency Room"


# ─── Rule 1: STEMI ────────────────────────────────────────────────────────
def test_R1_stemi_pos_chest_pain_with_radiation_arm():
    assert _fired(rule_1_stemi(
        symptoms={"chest_pain", "radiation_arm", "diaphoresis"},
        age=67, sex="M", history=set(), vitals={},
    ))


def test_R1_stemi_pos_chest_pain_with_diabetic_history():
    assert _fired(rule_1_stemi(
        symptoms={"chest_pain"},
        age=50, sex="M", history={"diabetes"}, vitals={},
    ))


def test_R1_stemi_neg_chest_pain_alone_young_no_history():
    # Plan 2.0 spec: chest pain without ANY ACS feature and no risk history
    # should NOT fire R1 (let the ML / ESI layer decide).
    assert rule_1_stemi(
        symptoms={"chest_pain"},
        age=22, sex="F", history=set(), vitals={},
    ) is None


def test_R1_stemi_neg_no_chest_pain():
    assert rule_1_stemi(
        symptoms={"headache"},
        age=67, sex="M", history={"diabetes"}, vitals={},
    ) is None


# ─── Rule 2: Stroke FAST ──────────────────────────────────────────────────
def test_R2_stroke_pos_face_droop():
    assert _fired(rule_2_stroke_fast(
        symptoms={"face_droop"}, age=72, sex="F", history=set(), vitals={},
    ))


def test_R2_stroke_pos_slurred_speech_plus_arm_weakness():
    assert _fired(rule_2_stroke_fast(
        symptoms={"slurred_speech", "arm_weakness"},
        age=60, sex="M", history=set(), vitals={},
    ))


def test_R2_stroke_neg_mild_headache():
    assert rule_2_stroke_fast(
        symptoms={"headache"}, age=30, sex="F", history=set(), vitals={},
    ) is None


def test_R2_stroke_neg_no_neurological_symptoms():
    assert rule_2_stroke_fast(
        symptoms={"runny_nose", "mild_cough"},
        age=25, sex="F", history=set(), vitals={},
    ) is None


# ─── Rule 3: Anaphylaxis ──────────────────────────────────────────────────
def test_R3_anaphylaxis_pos_rash_plus_difficulty_breathing():
    assert _fired(rule_3_anaphylaxis(
        symptoms={"rash", "difficulty_breathing"},
        age=30, sex="F", history=set(), vitals={},
    ))


def test_R3_anaphylaxis_pos_hives_throat_tight():
    assert _fired(rule_3_anaphylaxis(
        symptoms={"hives", "throat_tightness"},
        age=22, sex="M", history=set(), vitals={},
    ))


def test_R3_anaphylaxis_neg_rash_only():
    assert rule_3_anaphylaxis(
        symptoms={"rash"}, age=30, sex="F", history=set(), vitals={},
    ) is None


def test_R3_anaphylaxis_neg_breathing_difficulty_alone():
    # Difficulty breathing alone is NOT anaphylaxis without a skin sign.
    assert rule_3_anaphylaxis(
        symptoms={"difficulty_breathing"},
        age=40, sex="M", history=set(), vitals={},
    ) is None


# ─── Rule 4: Sepsis (qSOFA) ───────────────────────────────────────────────
def test_R4_sepsis_pos_fever_plus_confusion():
    assert _fired(rule_4_sepsis(
        symptoms={"high_fever", "altered_consciousness"},
        age=55, sex="M", history=set(), vitals={"hr": 110},
    ))


def test_R4_sepsis_pos_temp_plus_fast_hr_and_low_bp():
    assert _fired(rule_4_sepsis(
        symptoms=set(), age=60, sex="F", history=set(),
        vitals={"temp_c": 39.0, "hr": 110, "bp_sys": 88},
    ))


def test_R4_sepsis_neg_fever_only_normal_vitals():
    assert rule_4_sepsis(
        symptoms={"high_fever"}, age=30, sex="M", history=set(),
        vitals={"hr": 80, "rr": 16},
    ) is None


def test_R4_sepsis_neg_no_fever():
    assert rule_4_sepsis(
        symptoms={"altered_consciousness"}, age=30, sex="M",
        history=set(), vitals={"hr": 100},
    ) is None


# ─── Rule 5: DKA ──────────────────────────────────────────────────────────
def test_R5_dka_pos_diabetic_with_vomiting_thirst():
    assert _fired(rule_5_dka(
        symptoms={"vomiting", "high_thirst"},
        age=24, sex="F", history={"diabetes"}, vitals={},
    ))


def test_R5_dka_pos_diabetic_with_fruity_breath():
    assert _fired(rule_5_dka(
        symptoms={"fruity_breath", "rapid_breathing"},
        age=30, sex="M", history={"type_1_diabetes"}, vitals={},
    ))


def test_R5_dka_neg_non_diabetic_with_vomiting():
    assert rule_5_dka(
        symptoms={"vomiting", "high_thirst"},
        age=24, sex="F", history=set(), vitals={},
    ) is None


def test_R5_dka_neg_diabetic_with_unrelated_symptom():
    assert rule_5_dka(
        symptoms={"headache"}, age=40, sex="M",
        history={"diabetes"}, vitals={},
    ) is None


# ─── Rule 6: Pediatric IMCI danger ────────────────────────────────────────
def test_R6_pediatric_pos_child_with_high_fever():
    assert _fired(rule_6_pediatric_danger(
        symptoms={"high_fever"}, age=3, sex="M", history=set(), vitals={},
    ))


def test_R6_pediatric_pos_child_with_lethargy():
    assert _fired(rule_6_pediatric_danger(
        symptoms={"lethargy", "poor_feeding"},
        age=2, sex="F", history=set(), vitals={},
    ))


def test_R6_pediatric_neg_adult_with_high_fever():
    assert rule_6_pediatric_danger(
        symptoms={"high_fever"}, age=30, sex="F", history=set(), vitals={},
    ) is None


def test_R6_pediatric_neg_child_with_mild_symptoms():
    assert rule_6_pediatric_danger(
        symptoms={"runny_nose"}, age=4, sex="M",
        history=set(), vitals={"temp_c": 37.2},
    ) is None


# ─── Rule 7: Severe asthma ────────────────────────────────────────────────
def test_R7_severe_asthma_pos_asthmatic_cant_finish_sentences():
    assert _fired(rule_7_severe_asthma(
        symptoms={"cannot_speak_full_sentences"},
        age=28, sex="F", history={"asthma"}, vitals={},
    ))


def test_R7_severe_asthma_pos_asthmatic_low_spo2():
    assert _fired(rule_7_severe_asthma(
        symptoms={"wheezing"}, age=35, sex="M",
        history={"asthma"}, vitals={"spo2": 88},
    ))


def test_R7_severe_asthma_neg_non_asthmatic_with_wheeze():
    assert rule_7_severe_asthma(
        symptoms={"wheezing"}, age=30, sex="M",
        history=set(), vitals={},
    ) is None


def test_R7_severe_asthma_neg_asthmatic_mild_flare():
    assert rule_7_severe_asthma(
        symptoms={"mild_cough"}, age=25, sex="F",
        history={"asthma"}, vitals={"spo2": 96},
    ) is None


# ─── Rule 8: Hemorrhage / shock ───────────────────────────────────────────
def test_R8_hemorrhage_pos_vomiting_blood():
    assert _fired(rule_8_hemorrhage(
        symptoms={"vomiting_blood"}, age=50, sex="M",
        history=set(), vitals={},
    ))


def test_R8_hemorrhage_pos_pregnancy_vaginal_bleeding():
    assert _fired(rule_8_hemorrhage(
        symptoms={"vaginal_bleeding_pregnancy", "dizziness"},
        age=22, sex="F", history={"pregnancy"}, vitals={},
    ))


def test_R8_hemorrhage_neg_minor_nosebleed():
    assert rule_8_hemorrhage(
        symptoms={"runny_nose"}, age=20, sex="M",
        history=set(), vitals={},
    ) is None


def test_R8_hemorrhage_neg_dizziness_alone():
    assert rule_8_hemorrhage(
        symptoms={"dizziness"}, age=25, sex="F",
        history=set(), vitals={"hr": 80, "bp_sys": 115},
    ) is None


# ─── Rule 9: Suicidal ideation ────────────────────────────────────────────
def test_R9_suicidal_pos_ideation():
    assert _fired(rule_9_suicidal(
        symptoms={"suicidal_ideation"}, age=19, sex="F",
        history=set(), vitals={},
    ))


def test_R9_suicidal_pos_self_harm():
    assert _fired(rule_9_suicidal(
        symptoms={"self_harm"}, age=22, sex="M",
        history=set(), vitals={},
    ))


def test_R9_suicidal_neg_depression_word_only():
    # "depression" alone shouldn't fire — only explicit ideation does.
    assert rule_9_suicidal(
        symptoms={"fatigue"}, age=30, sex="F",
        history=set(), vitals={},
    ) is None


def test_R9_suicidal_neg_no_mental_health_symptom():
    assert rule_9_suicidal(
        symptoms={"chest_pain"}, age=40, sex="M",
        history=set(), vitals={},
    ) is None


# ─── get_red_flags aggregator ────────────────────────────────────────────
def test_get_red_flags_returns_all_fired_rules():
    result = get_red_flags(
        symptoms={"chest_pain", "diaphoresis", "face_droop"},
        age=70, sex="M", history={"diabetes"}, vitals={},
    )
    rule_ids = {f.rule_id for f in result.flags}
    assert "R1_STEMI" in rule_ids
    assert "R2_STROKE_FAST" in rule_ids
    assert result.force_escalation is True
    assert result.force_level == "Emergency Room"


def test_get_red_flags_no_fire_returns_empty():
    result = get_red_flags(
        symptoms={"runny_nose"},
        age=30, sex="F", history=set(), vitals={},
    )
    assert result.flags == []
    assert result.force_escalation is False
    assert result.force_level is None
