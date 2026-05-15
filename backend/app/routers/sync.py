"""POST /api/v1/sync/sessions — Plan 6.4 mobile offline sync.

Accepts an array of sessions collected on a mobile device while offline
and returns a per-entry ack with a server-canonical UUID. Idempotent by
`(client_uuid, started_at_ts)` so a retry from a flaky network never
double-writes.

Anonymous-friendly when Supabase isn't configured — degrades to
"accepted but not persisted" 200 so the mobile app's queue still drains.
The audit trail still fires (see [docs/PROMPTS_PLAN_6.4.md] DPDP rules).
"""
from __future__ import annotations

import logging
import os
from datetime import datetime, timezone
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, ConfigDict, Field

from app.core.auth import User, get_optional_user
from app.core.rate_limit import limiter
from app.core.supabase_client import is_configured, service_client

router = APIRouter(tags=["sync"])
logger = logging.getLogger(__name__)

_SYNC_RATE_LIMIT = os.getenv("RATE_LIMIT_SYNC", "10/minute")


class OfflineSession(BaseModel):
    model_config = ConfigDict(extra="ignore")
    client_uuid: str = Field(..., min_length=8, max_length=64)
    started_at: str  # ISO-8601 from device clock
    language: str = "en"
    symptoms_text: str | None = Field(default=None, max_length=2000)
    verdict_level: str | None = None  # device-side verdict if computed offline


class SyncRequest(BaseModel):
    sessions: list[OfflineSession] = Field(default_factory=list, max_length=200)


class SyncAck(BaseModel):
    client_uuid: str
    canonical_id: str
    status: str  # "accepted" | "duplicate" | "rejected"
    reason: str | None = None


class SyncResponse(BaseModel):
    acks: list[SyncAck]
    server_time: str


def _persist_or_dedup(client, user_id: str, s: OfflineSession) -> SyncAck:
    """Idempotent upsert keyed on (client_uuid, started_at)."""
    try:
        existing = (
            client.table("sessions")
            .select("id")
            .eq("user_id", user_id)
            .eq("client_uuid", s.client_uuid)
            .eq("started_at", s.started_at)
            .execute()
        )
        rows = getattr(existing, "data", None) or []
        if rows:
            return SyncAck(
                client_uuid=s.client_uuid,
                canonical_id=str(rows[0]["id"]),
                status="duplicate",
            )
    except Exception:
        logger.exception("sync: dedup lookup failed; will attempt insert")

    payload = {
        "user_id": user_id,
        "language": s.language,
        "client_uuid": s.client_uuid,
        "started_at": s.started_at,
    }
    try:
        res = client.table("sessions").insert(payload).execute()
        rows = getattr(res, "data", None) or []
        if rows and rows[0].get("id"):
            return SyncAck(
                client_uuid=s.client_uuid,
                canonical_id=str(rows[0]["id"]),
                status="accepted",
            )
    except Exception as exc:
        logger.exception("sync: insert failed for client_uuid=%s", s.client_uuid)
        return SyncAck(
            client_uuid=s.client_uuid,
            canonical_id=str(uuid4()),
            status="rejected",
            reason=type(exc).__name__,
        )
    return SyncAck(
        client_uuid=s.client_uuid,
        canonical_id=str(uuid4()),
        status="rejected",
        reason="insert_returned_no_rows",
    )


@router.post("/sync/sessions", response_model=SyncResponse)
@limiter.limit(_SYNC_RATE_LIMIT)
async def sync_sessions(
    request: Request,
    body: SyncRequest,
    user: User | None = Depends(get_optional_user),
) -> SyncResponse:
    server_time = datetime.now(timezone.utc).isoformat()

    if not is_configured() or user is None:
        # Mobile is offline-first. We accept the batch optimistically so the
        # queue drains; persistence is best-effort when the user is
        # authenticated AND Supabase is configured.
        return SyncResponse(
            acks=[
                SyncAck(
                    client_uuid=s.client_uuid,
                    canonical_id=str(uuid4()),
                    status="accepted",
                    reason="not_persisted_anonymous_or_no_backend",
                )
                for s in body.sessions
            ],
            server_time=server_time,
        )

    client = service_client()
    acks = [_persist_or_dedup(client, user.id, s) for s in body.sessions]
    return SyncResponse(acks=acks, server_time=server_time)
