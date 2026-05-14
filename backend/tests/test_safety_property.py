"""The safety property: rules can only escalate, never downgrade.

This is the line that wins the Q&A war-game. If even one of these
tests fails, an ML downgrade vulnerability has been introduced.
"""
from __future__ import annotations

from app.triage_logic.esi import (
    ESI_TO_CARE,
    esi_from_severity,
    final_care_level,
    level_from_esi,
)
from app.triage_logic.red_flags import Flag


def _flag(rule_id: str = "R1_STEMI") -> Flag:
    return Flag(
        rule_id=rule_id,
        rule_name="test rule",
        force_level="Emergency Room",
        reasoning="…",
        citation="…",
    )


# ─── The core safety property ─────────────────────────────────────────────
def test_red_flag_overrides_home_care_from_ml():
    assert final_care_level([_flag()], "Home Care") == "Emergency Room"


def test_red_flag_overrides_clinic_visit_from_ml():
    assert final_care_level([_flag()], "Clinic Visit") == "Emergency Room"


def test_red_flag_keeps_emergency_room_when_ml_agrees():
    assert final_care_level([_flag()], "Emergency Room") == "Emergency Room"


def test_no_red_flag_uses_ml_level_directly():
    assert final_care_level([], "Home Care") == "Home Care"
    assert final_care_level([], "Clinic Visit") == "Clinic Visit"
    assert final_care_level([], "Emergency Room") == "Emergency Room"


def test_no_inputs_defaults_to_clinic_visit():
    # Conservative default: when we have nothing, suggest a clinician.
    assert final_care_level([], None) == "Clinic Visit"


def test_multiple_flags_still_pick_emergency_room():
    flags = [_flag("R1_STEMI"), _flag("R2_STROKE_FAST")]
    assert final_care_level(flags, "Home Care") == "Emergency Room"


# ─── ESI mapper sanity ────────────────────────────────────────────────────
def test_esi_levels_map_to_correct_care_strings():
    assert ESI_TO_CARE[1] == "Emergency Room"
    assert ESI_TO_CARE[2] == "Emergency Room"
    assert ESI_TO_CARE[3] == "Clinic Visit"
    assert ESI_TO_CARE[4] == "Home Care"
    assert ESI_TO_CARE[5] == "Home Care"


def test_high_severity_score_returns_esi_1():
    assert esi_from_severity(0.95) == 1


def test_low_spo2_alone_forces_esi_1():
    assert esi_from_severity(0.10, vitals={"spo2": 85}) == 1


def test_low_bp_forces_esi_1():
    assert esi_from_severity(0.10, vitals={"bp_sys": 85}) == 1


def test_moderate_severity_returns_esi_3():
    assert esi_from_severity(0.55) == 3


def test_trivial_severity_returns_esi_5():
    assert esi_from_severity(0.05) == 5


def test_level_from_esi_uses_exact_strings():
    assert level_from_esi(1) == "Emergency Room"
    assert level_from_esi(3) == "Clinic Visit"
    assert level_from_esi(5) == "Home Care"
