"""Lazy Supabase client wrapper.

Two clients:
  - `service_client()` uses SUPABASE_SERVICE_ROLE_KEY (backend-trusted;
    bypasses RLS — only call from server-side handlers).
  - `user_client(jwt)` uses the user's JWT (RLS-enforced; safer default
    for reads on behalf of the user).

If the env vars are missing, `service_client()` and `user_client()` raise
`SupabaseNotConfigured`. Routers translate that to 503.
"""
from __future__ import annotations

import logging
import os
from functools import lru_cache

from supabase import Client, create_client

logger = logging.getLogger(__name__)


class SupabaseNotConfigured(RuntimeError):
    """Raised when SUPABASE_URL / keys are missing."""


def _read_env(name: str) -> str:
    value = os.getenv(name, "").strip()
    if not value:
        raise SupabaseNotConfigured(
            f"{name} not configured — apply db/migrations/001_plan2_schema.sql "
            f"in Supabase and add the project's URL/keys to .env"
        )
    return value


@lru_cache(maxsize=1)
def service_client() -> Client:
    """Backend-trusted client. Bypasses RLS — use carefully."""
    url = _read_env("SUPABASE_URL")
    key = _read_env("SUPABASE_SERVICE_ROLE_KEY")
    logger.info("Initialising Supabase service client.")
    return create_client(url, key)


def user_client(jwt: str) -> Client:
    """Per-user RLS-enforced client. Not cached — each user gets their own."""
    url = _read_env("SUPABASE_URL")
    anon = _read_env("SUPABASE_ANON_KEY")
    client = create_client(url, anon)
    client.postgrest.auth(jwt)
    return client


def is_configured() -> bool:
    return bool(
        os.getenv("SUPABASE_URL")
        and os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    )
