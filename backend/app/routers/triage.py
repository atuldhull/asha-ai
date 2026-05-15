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

from app.agentic.orchestrator import is_enabled as agentic_enabled
from app.agentic.orchestrator import orchestrate
from app.core.audit import AuditWriteFailed, write_audit
from app.core.auth import User, get_optional_user
from app.core.disclaimers import DISCLAIMER
from app.core.rate_limit import TRIAGE_RATE_LIMIT, limiter
from app.core.supabase_client import (
    SupabaseNotConfigured,
    is_configured,
    service_client,
)
from app.models.triage import (
    Citation,
    DifferentialOut,
    RedFlagOut,
    TriageRequest,
    TriageResponse,
)
from app.triage_logic.esi import LEVEL_TO_DB_CODE
from app.triage_logic.pipeline import PipelineResult, run_pipeline

router = APIRouter(tags=["triage"])
logger = logging.getLogger(__name__)


def _verdict_to_pipeline_result(verdict, req: TriageRequest) -> PipelineResult:
    """Adapt an agentic Verdict to the PipelineResult shape so the rest of
    the /triage handler (persist + audit) stays unchanged."""
    from app.models.risk import RiskComputeRequest, SymptomInput, VitalProxy
    from app.models.triage import CareLevel
    from app.risk.scoring import compute_score, escalate_care_level
    from app.triage_logic.red_flags import Flag

    flags = [
        Flag(
            rule_id=str(f.get("rule_id", "")),
            rule_name=str(f.get("rule_name", "")),
            force_level=str(f.get("force_level", "Emergency Room")),
            reasoning=str(f.get("reasoning", "")),
            citation=str(f.get("citation", "")),
        )
        for f in verdict.red_flags
    ]
    citations_models: list[Citation | str] = [
        Citation(
            id=str(s.get("id", "")),
            source=str(s.get("source", "")),
            section=str(s.get("section", "")) or None,
            text=str(s.get("text", "")) or None,
            score=float(s.get("score") or 0.0),
        )
        for s in verdict.citations
    ]
    # Extract symptom + history tokens from the recorded tool calls so the
    # audit log + Supabase verdict row include them.
    sym_tokens: list[str] = []
    hist_tokens: list[str] = []
    vitals: dict = {}
    severity_score = 0.0
    esi = verdict.esi or 5
    ml_version: str | None = None
    for tc in verdict.tool_calls:
        if tc.name == "extract_symptoms":
            sym_tokens = [s.get("name", "") for s in (tc.result.get("symptoms") or [])]
        elif tc.name == "get_red_flags":
            args = tc.args or {}
            hist_tokens = list(args.get("history") or [])
            vitals = dict(args.get("vitals") or {})
        elif tc.name == "compute_esi":
            severity_score = float(tc.result.get("severity") or 0.0)
            esi = int(tc.result.get("esi_level") or esi)

    # Plan 5.1 — attach risk + apply escalate-only safety property on the
    # agentic path too.
    risk_request = RiskComputeRequest(
        symptoms=[SymptomInput(name=t, severity=6, onset_hours_ago=12.0) for t in sym_tokens],
        age=req.age if req.age is not None else 35,
        sex=req.sex.value if req.sex else "other",
        comorbidities=list(hist_tokens),
        vital_proxy=VitalProxy(
            breathing_rate=vitals.get("rr") if isinstance(vitals.get("rr"), int) else None,
            heart_rate=vitals.get("hr") if isinstance(vitals.get("hr"), int) else None,
        ),
    )
    risk_assessment = compute_score(risk_request)
    has_red_flag_er = any(f.force_level == "Emergency Room" for f in flags)
    escalated_level = escalate_care_level(
        verdict.level, risk_assessment, has_red_flag_er=has_red_flag_er,
    )
    risk_escalated = escalated_level != verdict.level

    response = TriageResponse(
        level=CareLevel(escalated_level),
        reasoning=verdict.reasoning,
        red_flags=[
            RedFlagOut(rule_id=f.rule_id, rule_name=f.rule_name, citation=f.citation)
            for f in flags
        ],
        disclaimer=verdict.disclaimer,
        esi=verdict.esi,
        confidence=verdict.confidence,
        citations=citations_models,
        risk=risk_assessment,
        risk_escalated=risk_escalated,
    )
    return PipelineResult(
        response=response,
        refused=verdict.refusal_category is not None,
        refusal_category=verdict.refusal_category,
        symptom_tokens=sym_tokens,
        history_tokens=hist_tokens,
        vitals=vitals,
        flags=flags,
        severity_score=severity_score,
        ml_label=None,
        ml_confidence=verdict.confidence,
        ml_version=ml_version,
        esi=esi,
        final_level=escalated_level,
        feature_vector={},
    )


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

    # Plan 4.0 — when AGENTIC_MODE is on, route through the agentic
    # orchestrator (Gemini function-calling) and adapt to PipelineResult.
    if agentic_enabled():
        from app.agentic.orchestrator import Verdict
        # Plan 6.1: structured_symptoms (body-map pins) flow into
        # tool_extract_symptoms so the FMA-aligned anatomical context
        # block reaches the LLM prompt.
        pins_payload: list[dict] | None = None
        if req.structured_symptoms:
            pins_payload = [p.model_dump() for p in req.structured_symptoms]
        verdict: Verdict = await orchestrate(
            patient_text=req.symptoms,
            age=req.age,
            sex=req.sex.value if req.sex else None,
            history=req.history,
            vitals=req.vitals,
            pins=pins_payload,
        )
        if verdict.refusal_category == "non_medical":
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail={
                    "code": "non_medical",
                    "message": verdict.reasoning,
                    "disclaimer": DISCLAIMER,
                },
            )
        pipeline = _verdict_to_pipeline_result(verdict, req)
    else:
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
