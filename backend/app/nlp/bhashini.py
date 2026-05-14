"""Bhashini API wrapper — pipelined ASR → NMT → TTS in a single call.

Auth: pass the PoC API key as the `Authorization` header. The free tier
has rate limits — callers should degrade gracefully on 429.

Public functions:
  transcribe_translate(audio_b64, src_lang)  → {"transcript_source",
                                                 "transcript_english"}
  synthesize(text, lang="hi")                → audio bytes (wav)

If BHASHINI_API_KEY is unset, both functions raise BhashiniUnavailable
so the caller (the /voice/transcribe router) can return a 503 with a
helpful message rather than a 500.

Audio is PHI (voice biometric). Callers MUST NOT log raw audio bytes
or signed URLs in plaintext logs.
"""
from __future__ import annotations

import base64
import logging
import os
from typing import Any

import httpx

logger = logging.getLogger(__name__)


class BhashiniUnavailable(RuntimeError):
    """Raised when Bhashini is not configured / unreachable / rate-limited."""


_DEFAULT_BASE = "https://meity-auth.ulcacontrib.org"  # Bhashini ULCA front door
_TIMEOUT_S = 20.0
_SUPPORTED_LANGUAGES = {"en", "hi", "kn", "ta", "te"}


def _config() -> tuple[str, str]:
    api_key = os.getenv("BHASHINI_API_KEY", "").strip()
    base = os.getenv("BHASHINI_BASE", _DEFAULT_BASE).rstrip("/")
    if not api_key:
        raise BhashiniUnavailable(
            "BHASHINI_API_KEY not configured — set it in .env after signing up at "
            "https://bhashini.gov.in (free PoC tier)."
        )
    return base, api_key


def _validate_lang(lang: str) -> str:
    code = (lang or "").strip().lower()
    if code not in _SUPPORTED_LANGUAGES:
        raise BhashiniUnavailable(
            f"Unsupported language code '{lang}'. Supported: {sorted(_SUPPORTED_LANGUAGES)}"
        )
    return code


def _build_pipeline(src_lang: str, target_lang: str = "en") -> list[dict[str, Any]]:
    """ASR (src) → translation (src→en) — TTS is a separate call."""
    tasks: list[dict[str, Any]] = [
        {
            "taskType": "asr",
            "config": {"language": {"sourceLanguage": src_lang}},
        }
    ]
    if src_lang != target_lang:
        tasks.append(
            {
                "taskType": "translation",
                "config": {
                    "language": {
                        "sourceLanguage": src_lang,
                        "targetLanguage": target_lang,
                    }
                },
            }
        )
    return tasks


async def transcribe_translate(
    audio_b64: str,
    src_lang: str = "hi",
    target_lang: str = "en",
) -> dict[str, str]:
    """Run ASR then (if needed) NMT. Returns transcripts in source + target."""
    base, key = _config()
    src = _validate_lang(src_lang)
    tgt = _validate_lang(target_lang)

    payload = {
        "pipelineTasks": _build_pipeline(src, tgt),
        "inputData": {"audio": [{"audioContent": audio_b64}]},
    }

    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT_S) as client:
            r = await client.post(
                f"{base}/v1/inference/pipeline",
                headers={
                    "Authorization": key,
                    "Content-Type": "application/json",
                },
                json=payload,
            )
    except httpx.HTTPError as exc:
        raise BhashiniUnavailable(f"Bhashini network error: {exc}") from exc

    if r.status_code == 429:
        raise BhashiniUnavailable("Bhashini rate limit exceeded; try again shortly.")
    if r.status_code >= 400:
        raise BhashiniUnavailable(f"Bhashini API error {r.status_code}: {r.text[:200]}")

    data = r.json()
    return _parse_pipeline_response(data, src_eq_tgt=(src == tgt))


def _parse_pipeline_response(data: dict[str, Any], *, src_eq_tgt: bool) -> dict[str, str]:
    """Extract transcript_source and transcript_english from Bhashini's response."""
    responses = data.get("pipelineResponse") or []
    out: dict[str, str] = {"transcript_source": "", "transcript_english": ""}
    if not responses:
        return out

    # ASR is first.
    asr_outputs = responses[0].get("output") or []
    if asr_outputs:
        out["transcript_source"] = asr_outputs[0].get("source") or ""

    if src_eq_tgt:
        out["transcript_english"] = out["transcript_source"]
    elif len(responses) >= 2:
        nmt_outputs = responses[1].get("output") or []
        if nmt_outputs:
            out["transcript_english"] = nmt_outputs[0].get("target") or ""

    return out


async def synthesize(text: str, lang: str = "hi") -> bytes:
    """Convert text to speech in the requested language. Returns WAV bytes.

    The Bhashini PoC TTS task returns a base64-encoded audio payload in
    `pipelineResponse[0].audio[0].audioContent`.
    """
    base, key = _config()
    src = _validate_lang(lang)
    payload = {
        "pipelineTasks": [
            {
                "taskType": "tts",
                "config": {
                    "language": {"sourceLanguage": src},
                    "gender": "female",
                },
            }
        ],
        "inputData": {"input": [{"source": text}]},
    }
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT_S) as client:
            r = await client.post(
                f"{base}/v1/inference/pipeline",
                headers={"Authorization": key, "Content-Type": "application/json"},
                json=payload,
            )
    except httpx.HTTPError as exc:
        raise BhashiniUnavailable(f"Bhashini TTS network error: {exc}") from exc

    if r.status_code == 429:
        raise BhashiniUnavailable("Bhashini TTS rate limited.")
    if r.status_code >= 400:
        raise BhashiniUnavailable(f"Bhashini TTS error {r.status_code}: {r.text[:200]}")

    data = r.json()
    responses = data.get("pipelineResponse") or []
    if not responses:
        raise BhashiniUnavailable("Bhashini TTS: empty pipeline response.")
    audio_blocks = responses[0].get("audio") or []
    if not audio_blocks:
        raise BhashiniUnavailable("Bhashini TTS: no audio in response.")
    audio_b64 = audio_blocks[0].get("audioContent") or ""
    if not audio_b64:
        raise BhashiniUnavailable("Bhashini TTS: empty audioContent.")
    try:
        return base64.b64decode(audio_b64)
    except Exception as exc:
        raise BhashiniUnavailable(f"Bhashini TTS: malformed audio b64: {exc}") from exc


def is_configured() -> bool:
    return bool(os.getenv("BHASHINI_API_KEY", "").strip())
