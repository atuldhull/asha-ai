"""Plan 6.5 Phase I — Llama 3.2 Vision triage.

Vision is gated behind `VISION_TRIAGE=on` and requires MBBS sign-off on
`docs/mbbs_signoffs/6_5_vision.md` per [PROMPTS_PLAN_6.5.md Phase I].

Hosting: Together AI default — `meta-llama/Llama-3.2-11B-Vision-Instruct-Turbo`.
Self-host option via `VISION_SELF_HOST_URL` env var (Ollama
`llama3.2-vision:11b` works locally).

Image storage: 24h TTL on local FS for Tier 6.5; MinIO with proper retention
policy in Tier 6.6 Phase D. Image is never persisted beyond the TTL.

Defensive: when not configured, returns a refusal-style result. The router
(routers/vision.py) maps that to a 410 Gone if `VISION_TRIAGE=off`.

Safety contract:
  - EXACT care-level strings (Home Care / Clinic Visit / Emergency Room)
  - Disclaimer "Consult a clinician with this image" appended to every
    vision result
  - Hostile-image refusal: selfies, animals, screenshots, etc. → polite refusal
  - Image-only triage is ADVISORY — the text triage path remains the primary
"""
from __future__ import annotations

import asyncio
import base64
import json
import logging
import os
import time
from dataclasses import dataclass
from typing import Any

logger = logging.getLogger(__name__)

TOGETHER_VISION_URL = "https://api.together.xyz/v1/chat/completions"
DEFAULT_VISION_MODEL = os.getenv(
    "VISION_MODEL",
    "meta-llama/Llama-3.2-11B-Vision-Instruct-Turbo",
)

MAX_IMAGE_BYTES = int(os.getenv("VISION_MAX_IMAGE_MB", "5")) * 1024 * 1024

CANONICAL_DISCLAIMER = (
    "Consult a clinician with this image for proper evaluation. "
    "This is not a replacement for professional medical diagnosis."
)


@dataclass
class VisionTriageResult:
    findings: str  # 1-2 sentence clinical description
    urgency_hint: str  # "Home Care" | "Clinic Visit" | "Emergency Room"
    recommended_action: str  # what the patient should do next
    confidence: float  # 0.0..1.0
    refused: bool  # True for hostile / non-medical images
    refusal_reason: str | None  # populated when refused=True
    disclaimer: str = CANONICAL_DISCLAIMER
    model_version: str = ""
    latency_s: float = 0.0


SYSTEM_PROMPT = """You are ASHA-AI's vision-triage assistant. You analyze
patient-uploaded photos of rashes, wounds, pill bottles, or simple health
reports (BP cuff readings, thermometers, glucose meters).

You DO NOT diagnose. You return STRICT JSON describing visible clinical
characteristics and an urgency hint that maps to one of EXACTLY three
care-level strings:
  "Home Care"  |  "Clinic Visit"  |  "Emergency Room"

If the image is NOT a medical condition (selfie, pet, screenshot, meme,
random object, blurred image, or any inappropriate content), set
"refused": true and explain in "refusal_reason". Do NOT attempt triage.

Schema (return EXACTLY this shape):
{
  "refused": <bool>,
  "refusal_reason": "<string · empty when refused=false>",
  "findings": "<1-2 sentence clinical description of what's visible>",
  "urgency_hint": "Home Care|Clinic Visit|Emergency Room",
  "recommended_action": "<one short sentence · 'Consult a clinician with this image' acceptable>",
  "confidence": <float 0.0..1.0>
}

Hard constraints:
- The three care-level strings are EXACT English. NEVER paraphrase.
- Default to over-triage when uncertain — Clinic Visit beats Home Care.
- For any wound showing signs of infection (redness, discharge, swelling,
  fever-context), default to Clinic Visit minimum.
- For any image suggesting active hemorrhage, severe burn, or deep
  laceration → Emergency Room.
- Output ONLY the JSON. No preamble, no markdown.
"""


def _refused(reason: str) -> VisionTriageResult:
    return VisionTriageResult(
        findings="",
        urgency_hint="Clinic Visit",  # safe default for unclear images
        recommended_action="Consult a clinician with this image for evaluation.",
        confidence=0.0,
        refused=True,
        refusal_reason=reason,
        model_version=DEFAULT_VISION_MODEL,
    )


def is_enabled() -> bool:
    """VISION_TRIAGE feature flag. Default off until MBBS sign-off lands."""
    return os.getenv("VISION_TRIAGE", "off").strip().lower() in {"on", "1", "true", "yes"}


def is_configured() -> bool:
    return bool(
        os.getenv("TOGETHER_API_KEY", "").strip()
        or os.getenv("VISION_SELF_HOST_URL", "").strip()
    )


async def triage_image(
    image_bytes: bytes,
    image_mime: str,
    patient_context: dict[str, Any] | None = None,
) -> VisionTriageResult:
    """Vision triage. Returns VisionTriageResult; never raises.

    `patient_context` is the structured output of `extract_symptoms` for the
    text path (if any) — used to give the vision model context about the
    associated complaint.
    """
    if not is_enabled():
        return _refused("Vision triage is disabled in this deployment.")
    if not is_configured():
        return _refused("Vision provider not configured.")
    if not image_bytes:
        return _refused("Empty image payload.")
    if len(image_bytes) > MAX_IMAGE_BYTES:
        return _refused(f"Image too large (max {MAX_IMAGE_BYTES // (1024*1024)} MB).")
    if image_mime not in {"image/jpeg", "image/png", "image/webp", "image/jpg"}:
        return _refused(f"Unsupported image type: {image_mime}")

    image_b64 = base64.b64encode(image_bytes).decode()
    image_url = f"data:{image_mime};base64,{image_b64}"

    context_str = ""
    if patient_context:
        symptoms = patient_context.get("symptoms") or []
        if symptoms:
            names = [s.get("name", "") for s in symptoms if s.get("name")]
            if names:
                context_str = f"\n\nAssociated text-reported symptoms: {', '.join(names)}"

    user_content = [
        {"type": "image_url", "image_url": {"url": image_url}},
        {
            "type": "text",
            "text": (
                "Analyze this image for clinical signs. Return the JSON "
                "schema only." + context_str
            ),
        },
    ]
    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": user_content},
    ]

    api_key = os.getenv("TOGETHER_API_KEY", "").strip()
    endpoint = os.getenv("VISION_SELF_HOST_URL", "").strip() or TOGETHER_VISION_URL
    headers = {
        "Content-Type": "application/json",
        # Cloudflare in front of Together AI blocks default-UA requests
        # (HTTP 403 "error code: 1010"). Browser-style UA required.
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
        "Accept": "application/json",
    }
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"

    body = {
        "model": DEFAULT_VISION_MODEL,
        "messages": messages,
        "max_tokens": 400,
        "temperature": 0.1,
        "response_format": {"type": "json_object"},
    }

    start = time.perf_counter()
    try:
        import urllib.request as _ur
        req = _ur.Request(
            endpoint,
            data=json.dumps(body).encode(),
            headers=headers,
            method="POST",
        )
        loop = asyncio.get_event_loop()
        raw = await asyncio.wait_for(
            loop.run_in_executor(None, lambda: _ur.urlopen(req, timeout=20.0).read()),
            timeout=22.0,
        )
        data = json.loads(raw)
        content = data["choices"][0]["message"]["content"].strip()
        if content.startswith("```"):
            content = content.strip("`").lstrip("json").strip()
        parsed = json.loads(content)
    except asyncio.TimeoutError:
        return _refused("Vision provider timeout — image not analyzed.")
    except Exception:
        logger.exception("Vision triage call failed")
        return _refused("Vision provider error.")

    latency = round(time.perf_counter() - start, 3)
    urgency = str(parsed.get("urgency_hint", "Clinic Visit"))
    # SAFETY: enforce the exact care-level whitelist.
    if urgency not in {"Home Care", "Clinic Visit", "Emergency Room"}:
        urgency = "Clinic Visit"  # safe default; never paraphrase upstream

    return VisionTriageResult(
        findings=str(parsed.get("findings", "")),
        urgency_hint=urgency,
        recommended_action=str(parsed.get("recommended_action", CANONICAL_DISCLAIMER)),
        confidence=float(parsed.get("confidence", 0.5)),
        refused=bool(parsed.get("refused", False)),
        refusal_reason=parsed.get("refusal_reason") or None,
        model_version=DEFAULT_VISION_MODEL,
        latency_s=latency,
    )
