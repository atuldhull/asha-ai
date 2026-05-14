"""
ASHA-AI — Gemini 2.5 Flash symptom extractor (Plan 2.0)
========================================================

Role: convert a patient's free-text complaint into a structured symptom
JSON that Role B's triage pipeline consumes. This module is the LLM Layer
1 of the three-layer architecture (see docs/METHODOLOGY.md §1).

Hard rules (encoded in the system prompt and in the response schema):
  - Outputs only snake_case symptom names. NO disease names. NO diagnostic
    labels. NO medication recommendations. NO dosage advice.
  - Per India Telemedicine Practice Guidelines 2020, this is decision
    support — never diagnosis or prescription.
  - When the model isn't confident enough to commit, it sets
    needs_followup=true with a single specific clinical question. The
    most important pattern: vague unilateral weakness + confusion ->
    ask the FAST screen (face / arm / speech / time).
  - If GEMINI_API_KEY is unset or the SDK raises, fall through to the
    deterministic keyword aliaser in ml.pipeline.extract_symptoms.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
from typing import Any

LOG = logging.getLogger("ashaai.llm.gemini")

MODEL_NAME = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")

# Response schema — Pydantic-style, also passed to Gemini's response_schema
# parameter for JSON-mode constrained output.
EXTRACTION_SCHEMA: dict[str, Any] = {
    "type": "object",
    "properties": {
        "symptoms": {
            "type": "array",
            "description": "Extracted symptoms. snake_case names only.",
            "items": {
                "type": "object",
                "properties": {
                    "name": {"type": "string", "description": "snake_case symptom name"},
                    "severity": {"type": "string", "enum": ["mild", "moderate", "severe"]},
                    "duration_hours": {"type": "number"},
                    "modifiers": {"type": "array", "items": {"type": "string"}},
                },
                "required": ["name"],
            },
        },
        "history_hints": {
            "type": "array",
            "description": "Background hints — e.g. diabetes, asthma, pregnancy_8_weeks, postpartum_5d.",
            "items": {"type": "string"},
        },
        "age": {"type": "integer", "description": "Patient age in years, if stated."},
        "needs_followup": {"type": "boolean"},
        "followup_question": {
            "type": "string",
            "description": "Single clinical question to ask. Empty if needs_followup is false.",
        },
        "language_detected": {"type": "string"},
    },
    "required": ["symptoms", "needs_followup"],
}

SYSTEM_PROMPT = """You are the symptom-extraction layer of ASHA-AI, a triage assistant for
rural India. Your job is to convert the patient's free-text complaint into a
structured JSON object conforming to the response schema. Output JSON only.

ABSOLUTE RULES
- Output snake_case symptom names from a controlled vocabulary like
  chest_pain, radiation_arm, diaphoresis, face_droop, arm_weakness,
  slurred_speech, sudden_confusion, sudden_vision_loss,
  worst_headache_ever, seizure, altered_consciousness, tension_headache,
  shortness_of_breath, difficulty_breathing, cannot_speak_full_sentences,
  coughing_blood, persistent_cough, mild_cough, vomiting, vomiting_blood,
  black_tarry_stool, abdominal_pain, mild_diarrhea, dysuria,
  vaginal_bleeding_pregnancy, fever_mild, fever_high, fever_very_high,
  night_sweats, weight_loss_unintentional, rash, hives, throat_tightness,
  skin_infection, high_fever_lethargy_child, poor_feeding_child,
  difficulty_breathing_child, fontanelle_bulge, fruity_breath, high_thirst,
  suicidal_ideation, runny_nose, mild_sore_throat, conjunctivitis,
  back_pain, sprain, heavy_bleeding.
- NEVER output disease names ("STEMI", "stroke", "pneumonia"), diagnoses,
  ICD codes, or differentials.
- NEVER suggest medications, dosages, or treatments.
- Per India Telemedicine Practice Guidelines 2020 you provide decision
  support. The downstream rule engine and ML classifier make the triage
  decision, not you.

FOLLOW-UP GATE
Set needs_followup=true ONLY when ONE specific question would meaningfully
change the triage. Examples:
- Vague unilateral weakness or confusion in an adult -> ask the FAST screen
  ("Is one side of the face drooping? Can the person raise both arms? Are
  the words coming out clearly? When did this start?").
- "My chest hurts" in an adult -> ask whether the pain radiates to arm,
  jaw, or back, and whether they are sweating.
- Diabetic with vomiting -> ask about thirst, urination, and breath smell.
- Pregnant patient with abdominal pain -> ask about bleeding and gestation.
If you can confidently extract structured symptoms without ambiguity, set
needs_followup=false and leave followup_question empty.

LANGUAGE
Patients may write in English, Hindi, Kannada, or Romanized Hindi/Kannada.
You speak to them in the language they used; symptom names in the output
JSON stay English snake_case. Set language_detected accordingly.
"""


# --- Pydantic shape (used by the FastAPI caller) ----------------------------

try:
    from pydantic import BaseModel, Field
except ImportError:  # pydantic is a backend dep; if missing, fall back to dict
    BaseModel = object  # type: ignore[assignment]
    Field = lambda *a, **kw: None  # type: ignore[assignment]


class ExtractedSymptom(BaseModel):  # type: ignore[misc]
    name: str
    severity: str | None = None
    duration_hours: float | None = None
    modifiers: list[str] = Field(default_factory=list)


class ExtractionResult(BaseModel):  # type: ignore[misc]
    symptoms: list[ExtractedSymptom]
    history_hints: list[str] = Field(default_factory=list)
    age: int | None = None
    needs_followup: bool = False
    followup_question: str = ""
    language_detected: str | None = None


# --- Gemini call ------------------------------------------------------------

class GeminiUnavailable(RuntimeError):
    pass


async def extract_symptoms_via_gemini(
    patient_text: str,
    language_hint: str = "en",
    *,
    timeout_s: float = 8.0,
) -> dict[str, Any]:
    """Calls Gemini 2.5 Flash with JSON-mode constrained output.

    Raises GeminiUnavailable if the API key is missing or the SDK errors —
    callers should catch and fall through to the deterministic aliaser.
    """
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        raise GeminiUnavailable("GEMINI_API_KEY not set")
    try:
        import google.generativeai as genai
    except ImportError as e:
        raise GeminiUnavailable("google-generativeai not installed") from e

    genai.configure(api_key=api_key)
    model = genai.GenerativeModel(
        MODEL_NAME,
        generation_config={
            "response_mime_type": "application/json",
            "response_schema": EXTRACTION_SCHEMA,
            "temperature": 0.1,
        },
        system_instruction=SYSTEM_PROMPT,
    )

    user_prompt = (
        f"Patient input (language hint: {language_hint}):\n"
        f"\"\"\"\n{patient_text.strip()}\n\"\"\""
    )

    try:
        coro = model.generate_content_async(user_prompt)
        response = await asyncio.wait_for(coro, timeout=timeout_s)
        text = response.text
        if not text:
            raise GeminiUnavailable("empty Gemini response")
        return json.loads(text)
    except asyncio.TimeoutError as e:
        raise GeminiUnavailable(f"Gemini timeout after {timeout_s}s") from e
    except json.JSONDecodeError as e:
        LOG.warning("gemini returned non-JSON: %r", text[:200] if text else "")
        raise GeminiUnavailable(f"invalid JSON from Gemini: {e}") from e
    except Exception as e:
        raise GeminiUnavailable(f"Gemini call failed: {e!r}") from e


async def extract_symptoms(patient_text: str, language_hint: str = "en") -> dict[str, Any]:
    """Public entry point. Tries Gemini, falls back to the deterministic
    keyword aliaser from ml.pipeline. Always returns the same shape."""
    try:
        return await extract_symptoms_via_gemini(patient_text, language_hint)
    except GeminiUnavailable as e:
        LOG.info("falling back to deterministic aliaser: %s", e)
        return _fallback_extract(patient_text)


# --- Plan 3.0: GeminiProvider conforming to app.llm.base.LLMProvider --------

class GeminiProvider:
    """Cloud LLM provider — wraps the module-level extractor so the
    triage pipeline can swap providers via `get_provider()` at runtime.

    See [app/llm/base.py](base.py) for the Protocol contract. The unplug
    demo (Plan 3.0) toggles `LLM_PROVIDER=ollama`; everything else stays
    on this provider by default.
    """

    name = "gemini"
    is_offline = False

    def __init__(self, model: str = MODEL_NAME) -> None:
        self._model = model

    @property
    def version(self) -> str:
        return self._model

    async def extract_symptoms(self, text: str, language: str = "en"):  # type: ignore[override]
        from app.llm.base import ExtractedSymptoms as _ES

        data = await extract_symptoms(text, language_hint=language)
        data["provider"] = self.name
        return _ES.from_dict(data)

    async def followup_question(self, partial, context):  # type: ignore[override]
        if partial.needs_followup and partial.followup_question:
            return partial.followup_question
        sym_names = {s.name for s in partial.symptoms}
        if (
            sym_names & {"arm_weakness", "sudden_confusion", "slurred_speech"}
            and "face_droop" not in sym_names
        ):
            return (
                "Is one side of the face drooping? Can the person raise "
                "both arms? Are their words coming out clearly? When did "
                "this start?"
            )
        return ""


def _fallback_extract(patient_text: str) -> dict[str, Any]:
    # Local import to avoid creating a hard dep when used from the FastAPI app
    try:
        from ml.pipeline import extract_symptoms as keyword_extract  # type: ignore[import-not-found]
    except ImportError:
        import sys
        from pathlib import Path
        sys.path.append(str(Path(__file__).resolve().parents[3] / "ml"))
        from pipeline import extract_symptoms as keyword_extract  # type: ignore[import-not-found]

    names = keyword_extract(patient_text or "")
    fast_words = {"arm_weakness", "sudden_confusion", "face_droop", "slurred_speech"}
    needs_fast = bool(fast_words & set(names)) and "face_droop" not in names
    return {
        "symptoms": [{"name": n} for n in names],
        "history_hints": [],
        "age": None,
        "needs_followup": needs_fast,
        "followup_question": (
            "Is one side of the face drooping? Can the person raise both arms? "
            "Are their words coming out clearly? When did this start?"
        ) if needs_fast else "",
        "language_detected": "en",
        "_fallback": True,
    }


# --- CLI smoke test ---------------------------------------------------------

if __name__ == "__main__":
    import sys

    samples = [
        "severe chest pain radiating to left arm and sweating",
        "my left arm feels heavy and i am a bit confused",
        "runny nose mild sore throat for 2 days",
        "I dont want to live anymore",
    ]
    for s in samples:
        out = asyncio.run(extract_symptoms(s))
        print(f"\n>>> {s!r}")
        print(json.dumps(out, indent=2))
