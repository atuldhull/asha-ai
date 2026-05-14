"""POST /api/v1/triage — Plan 2.0.

Pipeline orchestration lives in `app.triage_logic.pipeline.run_pipeline`.
This router handles only:
  - Request parsing (Pydantic v2)
  - Rate limiting (slowapi, keyed on user-id or IP)
  - Optional auth (lifts the response to "authed" path when a JWT is
    present; works anonymously otherwise — the demo never errors on a
    missing token)
  - Persistence: writes the verdict row, appends user message, writes the
    audit_log row. All best-effort if Supabase is configured; if any one
    of those raises (and Supabase IS configured), the request 500s — we
    never silently drop audit rows.
"""
from __future__ import annotations

import logging
from typing import Any
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request, status

from app.core.audit import AuditWriteFailed, write_audit
from app.core.auth import User, get_optional_user
from app.core.disclaimers import DISCLAIMER
from app.core.rate_limit import TRIAGE_RATE_LIMIT, limiter
from app.core.supabase_client import (
    SupabaseNotConfigured,
    is_configured,
    service_client,
)
from app.models.triage import TriageRequest, TriageResponse
from app.triage_logic.esi import LEVEL_TO_DB_CODE
from app.triage_logic.pipeline import PipelineResult, run_pipeline

router = APIRouter(tags=["triage"])
logger = logging.getLogger(__name__)


def _persist_verdict(
    *, result: PipelineResult, user: User | None, session_id: UUID | None,
    symptoms_text: str,
) -> UUID | None:
    """Write the verdict + (optional) user message to Supabase.

    Returns the verdict_id, or None when Supabase isn't configured.
    """
    if not is_configured():
        return None
    if user is None or session_id is None:
        # Plan 2.0 spec: only persist when we have both an authed user
        # and a session context.
        return None
    try:
        client = service_client()
    except SupabaseNotConfigured:
        return None

    # Append the user message so doctor cockpit / history shows the turn.
    try:
        client.table("messages").insert({
            "session_id": str(session_id),
            "role": "user",
            "content": symptoms_text,
        }).execute()
    except Exception:
        logger.exception("triage: failed to append user message (continuing).")

    verdict_payload: dict[str, Any] = {
        "session_id": str(session_id),
        "level": LEVEL_TO_DB_CODE[result.final_level],
        "esi": result.esi,
        "confidence": result.ml_confidence,
        "red_flags": [
            {
                "rule_id": f.rule_id,
                "rule_name": f.rule_name,
                "citation": f.citation,
            }
            for f in result.flags
        ],
        "symptoms": result.symptom_tokens,
        "explanation": {
            "ml_label": result.ml_label,
            "severity": result.severity_score,
            "history": result.history_tokens,
            "vitals": result.vitals,
        },
        "model_version": result.ml_version,
    }
    inserted = client.table("verdicts").insert(verdict_payload).execute()
    rows = getattr(inserted, "data", None) or []
    if rows and rows[0].get("id"):
        return UUID(rows[0]["id"])
    return None


@router.post(
    "/triage",
    response_model=TriageResponse,
    response_model_exclude_none=True,
)
@limiter.limit(TRIAGE_RATE_LIMIT)
async def triage(
    request: Request,
    req: TriageRequest,
    user: User | None = Depends(get_optional_user),
) -> TriageResponse:
    if user is not None:
        # Propagate user id so the rate limiter (and downstream code)
        # can see it; SlowAPI keys off `X-User-Id` when present.
        request.scope.setdefault("state", {})

    pipeline = run_pipeline(
        symptoms_text=req.symptoms,
        age=req.age,
        sex=req.sex.value if req.sex else None,
        history=req.history,
        vitals=req.vitals,
    )

    # Off-topic (non_medical) refusal becomes a 422; drug_dosing and
    # suicidal_ideation both return 200 with the safety response body.
    if pipeline.refusal_category == "non_medical":
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail={
                "code": "non_medical",
                "message": "ASHA-AI only handles medical triage.",
                "disclaimer": DISCLAIMER,
            },
        )

    # Persist + audit. Both are best-effort when Supabase is missing.
    verdict_id = _persist_verdict(
        result=pipeline,
        user=user,
        session_id=req.session_id,
        symptoms_text=req.symptoms,
    )

    try:
        write_audit(
            event="triage",
            session_id=str(req.session_id) if req.session_id else None,
            user_id=user.id if user else None,
            model_version=pipeline.ml_version,
            inputs={
                "symptom_tokens": pipeline.symptom_tokens,
                "history_tokens": pipeline.history_tokens,
                "vitals": pipeline.vitals,
                "age": req.age,
                "sex": req.sex.value if req.sex else None,
            },
            output_summary={
                "level": pipeline.final_level,
                "esi": pipeline.esi,
                "red_flag_ids": [f.rule_id for f in pipeline.flags],
                "confidence": pipeline.ml_confidence,
            },
        )
    except AuditWriteFailed as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={
                "code": "audit_failure",
                "message": "Audit log write failed; request rejected.",
                "disclaimer": DISCLAIMER,
            },
        ) from exc

    if verdict_id:
        pipeline.response.verdict_id = verdict_id
    return pipeline.response
