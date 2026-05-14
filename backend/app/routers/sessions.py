"""Session CRUD endpoints — Plan 2.0.

Sessions persist a single triage conversation per user. Requires Supabase
to be configured + a valid Supabase JWT (Bearer token). When Supabase is
not configured the endpoints return 503 so the frontend can degrade to
the anonymous /triage path.
"""
from __future__ import annotations

import logging
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status

from app.core.auth import User, get_current_user
from app.core.supabase_client import SupabaseNotConfigured, service_client
from app.models.triage import SessionCreate, SessionOut

router = APIRouter(prefix="/sessions", tags=["sessions"])
logger = logging.getLogger(__name__)


def _client_or_503():
    try:
        return service_client()
    except SupabaseNotConfigured as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc


@router.post("", response_model=SessionOut, status_code=status.HTTP_201_CREATED)
async def create_session(
    body: SessionCreate,
    user: User = Depends(get_current_user),
) -> SessionOut:
    client = _client_or_503()
    payload = {
        "user_id": user.id,
        "language": body.language,
    }
    res = client.table("sessions").insert(payload).execute()
    rows = getattr(res, "data", None) or []
    if not rows:
        raise HTTPException(500, "Failed to create session")
    row = rows[0]
    return SessionOut(
        id=UUID(row["id"]),
        user_id=UUID(row["user_id"]),
        started_at=str(row["started_at"]),
        language=row.get("language") or "en",
        llm_provider=row.get("llm_provider"),
    )


@router.get("", response_model=list[SessionOut])
async def list_sessions(
    user: User = Depends(get_current_user),
    limit: int = 50,
) -> list[SessionOut]:
    client = _client_or_503()
    res = (
        client.table("sessions")
        .select("*")
        .eq("user_id", user.id)
        .order("started_at", desc=True)
        .limit(min(max(limit, 1), 200))
        .execute()
    )
    rows = getattr(res, "data", None) or []
    return [
        SessionOut(
            id=UUID(r["id"]),
            user_id=UUID(r["user_id"]),
            started_at=str(r["started_at"]),
            language=r.get("language") or "en",
            llm_provider=r.get("llm_provider"),
        )
        for r in rows
    ]


@router.get("/{session_id}", response_model=SessionOut)
async def get_session(
    session_id: UUID,
    user: User = Depends(get_current_user),
) -> SessionOut:
    client = _client_or_503()
    res = (
        client.table("sessions")
        .select("*")
        .eq("id", str(session_id))
        .eq("user_id", user.id)
        .single()
        .execute()
    )
    row = getattr(res, "data", None)
    if not row:
        raise HTTPException(404, "Session not found")
    return SessionOut(
        id=UUID(row["id"]),
        user_id=UUID(row["user_id"]),
        started_at=str(row["started_at"]),
        language=row.get("language") or "en",
        llm_provider=row.get("llm_provider"),
    )
