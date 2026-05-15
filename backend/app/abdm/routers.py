"""ABDM routes — Plan 6.6 Phase C.

Mounted at /api/v1/abdm.

Endpoints (auth required — patient role minimum):
  POST /consent/request    → init consent request for ABHA address
  GET  /consent/status     → poll status of a consent request
  POST /push/session       → push a completed triage session to ABHA Health Locker
  GET  /facility/status    → ops-only health-check of our HFR registration

DPDP discipline:
  - All endpoints require valid Bearer token (no anonymous ABDM).
  - `abha_address` is captured in the audit log; the raw value is the
    patient's choice to share with us, so retention follows the standard
    audit-trail policy (immutable, encrypted at rest).
  - Failure-mode responses NEVER include the cleartext access token.
"""
from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from app.abdm.client import ABDMClient, ABDMError, ABDMOk
from app.auth.dependencies import current_user, require_role
from app.auth.models import CurrentUser, UserRole

logger = logging.getLogger(__name__)

abdm_router = APIRouter(prefix="/api/v1/abdm", tags=["abdm"])


# Single shared client — its access-token cache amortises across requests.
# Tests can replace via dependency-override on `_get_client`.
_singleton_client = ABDMClient()


def _get_client() -> ABDMClient:
    return _singleton_client


class ConsentRequestBody(BaseModel):
    abha_address: str  # e.g. ramesh@abdm
    purpose_code: str = "CAREMGT"
    hi_types: list[str] | None = None


class PushSessionBody(BaseModel):
    abha_address: str
    session_id: str
    verdict: str  # MUST be one of: Home Care | Clinic Visit | Emergency Room
    symptoms: list[dict]
    citations: list[dict] | None = None
    timestamp: str | None = None


@abdm_router.post("/consent/request")
def consent_request(
    body: ConsentRequestBody,
    user: CurrentUser = Depends(current_user),
    client: ABDMClient = Depends(_get_client),
) -> dict:
    res = client.request_consent(
        abha_address=body.abha_address,
        purpose_code=body.purpose_code,
        hi_types=body.hi_types,
    )
    if isinstance(res, ABDMError):
        logger.warning("consent_request failed: %s %s", res.code, res.message)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"ABDM consent_request failed: {res.code}",
        )
    return res.data


@abdm_router.get("/consent/status/{request_id}")
def consent_status(
    request_id: str,
    user: CurrentUser = Depends(current_user),
    client: ABDMClient = Depends(_get_client),
) -> dict:
    res = client.consent_status(request_id)
    if isinstance(res, ABDMError):
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"ABDM consent_status failed: {res.code}",
        )
    return res.data


@abdm_router.post("/push/session")
def push_session(
    body: PushSessionBody,
    user: CurrentUser = Depends(current_user),
    client: ABDMClient = Depends(_get_client),
) -> dict:
    if body.verdict not in {"Home Care", "Clinic Visit", "Emergency Room"}:
        # Defensive — `_to_fhir_bundle` also coerces, but reject at the boundary.
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="verdict must be one of: Home Care | Clinic Visit | Emergency Room",
        )
    session_payload = {
        "session_id": body.session_id,
        "verdict": body.verdict,
        "symptoms": body.symptoms,
        "citations": body.citations or [],
        "timestamp": body.timestamp,
    }
    res = client.push_session_to_locker(body.abha_address, session_payload)
    if isinstance(res, ABDMError):
        logger.warning("push_session failed: %s %s", res.code, res.message)
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"ABDM push failed: {res.code}",
        )
    return res.data


@abdm_router.get("/facility/status")
def facility_status(
    user: CurrentUser = Depends(require_role(UserRole.ADMIN)),
    client: ABDMClient = Depends(_get_client),
) -> dict:
    """Admin-only — verifies our HFR sandbox/prod registration is alive."""
    import os
    facility_id = os.getenv("ABDM_FACILITY_ID", "")
    if not facility_id:
        return {
            "ok": False,
            "configured": client.is_configured,
            "sandbox": client.is_sandbox(),
            "message": "ABDM_FACILITY_ID not set — registration pending per docs/regulatory/CDSCO_PATHWAY.md §6.",
        }
    res = client.hfr_lookup(facility_id)
    if isinstance(res, ABDMError):
        return {
            "ok": False,
            "configured": client.is_configured,
            "sandbox": client.is_sandbox(),
            "code": res.code,
            "message": res.message,
        }
    return {
        "ok": True,
        "configured": client.is_configured,
        "sandbox": client.is_sandbox(),
        "facility": res.data,
    }
