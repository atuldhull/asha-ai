"""The 5 deterministic tools the agentic layer is forced to call.

Each tool is a pure adapter over an existing Plan 2.0/3.0 module —
no duplicate logic. Schemas mirror docs/AGENTIC_TOOLS.md verbatim.

Tools never raise on bad input; they degrade to safe defaults.
"""
from __future__ import annotations

import logging
from typing import Any

from app.ml.featurize import extract_symptoms as _extract_text
from app.ml.featurize import featurize as _featurize
from app.rag.retriever import retrieve as _rag_retrieve
from app.triage_logic.esi import esi_from_severity, level_from_esi
from app.triage_logic.extract import parse_history, parse_vitals_string
from app.triage_logic.red_flags import get_red_flags as _get_red_flags
from app.triage_logic.severity import compute_severity

logger = logging.getLogger(__name__)


# ─── Tool 1 — extract_symptoms ────────────────────────────────────────────
EXTRACT_SYMPTOMS_DECL = {
    "name": "extract_symptoms",
    "description": (
        "Parse free-text patient input into structured symptoms with "
        "severity, duration, and modifiers. Detects vague-presentation "
        "patterns (e.g. stroke FAST hidden in 'arm heavy + confused')."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "patient_text": {"type": "string"},
            "language": {"type": "string", "enum": ["en", "hi", "kn"]},
            "pins": {
                "type": "array",
                "description": (
                    "Optional Symptom Cinema pins (body-map taps). When "
                    "provided, FMA-coded anatomical context is injected "
                    "into the symptom-extraction prompt."
                ),
                "items": {"type": "object"},
            },
        },
        "required": ["patient_text"],
    },
}


def _anatomical_context_from_pins(pins: list[dict] | None) -> str:
    """Build an FMA-aligned anatomical context block when Pin v1.5 fma_id
    is present. Empty string when pins are absent or carry no fma_id.

    Format (one line per pin with fma_id):
      "Anatomical region: <clinical_term> (FMA: <fma_id>)"
    """
    if not pins:
        return ""
    from app.triage_logic.body_map import clinical_term_for, validate_fma

    lines: list[str] = []
    for pin in pins:
        fma_id = pin.get("fma_id")
        body_region = pin.get("body_region")
        if not fma_id or not body_region:
            continue
        validate_fma(body_region, fma_id)  # logs warning on mismatch
        clinical_term = clinical_term_for(body_region) or body_region
        lines.append(f"Anatomical region: {clinical_term} (FMA: {fma_id})")
    return "\n".join(lines)


def tool_extract_symptoms(
    patient_text: str,
    language: str = "en",
    pins: list[dict] | None = None,
) -> dict[str, Any]:
    anatomical_context = _anatomical_context_from_pins(pins)
    enriched_text = patient_text or ""
    if anatomical_context:
        # The LLM sees the FMA context as part of its symptom-extraction
        # input. Free-text extractor (regex tokens) sees only the original
        # patient_text so it doesn't accidentally match "fma" or
        # "anatomical" as symptom tokens.
        enriched_text = f"{patient_text}\n\n[Body-map context]\n{anatomical_context}"

    tokens = _extract_text(patient_text or "")
    feats = _featurize(patient_text or "")
    needs_followup = False
    followup_hint: str | None = None
    fast_tokens = {"arm_weakness", "sudden_confusion", "face_droop", "slurred_speech"}
    if (set(tokens) & fast_tokens) and "face_droop" not in tokens:
        needs_followup = True
        followup_hint = (
            "Is one side of the face drooping? Can the person raise both "
            "arms? Are their words clear? When did this start?"
        )
    return {
        "symptoms": [{"name": t, "severity": "moderate", "duration_hours": None, "modifiers": []} for t in tokens],
        "needs_followup": needs_followup,
        "followup_hint": followup_hint,
        "confidence": 0.6 if tokens else 0.1,
        "duration_days": feats.get("duration_days"),
        "is_child": feats.get("is_child", False),
        "is_pregnant": feats.get("is_pregnant", False),
        "language": language,
        "anatomical_context": anatomical_context or None,
    }


# ─── Tool 2 — get_red_flags ───────────────────────────────────────────────
GET_RED_FLAGS_DECL = {
    "name": "get_red_flags",
    "description": (
        "Apply the 9 deterministic clinical red-flag rules. Returns flags "
        "that, if present, force Emergency Room triage. Can only escalate, "
        "never downgrade."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "symptoms": {"type": "array", "items": {"type": "string"}},
            "age": {"type": "integer"},
            "sex": {"type": "string", "enum": ["M", "F", "other"]},
            "history": {"type": "array", "items": {"type": "string"}},
            "vitals": {"type": "object"},
        },
        "required": ["symptoms", "age"],
    },
}


def tool_get_red_flags(
    symptoms: list[str],
    age: int | None = None,
    sex: str | None = None,
    history: list[str] | str | None = None,
    vitals: dict | str | None = None,
) -> dict[str, Any]:
    hist_tokens = parse_history(history) if not isinstance(history, set) else history
    if isinstance(vitals, str):
        vitals_dict = parse_vitals_string(vitals)
    else:
        vitals_dict = dict(vitals or {})
    result = _get_red_flags(
        symptoms=set(symptoms or []),
        age=age,
        sex=sex,
        history=hist_tokens,
        vitals=vitals_dict,
    )
    return {
        "flags": [
            {
                "rule_id": f.rule_id,
                "rule_name": f.rule_name,
                "force_level": f.force_level,
                "reasoning": f.reasoning,
                "citation": f.citation,
            }
            for f in result.flags
        ],
        "force_escalation": result.force_escalation,
        "force_level": result.force_level,
    }


# ─── Tool 3 — compute_esi ─────────────────────────────────────────────────
COMPUTE_ESI_DECL = {
    "name": "compute_esi",
    "description": (
        "Map symptoms + vitals to Emergency Severity Index v5 level "
        "(1=immediate, 5=non-urgent). Returns a care_level mapping to "
        "one of: Home Care / Clinic Visit / Emergency Room."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "symptoms": {"type": "array", "items": {"type": "string"}},
            "vitals": {"type": "object"},
            "age": {"type": "integer"},
            "patient_text": {"type": "string"},
        },
        "required": ["symptoms", "age"],
    },
}


def tool_compute_esi(
    symptoms: list[str],
    age: int | None = None,
    vitals: dict | str | None = None,
    patient_text: str = "",
) -> dict[str, Any]:
    if isinstance(vitals, str):
        vitals_dict = parse_vitals_string(vitals)
    else:
        vitals_dict = dict(vitals or {})
    # Enrich the severity input with the canonical-token form of extracted
    # symptoms so paraphrased presentations score correctly through the
    # severity CSV substring matcher.
    canonical = " ".join((s or "").replace("_", " ") for s in (symptoms or []))
    severity_input = ((patient_text or "") + " " + canonical).strip()
    severity, matched = compute_severity(severity_input)
    esi = esi_from_severity(severity, vitals_dict, age)
    care = level_from_esi(esi)
    return {
        "esi_level": esi,
        "care_level": care,
        "severity": severity,
        "matched_symptoms": matched,
        "reasoning": (
            f"Severity score {severity:.2f} mapped to ESI {esi} "
            f"({care}) using vitals {vitals_dict or '{}'} and age "
            f"{age if age is not None else 'unknown'}."
        ),
    }


# ─── Tool 4 — imci_lookup ─────────────────────────────────────────────────
IMCI_LOOKUP_DECL = {
    "name": "imci_lookup",
    "description": (
        "WHO Integrated Management of Childhood Illness lookup for "
        "children under 5. Returns IMCI danger signs and care "
        "recommendation."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "age_months": {"type": "integer"},
            "symptoms": {"type": "array", "items": {"type": "string"}},
            "vitals": {"type": "object"},
        },
        "required": ["age_months", "symptoms"],
    },
}


_IMCI_DANGER_SIGNS = {
    "high_fever",
    "lethargy",
    "poor_feeding",
    "fontanelle_bulge",
    "seizure",
    "rash_non_blanching",
    "difficulty_breathing",
    "rapid_breathing",
}


def tool_imci_lookup(
    age_months: int,
    symptoms: list[str],
    vitals: dict | None = None,
) -> dict[str, Any]:
    sym_set = set(symptoms or [])
    vitals_dict = vitals or {}
    danger_hit = sorted(sym_set & _IMCI_DANGER_SIGNS)
    temp = vitals_dict.get("temp_c")
    if temp is not None and temp >= 39.0:
        if "high_fever" not in danger_hit:
            danger_hit.append("high_fever")

    if danger_hit:
        classification = "Severe disease — refer urgently"
        recommendation = "Emergency Room"
    elif "diarrhea" in sym_set or "vomiting" in sym_set:
        classification = "Possible dehydration — clinical assessment"
        recommendation = "Clinic Visit"
    elif "ear_pain" in sym_set:
        classification = "Acute otitis media (likely)"
        recommendation = "Clinic Visit"
    else:
        classification = "No IMCI danger signs detected"
        recommendation = "Home Care"

    return {
        "danger_signs": danger_hit,
        "imci_classification": classification,
        "recommendation": recommendation,
        "citation": "WHO IMCI Chart Booklet §3.1 Danger Signs",
        "age_months": age_months,
    }


# ─── Tool 5 — rag_retrieve ────────────────────────────────────────────────
RAG_RETRIEVE_DECL = {
    "name": "rag_retrieve",
    "description": (
        "Retrieve top-K guideline snippets to ground the verdict "
        "explanation with citations."
    ),
    "parameters": {
        "type": "object",
        "properties": {
            "query": {"type": "string"},
            "symptom_tokens": {"type": "array", "items": {"type": "string"}},
            "k": {"type": "integer"},
        },
        "required": ["query"],
    },
}


def tool_rag_retrieve(
    query: str,
    symptom_tokens: list[str] | None = None,
    k: int = 3,
) -> dict[str, Any]:
    snippets = _rag_retrieve(query, symptom_tokens=symptom_tokens or [], k=k)
    return {
        "snippets": [
            {
                "id": s.id,
                "text": s.text,
                "source": s.source,
                "section": s.section,
                "score": float(s.score or 0.0),
            }
            for s in snippets
        ],
    }


# ─── Registry ─────────────────────────────────────────────────────────────
TOOL_DECLARATIONS: list[dict[str, Any]] = [
    EXTRACT_SYMPTOMS_DECL,
    GET_RED_FLAGS_DECL,
    COMPUTE_ESI_DECL,
    IMCI_LOOKUP_DECL,
    RAG_RETRIEVE_DECL,
]

TOOL_IMPL = {
    "extract_symptoms": tool_extract_symptoms,
    "get_red_flags": tool_get_red_flags,
    "compute_esi": tool_compute_esi,
    "imci_lookup": tool_imci_lookup,
    "rag_retrieve": tool_rag_retrieve,
}


def invoke(name: str, args: dict[str, Any]) -> dict[str, Any]:
    """Execute a tool by name with a kwargs dict. Never raises."""
    fn = TOOL_IMPL.get(name)
    if fn is None:
        return {"error": f"unknown tool: {name}"}
    try:
        return fn(**args)
    except TypeError as exc:
        # Defensive: bad args from the LLM shouldn't crash the loop.
        logger.warning("agentic tool %s: bad args %r → %s", name, args, exc)
        return {"error": f"bad args for {name}: {exc}"}
    except Exception as exc:
        logger.exception("agentic tool %s failed", name)
        return {"error": str(exc)}
