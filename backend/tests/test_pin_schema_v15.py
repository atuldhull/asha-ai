"""Plan 6.1-B — Symptom Cinema Pin v1 + v1.5 schema tests.

Covers:
  1. Plan 4.0 / 5.x payloads (no structured_symptoms) still validate.
  2. Plan 3.0 v1 Pin payloads (no v1.5 fields) validate.
  3. Plan 6.1 v1.5 Pin payloads (with fma_id, mesh_position_3d, layer_visible)
     validate.
  4. Plan 6.1 body_view union accepts "left", "right", "interior".
  5. extract_symptoms tool injects FMA-aligned anatomical context when
     a Pin with fma_id is provided.
  6. body_map.validate_fma graceful-no-ops when regions.yaml is absent.
"""
from __future__ import annotations

from app.agentic.tools import tool_extract_symptoms
from app.models.triage import Pin, TriageRequest


def test_plan4_payload_without_pins_validates():
    req = TriageRequest(symptoms="cough and mild fever for 2 days", age=30)
    assert req.structured_symptoms is None
    assert req.input_mode is None


def test_v1_pin_payload_validates():
    """A Plan 3.0 Symptom Cinema v1 pin (no v1.5 fields) is accepted."""
    pin = Pin(
        body_region="chest_left_anterior",
        body_view="front",
        x=0.5,
        y=0.5,
        intensity=7,
        quality=["pressure"],
        duration_band="few_hours",
        aggravators=["nothing"],
    )
    req = TriageRequest(
        symptoms="chest pressure for a couple hours",
        structured_symptoms=[pin],
        input_mode="body_map",
    )
    assert req.structured_symptoms is not None
    assert req.structured_symptoms[0].fma_id is None
    assert req.structured_symptoms[0].layer_visible is None


def test_v15_pin_payload_validates():
    """A Plan 6.1 Pin with fma_id + mesh_position_3d + layer_visible."""
    pin = Pin(
        body_region="chest_left_anterior",
        body_view="front",
        x=0.5,
        y=0.5,
        intensity=8,
        quality=["pressure", "burning"],
        duration_band="just_started",
        aggravators=["nothing"],
        fma_id="FMA:43799",
        mesh_position_3d=(0.1, 0.4, 0.05),
        layer_visible="skin",
    )
    req = TriageRequest(
        symptoms="severe chest pressure",
        structured_symptoms=[pin],
        input_mode="body_map_3d",
    )
    assert req.structured_symptoms[0].fma_id == "FMA:43799"
    assert req.structured_symptoms[0].layer_visible == "skin"
    assert req.input_mode == "body_map_3d"


def test_v15_body_view_union_accepts_new_values():
    """v1.5 extends body_view with left, right, interior."""
    for view in ("left", "right", "interior"):
        pin = Pin(
            body_region="thigh_lower_back_left",
            body_view=view,  # type: ignore[arg-type]
            x=0.5,
            y=0.5,
            intensity=4,
            quality=["throbbing"],
            duration_band="since_yesterday",
            aggravators=["moving"],
        )
        assert pin.body_view == view


def test_extract_symptoms_injects_fma_context_when_pin_has_fma_id():
    """Pin v1.5 fma_id should appear in the tool's anatomical_context."""
    result = tool_extract_symptoms(
        patient_text="chest pressure for an hour",
        language="en",
        pins=[
            {
                "body_region": "chest_left_anterior",
                "body_view": "front",
                "fma_id": "FMA:43799",
            }
        ],
    )
    ctx = result.get("anatomical_context")
    assert ctx is not None
    assert "FMA:43799" in ctx
    assert "Anatomical region" in ctx


def test_extract_symptoms_no_fma_context_when_pins_absent():
    result = tool_extract_symptoms(patient_text="chest pressure", language="en")
    assert result.get("anatomical_context") is None


def test_agentic_orchestrator_passes_pins_to_extract_symptoms():
    """End-to-end: agentic-mode /triage with structured_symptoms carrying
    fma_id MUST reach tool_extract_symptoms with the pins arg so the
    anatomical_context block makes it into the LLM prompt.

    INTEGRATION_6.1 gate #32 ("Pin v1.5 carries FMA into LLM") relies
    on this path being wired.
    """
    from app.agentic.orchestrator import orchestrate_synthetic

    verdict = orchestrate_synthetic(
        patient_text="chest pressure for an hour",
        age=62,
        sex="M",
        history=["diabetes"],
        pins=[
            {
                "body_region": "chest_left_anterior",
                "body_view": "front",
                "x": 0.5, "y": 0.5,
                "intensity": 7,
                "quality": ["pressure"],
                "duration_band": "few_hours",
                "aggravators": ["nothing"],
                "fma_id": "FMA:43799",
                "layer_visible": "skin",
            }
        ],
    )
    # Find the extract_symptoms tool call in the trace; its args MUST
    # include pins and its result MUST carry anatomical_context.
    extract_calls = [tc for tc in verdict.tool_calls if tc.name == "extract_symptoms"]
    assert extract_calls, "extract_symptoms was not invoked"
    tc = extract_calls[0]
    assert "pins" in tc.args
    assert tc.args["pins"][0]["fma_id"] == "FMA:43799"
    assert tc.result.get("anatomical_context") is not None
    assert "FMA:43799" in tc.result["anatomical_context"]


def test_body_map_validator_active_or_graceful():
    """validate_fma either:
      (a) graceful no-op when no regions.{json,yaml} is loaded, OR
      (b) active validation when regions data has been synced from
          Role A's regions.ts (via backend/scripts/sync_regions.py).

    Both states are acceptable — the spec says fma mismatches log a
    warning, never reject the payload. Empty-fma_id always passes.
    """
    from app.triage_logic.body_map import _regions, validate_fma

    # Empty fma_id always passes (Plan 4.0 / 5.x clients send no fma_id).
    assert validate_fma("any_region", None) is True
    assert validate_fma("any_region", "") is True

    if _regions():
        # Active mode (regions.json synced): a known region with the
        # right fma matches; a mismatched fma is False (and logged).
        assert validate_fma("chest_left_anterior", "FMA:43799") is True
        assert validate_fma("chest_left_anterior", "FMA:WRONG") is False
    else:
        # Graceful no-op mode: any fma_id passes.
        assert validate_fma("any_region", "FMA:43799") is True
