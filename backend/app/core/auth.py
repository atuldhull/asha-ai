"""Supabase JWT validation.

Reads SUPABASE_JWT_SECRET from env (Supabase Dashboard → Project Settings →
API → JWT Secret). Tokens issued by Supabase Auth are HS256, signed with
that secret, with audience "authenticated".

Use as a FastAPI dependency:

    from app.core.auth import get_current_user
    @router.post("/triage")
    async def triage(user: User = Depends(get_current_user)): ...

For Plan 2.0 we also expose `get_optional_user` — endpoints that should
work anonymously (legacy Plan 1.0 paths, public health checks) can use
that to upgrade behaviour when a token IS present without breaking on
its absence.
"""
from __future__ import annotations

import logging
import os
from dataclasses import dataclass

from fastapi import Header, HTTPException, status
from jose import JWTError, jwt

logger = logging.getLogger(__name__)

_JWT_ALGORITHMS = ["HS256"]
_JWT_AUDIENCE = "authenticated"


@dataclass(frozen=True)
class User:
    id: str
    email: str | None = None
    phone: str | None = None
    role: str | None = None


class _AuthDisabledError(RuntimeError):
    pass


def _jwt_secret() -> str:
    secret = os.getenv("SUPABASE_JWT_SECRET", "").strip()
    if not secret:
        raise _AuthDisabledError(
            "SUPABASE_JWT_SECRET not configured — auth-protected endpoints "
            "are disabled. Set it in .env once the Supabase project is created."
        )
    return secret


def _decode(token: str) -> dict:
    return jwt.decode(
        token,
        _jwt_secret(),
        algorithms=_JWT_ALGORITHMS,
        audience=_JWT_AUDIENCE,
    )


def _user_from_payload(payload: dict) -> User:
    return User(
        id=str(payload["sub"]),
        email=payload.get("email"),
        phone=payload.get("phone"),
        role=payload.get("role") or (payload.get("user_metadata") or {}).get("role"),
    )


def _parse_bearer(authorization: str | None) -> str | None:
    if not authorization:
        return None
    parts = authorization.split(" ", 1)
    if len(parts) != 2 or parts[0].lower() != "bearer":
        return None
    return parts[1].strip() or None


async def get_current_user(authorization: str | None = Header(default=None)) -> User:
    token = _parse_bearer(authorization)
    if token is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing or malformed Authorization header (expected: Bearer <token>)",
        )
    try:
        payload = _decode(token)
    except _AuthDisabledError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc
    except JWTError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
        ) from exc
    return _user_from_payload(payload)


async def get_optional_user(authorization: str | None = Header(default=None)) -> User | None:
    """Returns the authenticated user, or None when no/invalid token is sent.

    Endpoints that should remain usable anonymously (the Plan 1.0 /triage
    free-text contract) use this so the frontend can upgrade to authed
    flows without changes here.
    """
    token = _parse_bearer(authorization)
    if token is None:
        return None
    try:
        payload = _decode(token)
    except _AuthDisabledError:
        return None
    except JWTError:
        logger.debug("Optional auth: invalid token; treating as anonymous.")
        return None
    return _user_from_payload(payload)
