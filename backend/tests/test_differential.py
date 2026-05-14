"""Unit tests for the heuristic 3-tier differential."""
from __future__ import annotations

from app.triage_logic.differential import build_differential


def _names(items) -> set[str]:
    return {c.name for c in items}


def test_chest_pain_produces_acs_differential():
    d = build_differential(symptoms={"chest_pain"}, features={})
    most = _names(d.most_likely)
    cant_miss = _names(d.cant_miss)
    # Common benign mimics in most_likely
    assert "Musculoskeletal chest pain" in most or "Acid reflux / GERD" in most
    # Critical ACS lives in cant_miss
    assert "Acute coronary syndrome" in cant_miss
    assert "Aortic dissection" in cant_miss


def test_stroke_fast_produces_stroke_differential():
    d = build_differential(symptoms={"face_droop", "arm_weakness"}, features={})
    most = _names(d.most_likely)
    assert "Ischaemic stroke" in most
    assert "Hemorrhagic stroke" in most


def test_anaphylaxis_requires_both_skin_and_breathing():
    only_skin = build_differential(symptoms={"rash"}, features={})
    assert "Anaphylaxis" not in _names(only_skin.most_likely)
    both = build_differential(
        symptoms={"rash", "difficulty_breathing"}, features={},
    )
    assert "Anaphylaxis" in _names(both.most_likely)


def test_persistent_cough_requires_14_day_duration_for_tb():
    short = build_differential(
        symptoms={"persistent_cough"},
        features={"duration_days": 3},
    )
    assert short.is_empty() or "Pulmonary tuberculosis (presumptive)" not in _names(short.most_likely)
    long_ = build_differential(
        symptoms={"persistent_cough"},
        features={"duration_days": 21},
    )
    assert "Pulmonary tuberculosis (presumptive)" in _names(long_.most_likely)


def test_common_cold_differential_is_benign():
    d = build_differential(symptoms={"runny_nose", "sore_throat"}, features={})
    assert "Common cold (viral URI)" in _names(d.most_likely)
    # Common cold has no cant_miss conditions
    assert d.cant_miss == []


def test_mental_health_differential_carries_suicidal_crisis():
    d = build_differential(symptoms={"suicidal_ideation"}, features={})
    assert "Acute suicidal crisis" in _names(d.most_likely)


def test_pediatric_branch_only_fires_for_children():
    adult = build_differential(
        symptoms={"high_fever"},
        features={"is_child": False},
    )
    child = build_differential(
        symptoms={"high_fever"},
        features={"is_child": True},
    )
    pediatric_label = "Pediatric serious bacterial infection"
    assert pediatric_label not in _names(adult.most_likely)
    assert pediatric_label in _names(child.most_likely)


def test_empty_symptoms_returns_empty_differential():
    d = build_differential(symptoms=set(), features={})
    assert d.is_empty()


def test_differential_serialises_cleanly():
    d = build_differential(symptoms={"chest_pain"}, features={})
    out = d.as_dict()
    assert "most_likely" in out and "expanded" in out and "cant_miss" in out
    # Each condition has a name + severity at minimum.
    for bucket in out.values():
        for item in bucket:
            assert "name" in item and "severity" in item
