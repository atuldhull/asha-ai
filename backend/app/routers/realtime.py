"""Ably webhook bridge — Plan 6.4 realtime push.

Doctor cockpit + mobile push notifications: when a triage verdict
crosses the CRITICAL risk threshold (Plan 5.1), publish to the Ably
channel `risk:<patient_id>` so subscribers (doctor dashboard, FCM
webhook) react immediately.

Anonymous-friendly. Graceful degradation when `ABLY_API_KEY` is unset —
the publish call short-circuits to a no-op and returns
`{"status": "skipped", "reason": "ably_unconfigured"}` so the rest of
the triage flow never breaks because of a missing third-party key.

Dedup: same `patient_id` may not be re-pushed within 5 minutes. The
window is configurable via `ABLY_DEDUP_SECONDS`.
"""
from __future__ import annotations

import logging
import os
import time
from typing import Any

import httpx
from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel, ConfigDict, Field

from app.core.auth import User, get_optional_user
from app.core.rate_limit import limiter
from app.models.risk import RiskAssessment

router = APIRouter(tags=["realtime"])
logger = logging.getLogger(__name__)

_REALTIME_RATE_LIMIT = os.getenv("RATE_LIMIT_REALTIME", "60/minute")
_ABLY_DEDUP_SECONDS = float(os.getenv("ABLY_DEDUP_SECONDS", "300"))
_ABLY_REST_URL = os.getenv(
    "ABLY_REST_URL", "https://rest.ably.io",
).rstrip("/")

# In-memory dedup map: { patient_id: last_publish_ts }. For multi-worker
# deployments this should be backed by Redis/Valkey — flagged in
# [backend/migration_6_5_plan_b.md] as a Tier 6.5 follow-up.
_last_publish: dict[str, float] = {}


def _ably_configured() -> bool:
    return bool(os.getenv("ABLY_API_KEY"))


class PushRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")
    patient_id: str = Field(..., min_length=8, max_length=128)
    risk: RiskAssessment


class PushResult(BaseModel):
    status: str  # "published" | "skipped"
    reason: str | None = None
    channel: str | None = None
    dedup_age_seconds: float | None = None


async def _publish_to_ably(channel: str, payload: dict[str, Any]) -> bool:
    key = os.getenv("ABLY_API_KEY")
    if not key:
        return False
    url = f"{_ABLY_REST_URL}/channels/{channel}/messages"
    try:
        async with httpx.AsyncClient(timeout=4.0) as client:
            r = await client.post(
                url,
                auth=tuple(key.split(":", 1)),  # Basic auth: key_id:key_secret
                json={"name": "risk.critical", "data": payload},
            )
        return r.status_code in {200, 201, 204}
    except httpx.HTTPError:
        logger.exception("ably: publish failed for channel=%s", channel)
        return False


@router.post("/realtime/push-critical", response_model=PushResult)
@limiter.limit(_REALTIME_RATE_LIMIT)
async def push_critical(
    request: Request,
    body: PushRequest,
    user: User | None = Depends(get_optional_user),
) -> PushResult:
    if not _ably_configured():
        return PushResult(status="skipped", reason="ably_unconfigured")

    if body.risk.level.value != "CRITICAL":
        return PushResult(status="skipped", reason="risk_below_critical")

    now = time.time()
    last = _last_publish.get(body.patient_id)
    if last is not None and (now - last) < _ABLY_DEDUP_SECONDS:
        return PushResult(
            status="skipped",
            reason="dedup_window",
            dedup_age_seconds=now - last,
        )

    channel = f"risk:{body.patient_id}"
    payload = {
        "patient_id": body.patient_id,
        "risk_score": body.risk.score,
        "risk_level": body.risk.level.value,
        "trajectory": body.risk.trajectory.value,
        "action": body.risk.action,
        "ts": now,
    }
    published = await _publish_to_ably(channel, payload)
    if not published:
        return PushResult(status="skipped", reason="publish_failed", channel=channel)

    _last_publish[body.patient_id] = now
    return PushResult(status="published", channel=channel)
