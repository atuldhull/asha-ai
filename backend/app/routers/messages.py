"""Per-session messages endpoints — Plan 2.0.

Listing + appending chat messages for a given session. RLS on the
`messages` table makes the server-side check belt-and-braces: we also
verify that the session belongs to the requesting user before reading
or writing.
"""
from __future__ import annotations

from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status

from app.core.auth import User, get_current_user
from app.core.supabase_client import SupabaseNotConfigured, service_client
from app.models.triage import MessageIn, MessageOut

router = APIRouter(prefix="/sessions/{session_id}/messages", tags=["messages"])


def _client_or_503():
    try:
        return service_client()
    except SupabaseNotConfigured as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc


def _assert_owns_session(client, session_id: UUID, user_id: str) -> None:
    res = (
        client.table("sessions")
        .select("id, user_id")
        .eq("id", str(session_id))
        .single()
        .execute()
    )
    row = getattr(res, "data", None)
    if not row or row.get("user_id") != user_id:
        raise HTTPException(404, "Session not found")


@router.get("", response_model=list[MessageOut])
async def list_messages(
    session_id: UUID,
    user: User = Depends(get_current_user),
) -> list[MessageOut]:
    client = _client_or_503()
    _assert_owns_session(client, session_id, user.id)
    res = (
        client.table("messages")
        .select("*")
        .eq("session_id", str(session_id))
        .order("created_at")
        .execute()
    )
    rows = getattr(res, "data", None) or []
    return [
        MessageOut(
            id=UUID(r["id"]),
            session_id=UUID(r["session_id"]),
            role=r["role"],
            content=r["content"],
            created_at=str(r["created_at"]),
        )
        for r in rows
    ]


@router.post("", response_model=MessageOut, status_code=status.HTTP_201_CREATED)
async def append_message(
    session_id: UUID,
    body: MessageIn,
    user: User = Depends(get_current_user),
) -> MessageOut:
    client = _client_or_503()
    _assert_owns_session(client, session_id, user.id)
    payload = {
        "session_id": str(session_id),
        "role": body.role,
        "content": body.content,
    }
    res = client.table("messages").insert(payload).execute()
    rows = getattr(res, "data", None) or []
    if not rows:
        raise HTTPException(500, "Failed to append message")
    row = rows[0]
    return MessageOut(
        id=UUID(row["id"]),
        session_id=UUID(row["session_id"]),
        role=row["role"],
        content=row["content"],
        created_at=str(row["created_at"]),
    )
