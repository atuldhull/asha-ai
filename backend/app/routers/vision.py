"""Plan 6.5 Phase I — Vision triage endpoint.

`POST /api/v1/triage/vision` — multipart form-data image upload.
Gated by `VISION_TRIAGE=on` (production default OFF until MBBS sign-off).
Anonymous-friendly per the same /triage posture; authenticated callers
get the user_id in the audit log.
"""
from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from pydantic import BaseModel

from app.auth.dependencies import optional_current_user
from app.auth.models import CurrentUser
from app.core.disclaimers import DISCLAIMER
from app.core.rate_limit import limiter
from app.llm.vision import is_configured, is_enabled, triage_image

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/triage", tags=["vision"])


class VisionResponse(BaseModel):
    findings: str
    urgency_hint: str
    recommended_action: str
    confidence: float
    refused: bool
    refusal_reason: str | None = None
    disclaimer: str
    model_version: str
    latency_s: float


@router.post("/vision", response_model=VisionResponse)
async def triage_vision_endpoint(
    image: UploadFile = File(...),
    patient_context: str | None = Form(None),  # optional JSON-encoded extract_symptoms output
    user: CurrentUser | None = Depends(optional_current_user),
) -> VisionResponse:
    if not is_enabled():
        # Per checklists/PLAN_6_5_SUBMISSION.md #18 + Phase I rollback,
        # disabled state returns 410 Gone rather than 404 so clients know
        # the route is intentionally retired (not absent).
        raise HTTPException(
            status_code=status.HTTP_410_GONE,
            detail="Vision triage is disabled. Set VISION_TRIAGE=on after MBBS sign-off.",
        )
    if not is_configured():
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Vision provider not configured. Set TOGETHER_API_KEY or VISION_SELF_HOST_URL.",
        )

    if not image.content_type:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Missing image content-type",
        )

    image_bytes = await image.read()
    if not image_bytes:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Empty image upload",
        )

    # Decode optional patient context (output of extract_symptoms).
    ctx: dict[str, Any] | None = None
    if patient_context:
        try:
            import json
            ctx = json.loads(patient_context)
        except Exception:
            ctx = None

    result = await triage_image(
        image_bytes=image_bytes,
        image_mime=image.content_type,
        patient_context=ctx,
    )

    # Always render the canonical disclaimer alongside the vision-specific one.
    disclaimer = result.disclaimer + " " + DISCLAIMER

    return VisionResponse(
        findings=result.findings,
        urgency_hint=result.urgency_hint,
        recommended_action=result.recommended_action,
        confidence=result.confidence,
        refused=result.refused,
        refusal_reason=result.refusal_reason,
        disclaimer=disclaimer,
        model_version=result.model_version,
        latency_s=result.latency_s,
    )
