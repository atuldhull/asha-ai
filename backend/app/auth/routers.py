"""Auth routes — Plan 6.6 Phase A.

Mounted at /api/v1/auth in app/main.py.

Endpoints:
  POST /otp/request      → send OTP to phone (rate-limit 5/min/phone)
  POST /otp/verify       → verify OTP + issue JWT pair (incl. user-create on first)
  POST /refresh          → rotate refresh token, issue new pair
  POST /logout           → revoke refresh JTI for this session
  POST /logout/all       → revoke ALL refresh tokens for this user
  GET  /me               → return CurrentUser context (for client to know role)

Anonymous-friendly: NONE of these endpoints are required to use /triage.
Anonymous /triage continues to work — see app/triage_logic/pipeline.py.

DPDP discipline:
  - Raw phone number leaves the request handler only to the SMS gateway.
  - Audit log records `phone_hash`, never raw phone.
  - No PHI in error responses.
"""
from __future__ import annotations

import hashlib
import logging
import uuid

from fastapi import APIRouter, Depends, HTTPException, Request, status

from app.auth.dependencies import current_user
from app.auth.jwt import issue, revoke_all_for_user, rotate_refresh
from app.auth.models import (
    AuthTokens,
    CurrentUser,
    OTPRequestBody,
    OTPVerifyBody,
    RefreshBody,
    UserRole,
)
from app.auth.otp import hash_phone, send_otp, verify_otp

logger = logging.getLogger(__name__)

auth_router = APIRouter(prefix="/api/v1/auth", tags=["auth"])


@auth_router.post("/otp/request", status_code=status.HTTP_202_ACCEPTED)
def request_otp(body: OTPRequestBody) -> dict:
    """Send an OTP to the supplied phone. Always returns 202 even when send
    failed — we don't reveal whether a phone is registered (defense against
    enumeration). Logs the failure for ops monitoring."""
    ok = send_otp(body.phone)
    if not ok:
        logger.warning(
            "OTP send failed for phone_hash=%s — returning 202 anyway "
            "(no enumeration leak).",
            hash_phone(body.phone)[:8],
        )
    return {
        "status": "pending",
        "message": "If the phone number is valid, an OTP has been sent.",
    }


@auth_router.post("/otp/verify", response_model=AuthTokens)
def verify_otp_endpoint(body: OTPVerifyBody) -> AuthTokens:
    """Verify OTP and issue a JWT pair.

    On first verify, creates a Patient user (the default role). Higher roles
    (CHW/Doctor/Admin) are granted only by an Admin via a separate flow.

    NB: this is a SCAFFOLD. Production should persist the user row to postgres
    in a `users` table managed by Alembic — that schema work is the next
    follow-up. For now we deterministically derive `user_id` from `phone_hash`
    so the same phone always lands on the same uuid.
    """
    if not verify_otp(body.phone, body.otp):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="OTP invalid or expired.",
        )
    phone_h = hash_phone(body.phone)
    # Deterministic user_id from phone hash. When `users` table lands in a
    # follow-up migration, replace this with a real DB lookup.
    user_id = str(uuid.UUID(bytes=hashlib.sha256(phone_h.encode()).digest()[:16]))
    # First-verify defaults to PATIENT. Role escalation is admin-managed
    # (see future router /api/v1/admin/users).
    role = UserRole.PATIENT
    return issue(user_id=user_id, role=role, phone_hash=phone_h)


@auth_router.post("/refresh", response_model=AuthTokens)
def refresh_endpoint(body: RefreshBody) -> AuthTokens:
    """Rotate the refresh token (invalidates the old one) + return new pair."""
    pair = rotate_refresh(body.refresh_token)
    if pair is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Refresh token invalid, expired, or already rotated.",
        )
    return pair


@auth_router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout_endpoint(body: RefreshBody) -> None:
    """Single-session logout — revokes the refresh JTI. Access token stays
    valid until its 15-min expiry (acceptable trade — short-lived)."""
    # rotate_refresh + immediate discard = revoke without issuing new pair.
    rotate_refresh(body.refresh_token)  # idempotent on invalid token
    return None


@auth_router.post("/logout/all", status_code=status.HTTP_204_NO_CONTENT)
def logout_all_endpoint(user: CurrentUser = Depends(current_user)) -> None:
    """Revoke ALL refresh tokens for the current user (multi-device logout)."""
    count = revoke_all_for_user(user.user_id)
    logger.info(
        "logout/all · user_id=%s · revoked=%d refresh tokens",
        user.user_id, count,
    )
    return None


@auth_router.get("/me", response_model=CurrentUser)
def me_endpoint(user: CurrentUser = Depends(current_user)) -> CurrentUser:
    """Return the authenticated user's context. Client uses this to know
    which role-gated UI surfaces to render (e.g. /admin/* only for ADMIN)."""
    return user
