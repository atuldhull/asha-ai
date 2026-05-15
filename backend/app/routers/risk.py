"""POST /api/v1/risk/compute — Plan 5.1.

Anonymous-friendly (no auth required), same posture as /triage. Rate
limited at 30 req/min/key — generous enough for the doctor cockpit to
recompute a sparkline as new history points come in, tight enough to
keep the deterministic scorer honest under load.

Latency target: p95 < 10ms (pure Python, no I/O).
"""
from __future__ import annotations

import os

from fastapi import APIRouter, Request

from app.core.rate_limit import limiter
from app.models.risk import RiskAssessment, RiskComputeRequest
from app.risk.scoring import compute_score

router = APIRouter(tags=["risk"])

_RISK_RATE_LIMIT = os.getenv("RATE_LIMIT_RISK", "30/minute")


@router.post(
    "/risk/compute",
    response_model=RiskAssessment,
    response_model_exclude_none=True,
)
@limiter.limit(_RISK_RATE_LIMIT)
async def compute(request: Request, req: RiskComputeRequest) -> RiskAssessment:
    return compute_score(req)
