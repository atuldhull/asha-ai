"""Plan 6.5 Phase F — HyDE (Hypothetical Document Embeddings).

Strategy: patient queries are short + ungrammatical ("pet me dard hai") —
far from SNOMED-style clinical descriptions in embedding space. HyDE asks
the LLM to first generate a hypothetical 2-sentence clinical reference
entry for the most likely condition, then embeds THAT (not the raw query)
for retrieval. Hypothetical text is much closer to corpus by construction.

Target gain per FRONTEND_BLUEPRINT §7 #7: precision@5 ≥ +3pp on the
25-query golden set vs no-HyDE baseline (combined with reranker = +8pp).

Cost: 1 extra LLM call per query. Token budget per call: ~150 tokens
generated. At Gemini Flash pricing (~$0.075 / 1M input + ~$0.30 / 1M output),
HyDE adds ~$0.0001 per query. Documented in docs/_6_5_hyde_cost.md (to be
populated when this ships).

Defensive: if the LLM call fails (timeout / no provider configured), HyDE
gracefully returns the raw query — the caller (retrieve_v2.py) falls back
to direct query embedding.

Public surface:
  - `generate_hypothetical(query, language="en") -> str` — async LLM call
  - `is_available() -> bool` — quick check
"""
from __future__ import annotations

import asyncio
import logging
import os
from typing import Any

logger = logging.getLogger(__name__)


# Single-shot prompt template. Designed to elicit clinical-textbook-style
# prose rather than chat-style explanation.
HYDE_PROMPT_EN = (
    "You are writing a clinical reference entry for a medical encyclopedia. "
    "Given the patient's complaint below, write a 2-sentence description of "
    "the most likely underlying condition or differential. Use formal clinical "
    "terminology (signs, symptoms, anatomical region, ICD-10-style phrasing). "
    "Do NOT diagnose, do NOT recommend treatment, do NOT add disclaimers. "
    "Output ONLY the 2-sentence description, no preamble."
    "\n\nPatient complaint: {query}"
)

HYDE_PROMPT_HI = (
    "आप एक चिकित्सा विश्वकोश के लिए एक नैदानिक संदर्भ प्रविष्टि लिख रहे हैं। "
    "नीचे दी गई रोगी शिकायत के लिए, सबसे संभावित अंतर्निहित स्थिति का 2-वाक्य "
    "विवरण लिखें। औपचारिक नैदानिक शब्दावली का उपयोग करें (संकेत, लक्षण, "
    "शारीरिक क्षेत्र, ICD-10 शैली)। निदान न करें, उपचार की सिफारिश न करें, "
    "अस्वीकरण न जोड़ें। केवल 2-वाक्य विवरण निकालें।"
    "\n\nरोगी की शिकायत: {query}"
)

HYDE_PROMPT_KN = (
    "ನೀವು ವೈದ್ಯಕೀಯ ವಿಶ್ವಕೋಶಕ್ಕಾಗಿ ಕ್ಲಿನಿಕಲ್ ರೆಫರೆನ್ಸ್ ಎಂಟ್ರಿ ಬರೆಯುತ್ತಿದ್ದೀರಿ. "
    "ಕೆಳಗಿನ ರೋಗಿಯ ದೂರಿಗೆ, ಹೆಚ್ಚು ಸಂಭಾವ್ಯ ಆಧಾರವಾಗಿರುವ ಸ್ಥಿತಿಯ 2-ವಾಕ್ಯ "
    "ವಿವರಣೆಯನ್ನು ಬರೆಯಿರಿ. ಔಪಚಾರಿಕ ಕ್ಲಿನಿಕಲ್ ಪರಿಭಾಷೆಯನ್ನು ಬಳಸಿ. "
    "ರೋಗನಿರ್ಣಯ ಮಾಡಬೇಡಿ, ಚಿಕಿತ್ಸೆಯನ್ನು ಶಿಫಾರಸು ಮಾಡಬೇಡಿ. ಕೇವಲ 2-ವಾಕ್ಯ "
    "ವಿವರಣೆಯನ್ನು ಔಟ್‌ಪುಟ್ ಮಾಡಿ."
    "\n\nರೋಗಿಯ ದೂರು: {query}"
)


def _prompt_for(language: str) -> str:
    lang = (language or "en").lower()
    if lang.startswith("hi"):
        return HYDE_PROMPT_HI
    if lang.startswith("kn"):
        return HYDE_PROMPT_KN
    return HYDE_PROMPT_EN


def is_available() -> bool:
    """HyDE works whenever the configured LLM provider is reachable."""
    return bool(
        os.getenv("GEMINI_API_KEY", "").strip()
        or os.getenv("TOGETHER_API_KEY", "").strip()
        or os.getenv("OLLAMA_BASE", "").strip()
    )


async def _call_llm(prompt: str, timeout_s: float = 6.0) -> str | None:
    """Dispatch to whichever provider is configured. Returns generated text
    or None on any failure path (caller falls back to raw query)."""
    # Prefer Gemini Flash (cheapest + fastest) when key is set.
    gemini_key = os.getenv("GEMINI_API_KEY", "").strip()
    if gemini_key:
        return await _gemini_generate(prompt, gemini_key, timeout_s)
    # Then Together AI (used for Llama 3.3 path).
    together_key = os.getenv("TOGETHER_API_KEY", "").strip()
    if together_key:
        return await _together_generate(prompt, together_key, timeout_s)
    # Then Ollama (edge fallback).
    if os.getenv("OLLAMA_BASE", "").strip():
        return await _ollama_generate(prompt, timeout_s)
    return None


async def _gemini_generate(prompt: str, api_key: str, timeout_s: float) -> str | None:
    try:
        import google.generativeai as genai  # type: ignore
    except ImportError:
        return None
    try:
        genai.configure(api_key=api_key)
        model = genai.GenerativeModel("gemini-1.5-flash")
        loop = asyncio.get_event_loop()
        response = await asyncio.wait_for(
            loop.run_in_executor(
                None,
                lambda: model.generate_content(
                    prompt,
                    generation_config={
                        "max_output_tokens": 180,
                        "temperature": 0.2,
                    },
                ),
            ),
            timeout=timeout_s,
        )
        return getattr(response, "text", None)
    except Exception:
        logger.exception("HyDE: gemini call failed")
        return None


async def _together_generate(prompt: str, api_key: str, timeout_s: float) -> str | None:
    """Together AI completion endpoint — fast OSS models for HyDE generation.
    Uses the small/fast `llama-3.2-3b-instruct` rather than the heavyweight
    Llama 3.3 70B (HyDE doesn't need the big model)."""
    try:
        import json as _json
        import urllib.request as _ur
        body = _json.dumps({
            "model": "meta-llama/Llama-3.2-3B-Instruct-Turbo",
            "messages": [{"role": "user", "content": prompt}],
            "max_tokens": 180,
            "temperature": 0.2,
        }).encode()
        req = _ur.Request(
            "https://api.together.xyz/v1/chat/completions",
            data=body,
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
                # Cloudflare bot-block bypass (Together AI returns 403
                # "error code: 1010" for default-UA requests).
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
                "Accept": "application/json",
            },
            method="POST",
        )
        loop = asyncio.get_event_loop()
        raw = await asyncio.wait_for(
            loop.run_in_executor(None, lambda: _ur.urlopen(req, timeout=timeout_s).read()),
            timeout=timeout_s + 1.0,
        )
        data = _json.loads(raw)
        return data["choices"][0]["message"]["content"]
    except Exception:
        logger.exception("HyDE: together call failed")
        return None


async def _ollama_generate(prompt: str, timeout_s: float) -> str | None:
    try:
        import json as _json
        import urllib.request as _ur
        base = os.getenv("OLLAMA_BASE", "http://localhost:11434").rstrip("/")
        body = _json.dumps({
            "model": os.getenv("OLLAMA_MODEL", "gemma2:2b"),
            "prompt": prompt,
            "stream": False,
            "options": {"num_predict": 180, "temperature": 0.2},
        }).encode()
        req = _ur.Request(
            f"{base}/api/generate",
            data=body,
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        loop = asyncio.get_event_loop()
        raw = await asyncio.wait_for(
            loop.run_in_executor(None, lambda: _ur.urlopen(req, timeout=timeout_s).read()),
            timeout=timeout_s + 1.0,
        )
        data = _json.loads(raw)
        return data.get("response", "")
    except Exception:
        logger.exception("HyDE: ollama call failed")
        return None


async def generate_hypothetical(query: str, language: str = "en") -> str:
    """Generate a hypothetical SNOMED-style description for the query.

    On any failure (no provider configured, LLM timeout, parse error),
    falls back to returning the raw query so retrieval can proceed without
    a HyDE boost. The caller doesn't need to handle errors.
    """
    if not query or not query.strip():
        return query
    prompt = _prompt_for(language).format(query=query.strip())
    text = await _call_llm(prompt)
    if not text or len(text.strip()) < 10:
        return query
    return text.strip()
