"""User profile endpoints — Plan 3.0.

PATCH /api/v1/profile/language — set the authenticated user's preferred
language (one of en / hi / kn). Persisted to `profiles.language`.

Auth: requires a Supabase JWT. 503 when Supabase isn't configured.
"""
from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from app.core.auth import User, get_current_user
from app.core.supabase_client import SupabaseNotConfigured, service_client

router = APIRouter(prefix="/profile", tags=["profile"])


SupportedLanguage = Literal["en", "hi", "kn"]


class SetLanguageRequest(BaseModel):
    language: SupportedLanguage = Field(..., description="ISO 639-1 code")


def _client_or_503():
    try:
        return service_client()
    except SupabaseNotConfigured as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc


@router.patch("/language")
async def set_language(
    body: SetLanguageRequest,
    user: User = Depends(get_current_user),
) -> dict:
    client = _client_or_503()
    res = (
        client.table("profiles")
        .update({"language": body.language})
        .eq("id", user.id)
        .execute()
    )
    rows = getattr(res, "data", None) or []
    if not rows:
        raise HTTPException(404, "Profile not found")
    return {"ok": True, "language": body.language}


@router.get("/me")
async def get_me(user: User = Depends(get_current_user)) -> dict:
    client = _client_or_503()
    res = (
        client.table("profiles")
        .select("id, role, language, age, sex")
        .eq("id", user.id)
        .single()
        .execute()
    )
    row = getattr(res, "data", None)
    if not row:
        raise HTTPException(404, "Profile not found")
    return row
