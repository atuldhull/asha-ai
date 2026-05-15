"""Orchestrator — the LLM is forced to call our 5 deterministic tools.

Two implementations behind the same `orchestrate()` interface:

- `orchestrate_via_gemini`: Real Gemini 2.5 function-calling. Used when
  `GEMINI_API_KEY` is set and `AGENTIC_MODE=on`.

- `orchestrate_synthetic`: A deterministic fallback that runs the same
  5 tools in the canonical sequence WITHOUT an LLM. Produces an
  identical Verdict shape and a tool_calls trace. Used when the
  Gemini SDK is unavailable or `AGENTIC_MODE=synthetic`. Lets unit
  tests + offline demos still produce a structured-tool-call audit
  trail.

The Verdict object always passes through `enforce_safety_property()`
after orchestration:

    final_level = max(red_flags.force_level, esi.care_level, imci.recommendation)

Rule layer ESCALATES; LLM cannot downgrade.
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
from dataclasses import dataclass, field
from typing import Any

from app.agentic.tools import (
    TOOL_DECLARATIONS,
    invoke as tool_invoke,
    tool_compute_esi,
    tool_extract_symptoms,
    tool_get_red_flags,
    tool_imci_lookup,
    tool_rag_retrieve,
)
from app.core.disclaimers import DISCLAIMER, MENTAL_HEALTH_HELPLINES
from app.core.safety import detect_refusal_category
from app.triage_logic.extract import parse_history, parse_vitals_string

logger = logging.getLogger(__name__)

_LEVEL_RANK = {"Home Care": 0, "Clinic Visit": 1, "Emergency Room": 2}
_MAX_TURNS = 8


@dataclass
class ToolCall:
    name: str
    args: dict[str, Any]
    result: dict[str, Any] = field(default_factory=dict)


@dataclass
class Verdict:
    level: str
    reasoning: str
    red_flags: list[dict[str, Any]]
    esi: int | None
    confidence: float | None
    citations: list[dict[str, Any]]
    disclaimer: str
    tool_calls: list[ToolCall] = field(default_factory=list)
    safety_override: bool = False
    refusal_category: str | None = None

    def as_dict(self) -> dict[str, Any]:
        return {
            "level": self.level,
            "reasoning": self.reasoning,
            "red_flags": self.red_flags,
            "esi": self.esi,
            "confidence": self.confidence,
            "citations": self.citations,
            "disclaimer": self.disclaimer,
            "tool_calls": [
                {"name": t.name, "args": t.args, "result": t.result}
                for t in self.tool_calls
            ],
            "safety_override": self.safety_override,
            "refusal_category": self.refusal_category,
        }


# ─── Safety property — runs after every orchestration ─────────────────────
def enforce_safety_property(verdict: Verdict) -> Verdict:
    """Lock the final level to max(rule layer, ML/ESI layer, IMCI)."""
    candidates: list[str] = []
    rule_call = next((t for t in verdict.tool_calls if t.name == "get_red_flags"), None)
    if rule_call:
        force = rule_call.result.get("force_level")
        if force:
            candidates.append(force)
        for f in rule_call.result.get("flags", []):
            if f.get("force_level"):
                candidates.append(f["force_level"])

    esi_call = next((t for t in verdict.tool_calls if t.name == "compute_esi"), None)
    if esi_call:
        care = esi_call.result.get("care_level")
        if care:
            candidates.append(care)

    imci_call = next((t for t in verdict.tool_calls if t.name == "imci_lookup"), None)
    if imci_call:
        rec = imci_call.result.get("recommendation")
        if rec:
            candidates.append(rec)

    if not candidates:
        return verdict

    highest = max(candidates, key=lambda c: _LEVEL_RANK.get(c, 0))
    if _LEVEL_RANK.get(highest, 0) > _LEVEL_RANK.get(verdict.level, 0):
        logger.info(
            "Safety property fired: LLM said %r, tools say %r — escalating.",
            verdict.level, highest,
        )
        verdict.level = highest
        verdict.safety_override = True
    return verdict


# ─── Refusal short-circuit (works in both orchestrators) ──────────────────
def _refusal_verdict(category: str) -> Verdict | None:
    if category == "suicidal_ideation":
        icall = MENTAL_HEALTH_HELPLINES["iCall"]
        vandrevala = MENTAL_HEALTH_HELPLINES["Vandrevala Foundation"]
        return Verdict(
            level="Emergency Room",
            reasoning=(
                f"You are not alone — please reach out right now. "
                f"iCall: {icall}. Vandrevala Foundation: {vandrevala}. "
                "If you are in immediate danger, go to an emergency room "
                "or call 112."
            ),
            red_flags=[{
                "rule_id": "R9_SUICIDAL",
                "rule_name": "Suicidal ideation / self-harm intent",
                "force_level": "Emergency Room",
                "citation": "RED_FLAGS.md Rule 9",
            }],
            esi=1,
            confidence=1.0,
            citations=[{
                "id": "mh_helplines_india",
                "source": "MoHFW Mental Health Helpline Directory",
                "section": "§National helplines",
                "text": (
                    f"iCall {icall}; Vandrevala Foundation {vandrevala}. "
                    "Emergency: 112 or 108."
                ),
                "score": 1.0,
            }],
            disclaimer=DISCLAIMER,
            refusal_category="suicidal_ideation",
        )
    if category == "drug_dosing":
        return Verdict(
            level="Clinic Visit",
            reasoning=(
                "I cannot provide medication dosing. Please consult a "
                "registered medical practitioner for any prescription or "
                "dosage questions."
            ),
            red_flags=[],
            esi=None,
            confidence=None,
            citations=[],
            disclaimer=DISCLAIMER,
            refusal_category="drug_dosing",
        )
    if category == "non_medical":
        return Verdict(
            level="Clinic Visit",
            reasoning="ASHA-AI only handles medical triage.",
            red_flags=[],
            esi=None,
            confidence=None,
            citations=[],
            disclaimer=DISCLAIMER,
            refusal_category="non_medical",
        )
    return None


# ─── Compose the final Verdict from the executed tool calls ───────────────
def _compose_verdict_from_calls(
    calls: list[ToolCall],
    *,
    patient_text: str,
    initial_level_hint: str | None = None,
) -> Verdict:
    rule_call = next((c for c in calls if c.name == "get_red_flags"), None)
    esi_call = next((c for c in calls if c.name == "compute_esi"), None)
    imci_call = next((c for c in calls if c.name == "imci_lookup"), None)
    rag_call = next((c for c in calls if c.name == "rag_retrieve"), None)

    red_flags = list((rule_call.result.get("flags") if rule_call else []) or [])
    esi = esi_call.result.get("esi_level") if esi_call else None
    severity = esi_call.result.get("severity") if esi_call else None
    citations = list((rag_call.result.get("snippets") if rag_call else []) or [])

    levels: list[str] = []
    if rule_call and rule_call.result.get("force_level"):
        levels.append(rule_call.result["force_level"])
    if esi_call and esi_call.result.get("care_level"):
        levels.append(esi_call.result["care_level"])
    if imci_call and imci_call.result.get("recommendation"):
        levels.append(imci_call.result["recommendation"])
    if initial_level_hint:
        levels.append(initial_level_hint)
    if not levels:
        levels.append("Clinic Visit")
    final = max(levels, key=lambda c: _LEVEL_RANK.get(c, 0))

    if red_flags:
        reasoning = red_flags[0].get("reasoning") or (
            "Red-flag rule fired — go to an emergency room now."
        )
    elif final == "Emergency Room":
        reasoning = (
            "Symptoms include high-severity features — go to an emergency "
            "room for urgent evaluation."
        )
    elif final == "Clinic Visit":
        reasoning = (
            "Symptoms don't clearly indicate home care or an emergency. "
            "See a clinician within 24-48 hours."
        )
    else:
        reasoning = (
            "No red-flag features detected. Monitor symptoms at home; "
            "re-run triage if anything worsens."
        )

    if not citations:
        # Guardrail: every verdict carries >=1 citation.
        citations = [{
            "id": "general_advice",
            "source": "ASHA-AI Decision Support",
            "section": "§Patient-facing",
            "text": (
                "ASHA-AI provides triage support only. Always go in person "
                "if symptoms worsen or you are unsure."
            ),
            "score": 0.0,
        }]

    return Verdict(
        level=final,
        reasoning=reasoning,
        red_flags=red_flags,
        esi=esi,
        confidence=severity,
        citations=citations,
        disclaimer=DISCLAIMER,
        tool_calls=calls,
    )


# ─── Synthetic orchestrator — deterministic, no LLM ───────────────────────
def orchestrate_synthetic(
    patient_text: str,
    age: int | None = None,
    sex: str | None = None,
    history: list[str] | str | None = None,
    vitals: dict | str | None = None,
    language: str = "en",
) -> Verdict:
    """Run the 5 tools in the canonical AGENTIC_TOOLS.md sequence."""
    refusal = detect_refusal_category(patient_text or "")
    if refusal:
        v = _refusal_verdict(refusal)
        if v is not None:
            return v

    calls: list[ToolCall] = []

    # Step 1 — extract_symptoms
    extract_args = {"patient_text": patient_text, "language": language}
    extract_res = tool_extract_symptoms(**extract_args)
    calls.append(ToolCall("extract_symptoms", extract_args, extract_res))
    tokens = [s["name"] for s in extract_res.get("symptoms", [])]
    derived_age = age
    is_child = extract_res.get("is_child", False)

    # Normalise history + vitals once.
    hist_tokens = list(parse_history(history))
    if isinstance(vitals, str):
        vitals_dict = parse_vitals_string(vitals)
    else:
        vitals_dict = dict(vitals or {})

    # Step 2 — get_red_flags
    rf_args: dict[str, Any] = {
        "symptoms": tokens, "age": derived_age, "sex": sex,
        "history": hist_tokens, "vitals": vitals_dict,
    }
    rf_res = tool_get_red_flags(**rf_args)
    calls.append(ToolCall("get_red_flags", rf_args, rf_res))

    if rf_res.get("force_escalation"):
        # Even on escalation we still call rag_retrieve for citations.
        rag_args = {"query": patient_text, "symptom_tokens": tokens, "k": 3}
        rag_res = tool_rag_retrieve(**rag_args)
        calls.append(ToolCall("rag_retrieve", rag_args, rag_res))
        verdict = _compose_verdict_from_calls(
            calls, patient_text=patient_text,
            initial_level_hint="Emergency Room",
        )
        return enforce_safety_property(verdict)

    # Step 3 — compute_esi
    esi_args = {
        "symptoms": tokens, "age": derived_age,
        "vitals": vitals_dict, "patient_text": patient_text,
    }
    esi_res = tool_compute_esi(**esi_args)
    calls.append(ToolCall("compute_esi", esi_args, esi_res))

    # Step 4 — imci_lookup (children only)
    if is_child or (derived_age is not None and derived_age < 5):
        age_months = (derived_age or 0) * 12
        imci_args = {
            "age_months": age_months,
            "symptoms": tokens,
            "vitals": vitals_dict,
        }
        imci_res = tool_imci_lookup(**imci_args)
        calls.append(ToolCall("imci_lookup", imci_args, imci_res))

    # Step 5 — rag_retrieve
    rag_args = {"query": patient_text, "symptom_tokens": tokens, "k": 3}
    rag_res = tool_rag_retrieve(**rag_args)
    calls.append(ToolCall("rag_retrieve", rag_args, rag_res))

    verdict = _compose_verdict_from_calls(calls, patient_text=patient_text)
    return enforce_safety_property(verdict)


# ─── Gemini orchestrator — real LLM function-calling ──────────────────────
SYSTEM_PROMPT = """You are ASHA-AI, a triage assistant. You DO NOT diagnose or
prescribe — per India Telemedicine Practice Guidelines 2020, your role is
decision support for a registered medical practitioner.

You have access to 5 tools. You MUST call them in this order:
  1. extract_symptoms(patient_text, language)
  2. If extract_symptoms.needs_followup is true, ask ONE specific
     follow-up question. Otherwise continue.
  3. get_red_flags(symptoms, age, sex, history, vitals)
  4. If get_red_flags.force_escalation is true, skip to step 7.
  5. compute_esi(symptoms, vitals, age, patient_text)
  6. If patient age < 5, also call imci_lookup(age_months, symptoms, vitals).
  7. rag_retrieve(query, symptom_tokens, k=3) to ground the verdict.
  8. Compose the verdict using the safety property:
       final_care_level = max(
         red_flags.force_level,
         esi.care_level,
         imci.recommendation
       )
     where Emergency Room > Clinic Visit > Home Care.

You MUST NOT:
  - Provide medication dosing
  - Diagnose specific diseases
  - Recommend prescription drugs
  - Use the words "I diagnose" or "you have [disease]"

When you encounter:
  - Drug dosing request → refuse + suggest consulting a doctor
  - Suicidal ideation → return Emergency Room + iCall 9152987821 +
    Vandrevala 1860-2662-345
  - Non-medical query → politely refuse

When you have called all required tools, output ONLY a JSON object with
this shape (no markdown, no prose):
  {"level": "Home Care|Clinic Visit|Emergency Room",
   "reasoning": "...one sentence patient-facing..."}

Always remember the disclaimer:
  "This is not a replacement for professional medical diagnosis."
"""


def _gemini_available() -> bool:
    if not os.getenv("GEMINI_API_KEY", "").strip():
        return False
    try:
        import google.generativeai  # noqa: F401
        return True
    except Exception:
        return False


async def orchestrate_via_gemini(
    patient_text: str,
    age: int | None = None,
    sex: str | None = None,
    history: list[str] | str | None = None,
    vitals: dict | str | None = None,
    language: str = "en",
) -> Verdict:
    """Real Gemini function-calling orchestrator."""
    refusal = detect_refusal_category(patient_text or "")
    if refusal:
        v = _refusal_verdict(refusal)
        if v is not None:
            return v

    if not _gemini_available():
        logger.info("Gemini unavailable — falling back to synthetic orchestrator.")
        return orchestrate_synthetic(
            patient_text, age=age, sex=sex,
            history=history, vitals=vitals, language=language,
        )

    import google.generativeai as genai

    genai.configure(api_key=os.environ["GEMINI_API_KEY"])
    model_name = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")

    tool_spec = genai.protos.Tool(
        function_declarations=[
            genai.protos.FunctionDeclaration(
                name=d["name"],
                description=d["description"],
                parameters=genai.protos.Schema(**_schema_to_proto(d["parameters"])),
            )
            for d in TOOL_DECLARATIONS
        ]
    )

    model = genai.GenerativeModel(
        model_name,
        tools=[tool_spec],
        system_instruction=SYSTEM_PROMPT,
    )

    initial_msg = (
        f"Patient: {patient_text}\n"
        f"Age: {age if age is not None else 'unknown'}\n"
        f"Sex: {sex or 'unknown'}\n"
        f"History: {history!r}\n"
        f"Vitals: {vitals!r}\n"
        f"Language: {language}\n"
    )

    chat = model.start_chat(enable_automatic_function_calling=False)
    calls: list[ToolCall] = []

    try:
        response = await asyncio.to_thread(chat.send_message, initial_msg)
    except Exception as exc:
        logger.warning("Gemini initial call failed (%s) — falling back.", exc)
        return orchestrate_synthetic(
            patient_text, age=age, sex=sex,
            history=history, vitals=vitals, language=language,
        )

    final_level_hint: str | None = None
    final_reasoning: str | None = None

    for _ in range(_MAX_TURNS):
        try:
            parts = response.candidates[0].content.parts
        except (IndexError, AttributeError):
            break
        if not parts:
            break

        fc_parts = [p.function_call for p in parts if getattr(p, "function_call", None) and p.function_call.name]
        if not fc_parts:
            # Final assistant text — try to parse the JSON verdict.
            text = getattr(response, "text", "") or ""
            parsed = _parse_verdict_json(text)
            if parsed:
                final_level_hint = parsed.get("level") or final_level_hint
                final_reasoning = parsed.get("reasoning") or final_reasoning
            break

        # Execute every function call in this turn.
        fr_parts: list[Any] = []
        for fc in fc_parts:
            args = _proto_to_dict(fc.args)
            result = tool_invoke(fc.name, args)
            calls.append(ToolCall(fc.name, args, result))
            fr_parts.append(
                genai.protos.Part(
                    function_response=genai.protos.FunctionResponse(
                        name=fc.name,
                        response={"result": result},
                    )
                )
            )

        try:
            response = await asyncio.to_thread(
                chat.send_message,
                genai.protos.Content(role="user", parts=fr_parts),
            )
        except Exception as exc:
            logger.warning("Gemini follow-up failed (%s) — composing from calls.", exc)
            break

    verdict = _compose_verdict_from_calls(
        calls, patient_text=patient_text,
        initial_level_hint=final_level_hint,
    )
    if final_reasoning:
        verdict.reasoning = final_reasoning
    return enforce_safety_property(verdict)


def _schema_to_proto(schema: dict) -> dict:
    """Convert a JSON-schema-style dict to genai.protos.Schema kwargs."""
    out: dict[str, Any] = {}
    t = schema.get("type")
    if t:
        out["type_"] = _PROTO_TYPE.get(t, 0)
    if "description" in schema:
        out["description"] = schema["description"]
    if "enum" in schema:
        out["enum"] = list(schema["enum"])
    if "properties" in schema:
        out["properties"] = {
            k: _proto_property(v) for k, v in schema["properties"].items()
        }
    if "required" in schema:
        out["required"] = list(schema["required"])
    if "items" in schema:
        out["items"] = _proto_property(schema["items"])
    return out


def _proto_property(prop: dict):
    import google.generativeai as genai
    return genai.protos.Schema(**_schema_to_proto(prop))


_PROTO_TYPE = {
    "string": 1,
    "number": 2,
    "integer": 3,
    "boolean": 4,
    "array": 5,
    "object": 6,
}


def _proto_to_dict(args) -> dict[str, Any]:
    """Convert a Gemini protobuf args Struct to a plain dict."""
    try:
        return {k: _proto_value(v) for k, v in args.items()}
    except Exception:
        try:
            return dict(args)
        except Exception:
            return {}


def _proto_value(v):
    if hasattr(v, "items"):
        return {k: _proto_value(x) for k, x in v.items()}
    if isinstance(v, (list, tuple)):
        return [_proto_value(x) for x in v]
    return v


def _parse_verdict_json(text: str) -> dict | None:
    if not text:
        return None
    s = text.strip()
    # Strip markdown fences if present.
    if s.startswith("```"):
        s = s.split("\n", 1)[-1]
        if s.endswith("```"):
            s = s[:-3]
    try:
        return json.loads(s)
    except json.JSONDecodeError:
        # Try to find a JSON object substring.
        start = s.find("{")
        end = s.rfind("}")
        if start != -1 and end != -1 and end > start:
            try:
                return json.loads(s[start : end + 1])
            except json.JSONDecodeError:
                return None
    return None


# ─── Public entry point ───────────────────────────────────────────────────
async def orchestrate(
    patient_text: str,
    age: int | None = None,
    sex: str | None = None,
    history: list[str] | str | None = None,
    vitals: dict | str | None = None,
    language: str = "en",
) -> Verdict:
    """Choose the orchestrator based on AGENTIC_MODE env var.

    AGENTIC_MODE values:
      - 'off' / unset   — caller should NOT use this orchestrator
        (still works, but the /triage router will skip to legacy path)
      - 'synthetic'     — deterministic, no Gemini call (good for CI)
      - 'gemini' / 'on' — real Gemini function-calling, falls back to
                          synthetic if the SDK or API key is missing
    """
    mode = os.getenv("AGENTIC_MODE", "off").lower()
    if mode == "synthetic":
        return orchestrate_synthetic(
            patient_text, age=age, sex=sex,
            history=history, vitals=vitals, language=language,
        )
    if mode in {"gemini", "on", "true", "1"}:
        return await orchestrate_via_gemini(
            patient_text, age=age, sex=sex,
            history=history, vitals=vitals, language=language,
        )
    # Default: synthetic path, so callers that explicitly opt in via
    # router code always get a structured tool_calls trace.
    return orchestrate_synthetic(
        patient_text, age=age, sex=sex,
        history=history, vitals=vitals, language=language,
    )


def is_enabled() -> bool:
    return os.getenv("AGENTIC_MODE", "off").lower() in {
        "on", "true", "1", "gemini", "synthetic",
    }
