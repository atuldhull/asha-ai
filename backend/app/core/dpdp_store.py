"""Plan 6.6 Phase B — DPDP consent + deletion storage.

When Supabase is configured, writes/reads live in the `consent_log` and
`deletion_log` tables (created by [db/migrations/003_plan66_consent.sql]).
When not configured (local/dev, or anonymous users without an authed
session), an in-process dict serves the same shape so the API stays
usable for demos and tests.

The in-memory fallback is deliberately stateless across worker
restarts — DPDP-compliant deployments MUST run with Supabase wired so
the audit row survives a crash.
"""
from __future__ import annotations

import hashlib
import logging
import os
from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import uuid4

from app.core.supabase_client import SupabaseNotConfigured, is_configured, service_client
from app.models.consent import (
    CONSENT_VERSION,
    ConsentRequest,
    ConsentResponse,
    ConsentScope,
    ConsentStatus,
    DeletionResponse,
    DeletionStatus,
)

logger = logging.getLogger(__name__)

# 72h hard-delete grace per DPDP §13. Configurable via env.
HARD_DELETE_HOURS = float(os.getenv("HARD_DELETE_HOURS", "72"))

# In-memory fallback. Keys keep the structure flat so tests can clear it.
_mem_consents: dict[str, dict[str, Any]] = {}
_mem_deletions: dict[str, dict[str, Any]] = {}


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def hash_ip(raw_ip: str | None) -> str | None:
    """Hash with a project salt so the raw IP never persists.

    We use SHA-256 with the `IP_HASH_SALT` env var as the per-deployment
    pepper. Without the salt, hashes are predictable enough to dehash
    via a /16 rainbow table; with the salt, they're not.
    """
    if not raw_ip:
        return None
    salt = os.getenv("IP_HASH_SALT", "asha-ai-default-salt-rotate-pre-launch")
    return hashlib.sha256(f"{salt}::{raw_ip}".encode("utf-8")).hexdigest()


def _row_to_consent_response(row: dict[str, Any]) -> ConsentResponse:
    scopes_raw = row.get("scopes") or []
    scopes = [ConsentScope(s) for s in scopes_raw if s in ConsentScope._value2member_map_]
    return ConsentResponse(
        consent_id=str(row["id"]),
        user_id=row.get("user_id"),
        scopes=scopes,
        consent_version=row.get("consent_version", CONSENT_VERSION),
        language=row.get("language", "en"),
        ip_hash=row.get("ip_hash"),
        granted_at=row.get("granted_at") or _now_iso(),
    )


def record_consent(
    *,
    user_id: str | None,
    req: ConsentRequest,
    ip_hash: str | None,
) -> ConsentResponse:
    consent_id = str(uuid4())
    granted_at = _now_iso()
    row = {
        "id": consent_id,
        "user_id": user_id,
        "scopes": [s.value for s in req.scopes],
        "consent_version": req.consent_version,
        "language": req.language,
        "ip_hash": ip_hash,
        "user_agent": req.user_agent,
        "granted_at": granted_at,
    }

    if is_configured():
        try:
            client = service_client()
            client.table("consent_log").insert(row).execute()
            return _row_to_consent_response(row)
        except SupabaseNotConfigured:
            pass
        except Exception:
            logger.exception("consent: Supabase insert failed; falling back to memory")

    # In-memory fallback. Keep only the latest consent per user_id (or
    # anonymous "*" bucket) to keep the dict bounded.
    bucket_key = user_id or "anonymous"
    _mem_consents[bucket_key] = row
    return _row_to_consent_response(row)


def get_consent_status(user_id: str | None) -> ConsentStatus:
    """Read the latest consent record for the user."""
    row: dict[str, Any] | None = None

    if user_id and is_configured():
        try:
            client = service_client()
            res = (
                client.table("consent_log")
                .select("*")
                .eq("user_id", user_id)
                .order("granted_at", desc=True)
                .limit(1)
                .execute()
            )
            data = getattr(res, "data", None) or []
            if data:
                row = data[0]
        except SupabaseNotConfigured:
            pass
        except Exception:
            logger.exception("consent: Supabase read failed; falling back to memory")

    if row is None:
        bucket_key = user_id or "anonymous"
        row = _mem_consents.get(bucket_key)

    if row is None:
        return ConsentStatus(user_id=user_id)

    last_version = row.get("consent_version")
    granted_scopes = [
        ConsentScope(s)
        for s in (row.get("scopes") or [])
        if s in ConsentScope._value2member_map_
    ]
    return ConsentStatus(
        user_id=user_id,
        current_version=CONSENT_VERSION,
        granted_scopes=granted_scopes,
        needs_reprompt=last_version != CONSENT_VERSION,
        last_granted_at=row.get("granted_at"),
        last_granted_version=last_version,
    )


def record_deletion(*, user_id: str, reason: str | None) -> DeletionResponse:
    """Soft-delete now; hard-delete sweep runs at HARD_DELETE_HOURS later."""
    deletion_id = str(uuid4())
    now = datetime.now(timezone.utc)
    hard_after = now + timedelta(hours=HARD_DELETE_HOURS)
    row = {
        "id": deletion_id,
        "user_id": user_id,
        "reason": reason,
        "soft_deleted_at": now.isoformat(),
        "hard_delete_after": hard_after.isoformat(),
        "completed_at": None,
    }
    affected: list[str] = ["sessions", "messages", "verdicts", "consent_log"]

    if is_configured():
        try:
            client = service_client()
            client.table("deletion_log").insert(row).execute()
            # Soft-delete: mark user's session rows. We don't actually
            # drop rows here — the hard-delete sweep job does that.
            for table in ("sessions", "messages", "verdicts"):
                try:
                    client.table(table).update({"deleted_at": now.isoformat()}) \
                        .eq("user_id", user_id).is_("deleted_at", "null").execute()
                except Exception:
                    logger.exception("deletion: soft-delete sweep failed on %s", table)
            return DeletionResponse(
                deletion_id=deletion_id,
                user_id=user_id,
                soft_deleted_at=row["soft_deleted_at"],
                hard_delete_after=row["hard_delete_after"],
                affected_tables=affected,
                audit_event="dpdp_right_to_deletion",
            )
        except SupabaseNotConfigured:
            pass
        except Exception:
            logger.exception("deletion: Supabase insert failed; falling back to memory")

    _mem_deletions[user_id] = row
    return DeletionResponse(
        deletion_id=deletion_id,
        user_id=user_id,
        soft_deleted_at=row["soft_deleted_at"],
        hard_delete_after=row["hard_delete_after"],
        affected_tables=affected,
        audit_event="dpdp_right_to_deletion",
    )


def get_deletion_status(user_id: str) -> DeletionStatus:
    row: dict[str, Any] | None = None

    if is_configured():
        try:
            client = service_client()
            res = (
                client.table("deletion_log")
                .select("*")
                .eq("user_id", user_id)
                .is_("completed_at", "null")
                .order("soft_deleted_at", desc=True)
                .limit(1)
                .execute()
            )
            data = getattr(res, "data", None) or []
            if data:
                row = data[0]
        except SupabaseNotConfigured:
            pass
        except Exception:
            logger.exception("deletion: Supabase read failed; falling back to memory")

    if row is None:
        row = _mem_deletions.get(user_id)

    if row is None:
        return DeletionStatus(user_id=user_id, has_pending_deletion=False)

    return DeletionStatus(
        user_id=user_id,
        has_pending_deletion=True,
        soft_deleted_at=row.get("soft_deleted_at"),
        hard_delete_after=row.get("hard_delete_after"),
    )


def reset_for_tests() -> None:
    """Clear in-memory state. Tests call this in fixtures."""
    _mem_consents.clear()
    _mem_deletions.clear()
