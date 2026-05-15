"""Plan 6.6 Phase B — DPDP consent endpoint.

  POST /api/v1/consent     — record consent (anonymous-friendly)
  GET  /api/v1/consent/me  — current consent posture (authed)
  GET  /api/v1/consent/policy — the policy text + version

The policy text itself is owned by Role D ([docs/MOBILE_CONSENT.md])
and is fetched at startup. The Plan 6.6 brief flags the consent COPY
as the legal-review blocker — the technical endpoints below are not
blocked.
"""
from __future__ import annotations

import os
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel

from app.core.auth import User, get_current_user, get_optional_user
from app.core.dpdp_store import (
    get_consent_status,
    hash_ip,
    record_consent,
)
from app.core.rate_limit import limiter
from app.models.consent import (
    CONSENT_VERSION,
    ConsentRequest,
    ConsentResponse,
    ConsentStatus,
)

router = APIRouter(tags=["consent"])

_CONSENT_RATE_LIMIT = os.getenv("RATE_LIMIT_CONSENT", "20/minute")
_POLICY_PATH = Path(__file__).resolve().parents[3] / "docs" / "MOBILE_CONSENT.md"


class ConsentPolicy(BaseModel):
    version: str
    language: str
    text_markdown: str
    legal_review_status: str  # "pending" | "approved"


@router.post(
    "/consent",
    response_model=ConsentResponse,
    status_code=status.HTTP_201_CREATED,
)
@limiter.limit(_CONSENT_RATE_LIMIT)
async def post_consent(
    request: Request,
    body: ConsentRequest,
    user: User | None = Depends(get_optional_user),
) -> ConsentResponse:
    raw_ip = request.client.host if request.client else None
    ip_hashed = hash_ip(raw_ip)
    return record_consent(
        user_id=user.id if user else None,
        req=body,
        ip_hash=ip_hashed,
    )


@router.get("/consent/me", response_model=ConsentStatus)
async def get_my_consent(
    user: User | None = Depends(get_optional_user),
) -> ConsentStatus:
    return get_consent_status(user.id if user else None)


@router.get("/consent/policy", response_model=ConsentPolicy)
async def get_consent_policy(language: str = "en") -> ConsentPolicy:
    """Return the current privacy/consent policy text.

    The text lives in `docs/MOBILE_CONSENT.md` (Role D-owned). Returns a
    placeholder when the file is missing so the frontend can wire up to
    the endpoint before legal review finalizes the copy.
    """
    text: str
    review_status = os.getenv("CONSENT_LEGAL_REVIEW", "pending")
    if _POLICY_PATH.is_file():
        text = _POLICY_PATH.read_text(encoding="utf-8")
    else:
        text = (
            "# Consent placeholder\n\n"
            "The full consent policy is pending legal review. By using "
            "ASHA-AI, you agree to anonymous triage processing only — no "
            "personal identifiers are stored without explicit consent.\n"
        )
    return ConsentPolicy(
        version=CONSENT_VERSION,
        language=language,
        text_markdown=text,
        legal_review_status=review_status,
    )
