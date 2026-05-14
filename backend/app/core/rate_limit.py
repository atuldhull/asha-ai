"""SlowAPI rate limiter.

Keyed by authenticated user-id when an `X-User-Id` header is present
(set by the auth dependency); falls back to remote IP otherwise.

Limit: 10 requests / minute / key on /triage.
"""
from __future__ import annotations

import os

from fastapi import Request
from slowapi import Limiter
from slowapi.util import get_remote_address


def _key(request: Request) -> str:
    user_id = request.headers.get("X-User-Id")
    if user_id:
        return f"user:{user_id}"
    return f"ip:{get_remote_address(request)}"


# In dev allow more generous limits to avoid blocking the team during testing.
_TRIAGE_LIMIT = os.getenv("RATE_LIMIT_TRIAGE", "10/minute")

limiter = Limiter(key_func=_key, default_limits=[])
TRIAGE_RATE_LIMIT = _TRIAGE_LIMIT
