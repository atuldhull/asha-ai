"""GET /api/v1/explain/{verdict_id} — Plan 2.0.

Returns the top-5 feature attributions that drove a triage verdict.
Tries SHAP against the XGBoost model when available; falls back to the
severity-CSV heuristic (top symptoms by severity weight) otherwise.

Auth: requires a valid Supabase JWT. Authorisation: the verdict's
session must belong to the calling user, OR the caller must have the
'doctor' role (read access to the last-24h queue).
"""
from __future__ import annotations

import logging
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status

from app.core.auth import User, get_current_user
from app.core.disclaimers import DISCLAIMER
from app.core.supabase_client import SupabaseNotConfigured, service_client
from app.ml.classifier import featurize_for_model
from app.ml.shap_explain import top_k_attributions
from app.models.triage import ExplainResponse, Factor

router = APIRouter(tags=["explain"])
logger = logging.getLogger(__name__)


def _client_or_503():
    try:
        return service_client()
    except SupabaseNotConfigured as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc


def _is_doctor(client, user_id: str) -> bool:
    try:
        res = (
            client.table("profiles")
            .select("role")
            .eq("id", user_id)
            .single()
            .execute()
        )
        row = getattr(res, "data", None)
        return bool(row) and row.get("role") == "doctor"
    except Exception:
        return False


def _authorise(client, verdict_row: dict, user: User) -> None:
    session_id = verdict_row.get("session_id")
    if not session_id:
        raise HTTPException(404, "Verdict not found")
    res = (
        client.table("sessions")
        .select("user_id")
        .eq("id", session_id)
        .single()
        .execute()
    )
    session_row = getattr(res, "data", None)
    if session_row and session_row.get("user_id") == user.id:
        return
    if _is_doctor(client, user.id):
        return
    raise HTTPException(403, "Not authorised to view this verdict")


@router.get("/explain/{verdict_id}", response_model=ExplainResponse)
async def explain(
    verdict_id: UUID,
    user: User = Depends(get_current_user),
) -> ExplainResponse:
    client = _client_or_503()
    res = (
        client.table("verdicts")
        .select("*")
        .eq("id", str(verdict_id))
        .single()
        .execute()
    )
    verdict = getattr(res, "data", None)
    if not verdict:
        raise HTTPException(404, "Verdict not found")

    _authorise(client, verdict, user)

    symptoms = verdict.get("symptoms") or []
    explanation = verdict.get("explanation") or {}
    history = explanation.get("history") or []
    vitals = explanation.get("vitals") or {}

    feature_vector = featurize_for_model(
        symptom_tokens=symptoms,
        age=None,
        sex=None,
        history=history,
        vitals=vitals,
    )
    attributions = top_k_attributions(feature_vector, k=5)
    factors = [
        Factor(name=a["name"], weight=float(a["weight"]), source=a.get("source"))
        for a in attributions
    ]

    summary_parts: list[str] = []
    red_flags = verdict.get("red_flags") or []
    if red_flags:
        names = ", ".join(rf.get("rule_name", rf.get("rule_id", "")) for rf in red_flags)
        summary_parts.append(f"Red flags: {names}.")
    if explanation.get("severity") is not None:
        summary_parts.append(f"Severity score: {float(explanation['severity']):.2f}.")
    if not summary_parts:
        summary_parts.append("No red flags. Verdict driven by severity score and ESI mapping.")

    return ExplainResponse(
        verdict_id=verdict_id,
        factors=factors,
        summary=" ".join(summary_parts),
        citations=[rf.get("citation", "") for rf in red_flags if rf.get("citation")],
        disclaimer=DISCLAIMER,
    )
