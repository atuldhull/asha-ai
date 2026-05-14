"""
ASHA-AI — Ollama / Gemma 2 (or fallback) edge provider (Plan 3.0)
=================================================================

Runs the Layer-1 LLM on-device via Ollama. This is the offline fallback
that powers the **unplug demo** (Plan 3.0 flagship beat).

Default model: gemma2:9b (Q4_0 — ~5.5 GB, ~15–25 tok/s on a MacBook M1
16 GB; ~5–8 tok/s on a Raspberry Pi 5 16 GB with gemma2:2b).

ENV VARS
  LLM_PROVIDER=ollama        # selects this provider
  OLLAMA_BASE=http://localhost:11434
  OLLAMA_MODEL=gemma2:9b     # or llama3.1:8b, phi3:3.8b, gemma2:2b
  OLLAMA_TIMEOUT_S=30

Safety property: any verdict from this provider goes through the SAME
Layer-2 rule engine (R1–R9 from RED_FLAGS.md) downstream. The LLM can
NEVER downgrade a fired rule — that property is unit-tested in
backend/tests/test_safety_property.py.
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
from typing import Any

import httpx

from app.llm.base import ExtractedSymptoms

LOG = logging.getLogger("ashaai.llm.ollama")

DEFAULT_MODEL = os.getenv("OLLAMA_MODEL", "gemma2:9b")
DEFAULT_BASE = os.getenv("OLLAMA_BASE", "http://localhost:11434")
DEFAULT_TIMEOUT = float(os.getenv("OLLAMA_TIMEOUT_S", "30"))


# Smaller models need explicit few-shot grounding; Gemini gets the same
# rules via structured-output mode, but Ollama doesn't enforce a schema
# at the model level, so we coerce JSON-only via prompt + temperature 0.1
# + json mode.
SYSTEM_PROMPT = """You are the symptom-extraction layer of ASHA-AI, a triage assistant for rural India.

ABSOLUTE RULES
- Output ONE JSON object only. No prose, no markdown.
- Symptom names are snake_case from this vocabulary:
  chest_pain, radiation_arm, radiation_jaw, diaphoresis, syncope,
  face_droop, arm_weakness, slurred_speech, sudden_confusion,
  sudden_vision_loss, worst_headache_ever, seizure,
  altered_consciousness, tension_headache, shortness_of_breath,
  difficulty_breathing, cannot_speak_full_sentences, coughing_blood,
  persistent_cough, mild_cough, vomiting, vomiting_blood,
  black_tarry_stool, abdominal_pain, mild_diarrhea, dysuria,
  vaginal_bleeding_pregnancy, fever_mild, fever_high, fever_very_high,
  night_sweats, weight_loss_unintentional, rash, hives, throat_tightness,
  skin_infection, high_fever_lethargy_child, poor_feeding_child,
  fontanelle_bulge, fruity_breath, high_thirst, suicidal_ideation,
  runny_nose, mild_sore_throat, conjunctivitis, back_pain, sprain,
  heavy_bleeding
- NEVER output disease names, diagnoses, ICD codes.
- NEVER suggest medications, dosages, or treatments.
- Per India Telemedicine Practice Guidelines 2020 you provide decision
  support. The rule engine and ML classifier make the triage decision.

FOLLOW-UP GATE
Set needs_followup=true ONLY when ONE specific question would meaningfully
change the triage. The most important pattern: vague unilateral weakness
or confusion in an adult -> ask the FAST screen.

OUTPUT SCHEMA (the only valid JSON shape)
{
  "symptoms": [{"name": "snake_case_name", "severity": "mild|moderate|severe", "duration_hours": <number?>, "modifiers": []}],
  "history_hints": [],
  "age": <int?>,
  "needs_followup": <bool>,
  "followup_question": "<string, empty if needs_followup=false>",
  "language_detected": "en|hi|kn"
}
"""

FEW_SHOTS = [
    {
        "input": "severe chest pain radiating to my left arm and i am sweating",
        "output": {
            "symptoms": [
                {"name": "chest_pain", "severity": "severe"},
                {"name": "radiation_arm", "severity": "severe"},
                {"name": "diaphoresis", "severity": "moderate"},
            ],
            "history_hints": [],
            "age": None,
            "needs_followup": False,
            "followup_question": "",
            "language_detected": "en",
        },
    },
    {
        "input": "my left arm feels heavy and i am a bit confused, started 30 minutes ago",
        "output": {
            "symptoms": [
                {"name": "arm_weakness", "severity": "moderate"},
                {"name": "sudden_confusion", "severity": "moderate"},
            ],
            "history_hints": [],
            "age": None,
            "needs_followup": True,
            "followup_question": "Is one side of your face drooping? Are your words coming out clearly? When did this start?",
            "language_detected": "en",
        },
    },
    {
        "input": "runny nose mild sore throat for 2 days no fever",
        "output": {
            "symptoms": [
                {"name": "runny_nose", "severity": "mild"},
                {"name": "mild_sore_throat", "severity": "mild", "duration_hours": 48},
            ],
            "history_hints": [],
            "age": None,
            "needs_followup": False,
            "followup_question": "",
            "language_detected": "en",
        },
    },
]


def _build_prompt(patient_text: str, language: str) -> str:
    shots = "\n\n".join(
        f"Input: {s['input']}\nOutput: {json.dumps(s['output'])}"
        for s in FEW_SHOTS
    )
    return (
        f"{SYSTEM_PROMPT}\n\n"
        f"Examples:\n{shots}\n\n"
        f"Now extract for this patient (language: {language}):\n"
        f"Input: {patient_text.strip()}\n"
        f"Output: "
    )


class OllamaUnavailable(RuntimeError):
    pass


class OllamaProvider:
    """Edge LLM provider. Talks to localhost Ollama daemon over HTTP."""

    name = "ollama"
    is_offline = True

    def __init__(
        self,
        base_url: str = DEFAULT_BASE,
        model: str = DEFAULT_MODEL,
        timeout_s: float = DEFAULT_TIMEOUT,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.model = model
        self.timeout_s = timeout_s

    @property
    def version(self) -> str:
        return self.model

    # ── Public API (LLMProvider Protocol) ────────────────────────────
    async def extract_symptoms(
        self, text: str, language: str = "en"
    ) -> ExtractedSymptoms:
        if not (text or "").strip():
            return ExtractedSymptoms(symptoms=[], provider=self.name)

        prompt = _build_prompt(text, language)
        try:
            payload = {
                "model": self.model,
                "prompt": prompt,
                "stream": False,
                "format": "json",
                "options": {
                    "temperature": 0.1,
                    "top_p": 0.9,
                    "num_predict": 512,
                },
            }
            async with httpx.AsyncClient(timeout=self.timeout_s) as client:
                r = await client.post(
                    f"{self.base_url}/api/generate", json=payload
                )
                r.raise_for_status()
                body = r.json()
            raw_response = body.get("response", "").strip()
        except httpx.HTTPError as exc:
            LOG.warning("ollama HTTP error: %s", exc)
            return _fallback_extract(text, reason=f"http_error:{exc}")
        except asyncio.TimeoutError:
            LOG.warning("ollama timeout after %.1fs", self.timeout_s)
            return _fallback_extract(text, reason="timeout")

        try:
            parsed = json.loads(raw_response)
        except json.JSONDecodeError:
            LOG.warning("ollama returned non-JSON: %r", raw_response[:160])
            return _fallback_extract(text, reason="non_json")

        parsed["provider"] = self.name
        out = ExtractedSymptoms.from_dict(parsed)
        out.provider = self.name
        return out

    async def followup_question(
        self, partial: ExtractedSymptoms, context: dict[str, Any]
    ) -> str:
        # If the partial extraction already declared a follow-up, use it.
        if partial.needs_followup and partial.followup_question:
            return partial.followup_question

        sym_names = {s.name for s in partial.symptoms}
        fast_words = {"arm_weakness", "sudden_confusion"}
        if (sym_names & fast_words) and "face_droop" not in sym_names:
            return (
                "Is one side of the face drooping? Can the person raise "
                "both arms? Are their words coming out clearly? When did "
                "this start?"
            )
        if "chest_pain" in sym_names and not (
            sym_names & {"radiation_arm", "radiation_jaw", "diaphoresis"}
        ):
            return (
                "Does the chest pain spread to your arm, jaw, or back? "
                "Are you sweating? Are you short of breath?"
            )
        return ""

    # ── Diagnostics ─────────────────────────────────────────────────
    async def healthcheck(self) -> dict[str, Any]:
        """Returns liveness + installed-model info for /health endpoint."""
        try:
            async with httpx.AsyncClient(timeout=2.0) as client:
                r = await client.get(f"{self.base_url}/api/tags")
                r.raise_for_status()
                tags = r.json().get("models", [])
            return {
                "available": True,
                "base_url": self.base_url,
                "configured_model": self.model,
                "installed_models": [m["name"] for m in tags],
                "model_present": any(
                    m["name"].startswith(self.model.split(":")[0])
                    for m in tags
                ),
            }
        except Exception as exc:
            return {"available": False, "error": repr(exc)}


# ── Deterministic fallback (used when Ollama is unreachable) ────────
def _fallback_extract(text: str, reason: str = "") -> ExtractedSymptoms:
    """Mirror ml/pipeline.py keyword aliaser — kept here so the edge
    provider never silently fails closed. Imports lazily to avoid a
    cross-package coupling when running tests without the ml/ tree."""
    try:
        from ml.pipeline import extract_symptoms as keyword_extract  # type: ignore
    except ImportError:
        import sys
        from pathlib import Path

        ml_dir = Path(__file__).resolve().parents[3] / "ml"
        if ml_dir.exists():
            sys.path.append(str(ml_dir))
            from pipeline import extract_symptoms as keyword_extract  # type: ignore
        else:
            return ExtractedSymptoms(
                symptoms=[],
                provider="ollama_fallback",
                raw={"_fallback_reason": reason, "_no_ml_pipeline": True},
            )

    names = keyword_extract(text or "")
    sym_set = set(names)
    fast_words = {"arm_weakness", "sudden_confusion", "slurred_speech"}
    needs_fast = bool(sym_set & fast_words) and "face_droop" not in sym_set
    return ExtractedSymptoms(
        symptoms=[
            type("S", (), {"name": n, "severity": None,
                           "duration_hours": None, "modifiers": []})()
            for n in names
        ],
        history_hints=[],
        age=None,
        needs_followup=needs_fast,
        followup_question=(
            "Is one side of the face drooping? Can the person raise both "
            "arms? Are their words coming out clearly? When did this start?"
        ) if needs_fast else "",
        language_detected="en",
        provider="ollama_fallback",
        raw={"_fallback_reason": reason},
    )


# ── CLI smoke test ──────────────────────────────────────────────────
if __name__ == "__main__":
    import sys

    samples = [
        "severe chest pain radiating to my left arm and sweating",
        "my left arm feels heavy and i am a bit confused",
        "runny nose mild sore throat for 2 days",
        "I dont want to live anymore",
    ]
    provider = OllamaProvider()
    print(f"Provider: {provider.name} model={provider.version} "
          f"base={provider.base_url}")
    for s in samples:
        try:
            r = asyncio.run(provider.extract_symptoms(s, language="en"))
            print(f"\n>>> {s!r}")
            print(
                json.dumps(
                    {
                        "symptoms": [
                            {"name": x.name, "severity": x.severity}
                            for x in r.symptoms
                        ],
                        "needs_followup": r.needs_followup,
                        "followup_question": r.followup_question,
                        "provider": r.provider,
                    },
                    indent=2,
                )
            )
        except Exception as exc:
            print(f"  FAILED: {exc!r}", file=sys.stderr)
