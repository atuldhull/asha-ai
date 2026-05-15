"""Plan 6.6 Phase B — DPDP right-to-deletion endpoint.

  DELETE /api/v1/user/data        — soft-delete now, hard-delete after 72h
  GET    /api/v1/user/data/status — current deletion state for the user

Soft-delete marks every row owned by the user with `deleted_at = now()`.
A separate sweeper (apscheduler job to land in Plan 6.6 Phase J) runs
every hour and hard-deletes anything where `hard_delete_after <= now()`.
"""
from __future__ import annotations

import logging
import os

from fastapi import APIRouter, Depends, HTTPException, Request, status

from app.core.audit import AuditWriteFailed, write_audit
from app.core.auth import User, get_current_user
from app.core.dpdp_store import (
    get_deletion_status,
    hash_ip,
    record_deletion,
)
from app.core.rate_limit import limiter
from app.models.consent import (
    DeletionRequest,
    DeletionResponse,
    DeletionStatus,
)

router = APIRouter(tags=["user_data"])
logger = logging.getLogger(__name__)

_USER_DATA_RATE_LIMIT = os.getenv("RATE_LIMIT_USER_DATA", "5/minute")
_CONFIRM_PHRASE = "DELETE MY DATA"


@router.delete(
    "/user/data",
    response_model=DeletionResponse,
    status_code=status.HTTP_200_OK,
)
@limiter.limit(_USER_DATA_RATE_LIMIT)
async def delete_user_data(
    request: Request,
    body: DeletionRequest,
    user: User = Depends(get_current_user),
) -> DeletionResponse:
    if body.confirm_phrase != _CONFIRM_PHRASE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=(
                "Deletion not confirmed. Send confirm_phrase exactly equal "
                f"to '{_CONFIRM_PHRASE}'."
            ),
        )

    result = record_deletion(user_id=user.id, reason=body.reason)

    # Audit-log the deletion request itself — required by DPDP §13 so
    # the regulator can verify we honored the right within the SLA.
    try:
        write_audit(
            event="dpdp_right_to_deletion",
            session_id=None,
            user_id=user.id,
            model_version=None,
            inputs={"reason_provided": bool(body.reason)},
            output_summary={
                "deletion_id": result.deletion_id,
                "hard_delete_after": result.hard_delete_after,
            },
        )
    except AuditWriteFailed as exc:
        # Audit failure on a deletion is a regulatory issue, not a user
        # one. We still return success (the soft-delete is recorded);
        # the audit write is retried by the sweeper.
        logger.exception("user_data: audit log failed for deletion %s", result.deletion_id)
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail={
                "code": "audit_failure",
                "message": (
                    "Soft-delete recorded but audit write failed. "
                    "Operations will retry; your data is queued for "
                    "hard-deletion at the scheduled time."
                ),
            },
        ) from exc

    return result


@router.get("/user/data/status", response_model=DeletionStatus)
async def deletion_status(
    user: User = Depends(get_current_user),
) -> DeletionStatus:
    return get_deletion_status(user.id)
