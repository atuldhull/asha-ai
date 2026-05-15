"""JWT issuance + verification — Plan 6.6 Phase A.

15-min access token + 7-day refresh token with rotation. Refresh-token rotation
means each refresh issues a NEW refresh token and invalidates the previous one
(stored in Valkey as `refresh:<jti>` → user_id, TTL 7 days).

Signing: HS256 with `JWT_SECRET` env var. Production MUST set this to a
64-byte hex string (`openssl rand -hex 64`).

Token claims:
  - `sub`     — user_id (uuid)
  - `role`    — patient | chw | doctor | admin
  - `phone_hash` — SHA-256 hash; raw phone never in the JWT
  - `org`     — organization_id (CHW/doctor/admin only; patients omit)
  - `iat`     — issued at
  - `exp`     — expires at
  - `jti`     — unique token id (for revocation)
  - `typ`     — "access" | "refresh"
"""
from __future__ import annotations

import json
import logging
import os
import time
import uuid
from datetime import datetime, timezone

from jose import JWTError, jwt

from app.auth.models import AuthTokens, CurrentUser, UserRole

logger = logging.getLogger(__name__)

ALGORITHM = "HS256"
ACCESS_TTL_SECONDS = 60 * int(os.getenv("JWT_ACCESS_TTL_MIN", "15"))
REFRESH_TTL_SECONDS = 86400 * int(os.getenv("JWT_REFRESH_TTL_DAYS", "7"))


def _secret() -> str:
    s = os.getenv("JWT_SECRET", "").strip()
    if not s:
        # Fail loudly — production must set this. Tests can set a fixture value.
        raise RuntimeError(
            "JWT_SECRET is not set. Generate one via `openssl rand -hex 64` and "
            "set it in the .env file. Refusing to issue tokens with no secret."
        )
    return s


def issue(
    user_id: str,
    role: UserRole,
    phone_hash: str,
    organization_id: str | None = None,
) -> AuthTokens:
    """Issue an access+refresh token pair. Stores the refresh `jti` in Valkey
    so we can rotate + revoke on logout."""
    now = int(time.time())
    access_jti = uuid.uuid4().hex
    refresh_jti = uuid.uuid4().hex

    common: dict = {
        "sub": user_id,
        "role": role.value,
        "phone_hash": phone_hash,
        "iat": now,
    }
    if organization_id:
        common["org"] = organization_id

    access_payload = {**common, "exp": now + ACCESS_TTL_SECONDS, "jti": access_jti, "typ": "access"}
    refresh_payload = {**common, "exp": now + REFRESH_TTL_SECONDS, "jti": refresh_jti, "typ": "refresh"}

    secret = _secret()
    access = jwt.encode(access_payload, secret, algorithm=ALGORITHM)
    refresh = jwt.encode(refresh_payload, secret, algorithm=ALGORITHM)

    _store_refresh_jti(refresh_jti, user_id)

    return AuthTokens(
        access_token=access,
        refresh_token=refresh,
        expires_in=ACCESS_TTL_SECONDS,
    )


def verify(token: str, expected_type: str = "access") -> CurrentUser | None:
    """Verify the signature + expiry + token-type. Returns CurrentUser or None.

    Refresh tokens are additionally checked against the Valkey allow-list to
    enforce rotation — a stale refresh JTI (rotated already) is rejected.
    """
    try:
        payload = jwt.decode(token, _secret(), algorithms=[ALGORITHM])
    except JWTError:
        return None
    if payload.get("typ") != expected_type:
        return None
    if expected_type == "refresh":
        jti = payload.get("jti")
        if not jti or not _is_refresh_jti_valid(jti):
            return None
    try:
        role = UserRole(payload["role"])
    except (KeyError, ValueError):
        return None
    return CurrentUser(
        user_id=str(payload["sub"]),
        role=role,
        phone_hash=str(payload.get("phone_hash", "")),
        issued_at=datetime.fromtimestamp(payload["iat"], tz=timezone.utc),
        expires_at=datetime.fromtimestamp(payload["exp"], tz=timezone.utc),
        organization_id=payload.get("org"),
    )


def rotate_refresh(old_refresh_token: str) -> AuthTokens | None:
    """Validate old refresh token, revoke its JTI, issue a new pair."""
    user = verify(old_refresh_token, expected_type="refresh")
    if not user:
        return None
    # Revoke the old refresh JTI so it can't be reused (rotation contract).
    try:
        payload = jwt.decode(old_refresh_token, _secret(), algorithms=[ALGORITHM])
        _revoke_refresh_jti(payload.get("jti", ""))
    except JWTError:
        pass
    return issue(
        user_id=user.user_id,
        role=user.role,
        phone_hash=user.phone_hash,
        organization_id=user.organization_id,
    )


def revoke_all_for_user(user_id: str) -> int:
    """Logout-all-sessions endpoint. Scans all refresh JTIs for the user and
    invalidates them. Returns count revoked. Best-effort under Redis outage."""
    r = _redis()
    if r is None:
        return 0
    count = 0
    try:
        for key in r.scan_iter("refresh:*"):
            try:
                v = r.get(key)
                if v and json.loads(v).get("user_id") == user_id:
                    r.delete(key)
                    count += 1
            except Exception:
                pass
    except Exception:
        logger.exception("revoke_all_for_user: scan failed")
    return count


# ──────────── Refresh-JTI allow-list (Valkey) ────────────


def _redis():
    try:
        import redis  # type: ignore
    except ImportError:
        return None
    url = os.getenv("REDIS_URL", "").strip()
    if not url:
        return None
    try:
        return redis.from_url(url, socket_connect_timeout=2, socket_timeout=2)
    except Exception:
        return None


def _store_refresh_jti(jti: str, user_id: str) -> None:
    r = _redis()
    if r is None:
        return
    try:
        r.setex(f"refresh:{jti}", REFRESH_TTL_SECONDS, json.dumps({"user_id": user_id}))
    except Exception:
        logger.exception("_store_refresh_jti failed")


def _is_refresh_jti_valid(jti: str) -> bool:
    r = _redis()
    if r is None:
        # Fall back to permissive — without Redis, we can't enforce rotation.
        # Log + return True so dev environments work. Production MUST have Redis.
        logger.warning("Refresh JTI store unreachable; permissive fallback.")
        return True
    try:
        return r.exists(f"refresh:{jti}") == 1
    except Exception:
        logger.exception("_is_refresh_jti_valid failed; permissive fallback.")
        return True


def _revoke_refresh_jti(jti: str) -> None:
    r = _redis()
    if r is None:
        return
    try:
        r.delete(f"refresh:{jti}")
    except Exception:
        logger.exception("_revoke_refresh_jti failed")
