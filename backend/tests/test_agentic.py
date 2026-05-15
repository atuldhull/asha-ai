"""Plan 4.0 — agentic orchestrator tests.

The 5 tools are pure adapters; we test them at the unit level then
run the synthetic orchestrator end-to-end (no Gemini API key needed).
Real Gemini integration is only exercised when GEMINI_API_KEY is set —
those tests are skipped otherwise.
"""
from __future__ import annotations

import asyncio
import os

import pytest

from app.agentic.orchestrator import (
    Verdict,
    enforce_safety_property,
    orchestrate,
    orchestrate_synthetic,
)
from app.agentic.tools import (
    TOOL_DECLARATIONS,
    TOOL_IMPL,
    invoke,
    tool_compute_esi,
    tool_extract_symptoms,
    tool_get_red_flags,
    tool_imci_lookup,
    tool_rag_retrieve,
)


def _run(coro):
    return asyncio.get_event_loop().run_until_complete(coro) if hasattr(asyncio, "get_event_loop") else asyncio.run(coro)


# ─── Tool surface tests (per AGENTIC_TOOLS.md schema) ─────────────────────
def test_five_tools_registered():
    names = {d["name"] for d in TOOL_DECLARATIONS}
    assert names == {
        "extract_symptoms",
        "get_red_flags",
        "compute_esi",
        "imci_lookup",
        "rag_retrieve",
    }
    assert set(TOOL_IMPL.keys()) == names


def test_extract_symptoms_returns_structured():
    out = tool_extract_symptoms("severe chest pain radiating to left arm and sweating")
    names = [s["name"] for s in out["symptoms"]]
    assert "chest_pain" in names
    assert any(n in {"radiation_arm", "diaphoresis"} for n in names)
    assert "confidence" in out


def test_extract_symptoms_flags_vague_stroke_followup():
    out = tool_extract_symptoms("my left arm feels heavy and I am a bit confused")
    assert out["needs_followup"] is True
    assert "FACE" in (out.get("followup_hint") or "").upper() or \
           "face" in (out.get("followup_hint") or "").lower()


def test_get_red_flags_fires_R1_stemi():
    out = tool_get_red_flags(
        symptoms=["chest_pain", "radiation_arm", "diaphoresis"],
        age=67, sex="M", history=["diabetes"], vitals={},
    )
    rule_ids = {f["rule_id"] for f in out["flags"]}
    assert "R1_STEMI" in rule_ids
    assert out["force_escalation"] is True
    assert out["force_level"] == "Emergency Room"


def test_compute_esi_high_severity_returns_esi_1_or_2():
    out = tool_compute_esi(
        symptoms=["chest_pain"], age=60,
        vitals={"spo2": 88}, patient_text="severe chest pain",
    )
    assert out["esi_level"] in (1, 2)
    assert out["care_level"] == "Emergency Room"


def test_imci_lookup_flags_high_fever_child():
    out = tool_imci_lookup(
        age_months=36,
        symptoms=["high_fever", "lethargy"],
        vitals={"temp_c": 39.5},
    )
    assert out["recommendation"] == "Emergency Room"
    assert "high_fever" in out["danger_signs"]
    assert "WHO IMCI" in out["citation"]


def test_rag_retrieve_returns_relevant_snippet():
    out = tool_rag_retrieve(
        query="severe chest pain",
        symptom_tokens=["chest_pain"],
        k=3,
    )
    assert out["snippets"]
    ids = {s["id"] for s in out["snippets"]}
    assert "who_acs_1" in ids


def test_invoke_unknown_tool_returns_error_not_raise():
    out = invoke("not_a_tool", {})
    assert "error" in out


def test_invoke_bad_args_returns_error_not_raise():
    out = invoke("extract_symptoms", {"this": "is wrong"})
    assert "error" in out


# ─── Synthetic orchestrator — full pipeline without Gemini ────────────────
def test_synthetic_orchestrator_runs_canonical_sequence_for_chest_pain():
    v = orchestrate_synthetic(
        "severe chest pain radiating to left arm and sweating",
        age=67, sex="M", history=["diabetes"],
    )
    assert v.level == "Emergency Room"
    names = [tc.name for tc in v.tool_calls]
    # extract → red_flags → (since they fired) rag_retrieve, ESI/IMCI skipped
    assert names[0] == "extract_symptoms"
    assert "get_red_flags" in names
    assert "rag_retrieve" in names


def test_synthetic_orchestrator_runs_all_five_for_non_emergency():
    v = orchestrate_synthetic("runny nose mild sore throat 2 days", age=30, sex="F")
    names = [tc.name for tc in v.tool_calls]
    assert names == ["extract_symptoms", "get_red_flags", "compute_esi", "rag_retrieve"]
    assert v.level == "Home Care"


def test_synthetic_orchestrator_calls_imci_for_children():
    # Mild pediatric presentation — must NOT fire R6 (so the pipeline
    # reaches step 4 imci_lookup instead of short-circuiting at step 2).
    v = orchestrate_synthetic(
        "my child has mild diarrhea for 1 day",
        age=3, sex="M",
    )
    names = [tc.name for tc in v.tool_calls]
    assert "imci_lookup" in names


def test_synthetic_orchestrator_short_circuits_to_rag_on_pediatric_danger():
    # When R6 fires, AGENTIC_TOOLS.md says "skip to step 7 (rag_retrieve)".
    v = orchestrate_synthetic(
        "my child has fever 39.5 and is lethargic",
        age=3, sex="M",
    )
    names = [tc.name for tc in v.tool_calls]
    assert "get_red_flags" in names
    assert "rag_retrieve" in names
    assert v.level == "Emergency Room"


def test_synthetic_orchestrator_always_has_citation():
    v = orchestrate_synthetic("chest pain", age=40)
    assert v.citations
    assert v.citations[0]["source"]


def test_synthetic_orchestrator_suicidal_returns_helplines():
    v = orchestrate_synthetic("I don't want to live anymore", age=22)
    assert v.level == "Emergency Room"
    assert "9152987821" in v.reasoning
    assert v.refusal_category == "suicidal_ideation"


def test_synthetic_orchestrator_drug_dosing_refuses():
    v = orchestrate_synthetic("give me 5mg alprazolam for anxiety")
    assert v.level == "Clinic Visit"
    assert v.refusal_category == "drug_dosing"


def test_synthetic_orchestrator_non_medical_refuses():
    v = orchestrate_synthetic("what is the capital of france")
    assert v.refusal_category == "non_medical"


# ─── The safety property — the line that wins Q&A ─────────────────────────
def _fake_red_flag_verdict_with_llm_downgrade() -> Verdict:
    """Simulate the worst case: tools fired ER, but the 'LLM' returned Home Care."""
    from app.agentic.orchestrator import ToolCall
    v = Verdict(
        level="Home Care",  # WRONG — the LLM's lie
        reasoning="It's fine, stay home.",
        red_flags=[{"rule_id": "R1_STEMI", "force_level": "Emergency Room"}],
        esi=1,
        confidence=0.99,
        citations=[],
        disclaimer="",
    )
    v.tool_calls = [
        ToolCall("get_red_flags", {}, {
            "flags": [{"rule_id": "R1_STEMI", "force_level": "Emergency Room"}],
            "force_escalation": True,
            "force_level": "Emergency Room",
        }),
        ToolCall("compute_esi", {}, {
            "esi_level": 1, "care_level": "Emergency Room", "severity": 0.9,
        }),
    ]
    return v


def test_safety_property_overrides_llm_downgrade_to_home_care():
    v = _fake_red_flag_verdict_with_llm_downgrade()
    assert v.level == "Home Care"  # before
    v = enforce_safety_property(v)
    assert v.level == "Emergency Room"  # after
    assert v.safety_override is True


def test_safety_property_keeps_emergency_room():
    from app.agentic.orchestrator import ToolCall
    v = Verdict(
        level="Emergency Room", reasoning="", red_flags=[],
        esi=1, confidence=1.0, citations=[], disclaimer="",
    )
    v.tool_calls = [
        ToolCall("get_red_flags", {}, {
            "flags": [{"rule_id": "R1_STEMI", "force_level": "Emergency Room"}],
            "force_escalation": True, "force_level": "Emergency Room",
        }),
    ]
    v = enforce_safety_property(v)
    assert v.level == "Emergency Room"
    assert v.safety_override is False


def test_safety_property_no_tools_is_noop():
    v = Verdict(
        level="Home Care", reasoning="", red_flags=[],
        esi=None, confidence=None, citations=[], disclaimer="",
    )
    v = enforce_safety_property(v)
    assert v.level == "Home Care"


# ─── Public orchestrate() entry point honours AGENTIC_MODE ────────────────
def test_orchestrate_uses_synthetic_when_mode_synthetic(monkeypatch):
    monkeypatch.setenv("AGENTIC_MODE", "synthetic")
    v = asyncio.run(orchestrate("chest pain", age=50))
    names = [tc.name for tc in v.tool_calls]
    # Synthetic always records tool calls; Gemini path may not in test env.
    assert names


def test_orchestrate_falls_back_to_synthetic_without_gemini_key(monkeypatch):
    monkeypatch.setenv("AGENTIC_MODE", "gemini")
    monkeypatch.delenv("GEMINI_API_KEY", raising=False)
    v = asyncio.run(orchestrate("chest pain", age=50))
    # Without a key, the gemini orchestrator falls through to synthetic.
    assert v.tool_calls
    assert v.level in {"Emergency Room", "Clinic Visit", "Home Care"}


# ─── Gemini integration (only runs when GEMINI_API_KEY is set) ────────────
@pytest.mark.skipif(
    not os.getenv("GEMINI_API_KEY"),
    reason="GEMINI_API_KEY not set — skipping live Gemini test",
)
def test_gemini_orchestrator_returns_emergency_room_for_chest_pain():
    os.environ["AGENTIC_MODE"] = "gemini"
    v = asyncio.run(orchestrate(
        "severe chest pain radiating to left arm and sweating",
        age=67, sex="M", history=["diabetes"],
    ))
    assert v.level == "Emergency Room"
