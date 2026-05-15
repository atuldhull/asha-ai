"""Plan 6.6 Phase J — DPDP hard-delete sweeper.

Looks for `deletion_log` rows where `hard_delete_after <= now()` AND
`completed_at IS NULL`. For each, hard-deletes the user's
soft-deleted rows from `sessions`, `messages`, `verdicts`, then marks
the deletion_log row complete.

The endpoint `DELETE /api/v1/user/data` records the soft-delete + the
hard-delete deadline; THIS module is what actually scrubs the rows
after the 72h grace. Single-pass design — schedule via cron / k8s
CronJob / GitHub Actions / apscheduler. See PENDING_USER_ACTIONS.md
PLAN 6.6 Phase J for the recommended schedule.

Audit row format: `event=dpdp_hard_delete_completed` with
`{deletion_id, rows_deleted_per_table}` as the output summary.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import datetime, timezone

from app.core.audit import AuditWriteFailed, write_audit
from app.core.supabase_client import SupabaseNotConfigured, is_configured, service_client

logger = logging.getLogger(__name__)

# Tables that hold per-user data. The soft-delete flow on
# `DELETE /user/data` sets `deleted_at` on each row owned by the user;
# we hard-delete here using `user_id` + `deleted_at IS NOT NULL`.
_PER_USER_TABLES = ("sessions", "messages", "verdicts")


@dataclass
class SweepResult:
    scanned: int = 0
    processed: int = 0
    skipped: int = 0
    rows_deleted_by_table: dict[str, int] = None  # type: ignore[assignment]
    errors: list[str] = None  # type: ignore[assignment]

    def __post_init__(self) -> None:
        if self.rows_deleted_by_table is None:
            self.rows_deleted_by_table = {}
        if self.errors is None:
            self.errors = []


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def run_once() -> SweepResult:
    """Single pass. Returns a SweepResult summarising what happened.

    Idempotent: a deletion already marked complete is skipped.
    Crash-safe: if a hard-delete partially fails, the row stays
    `completed_at IS NULL` so the next pass retries.
    """
    result = SweepResult()
    if not is_configured():
        logger.warning("dpdp_sweeper: Supabase not configured — nothing to sweep")
        return result

    try:
        client = service_client()
    except SupabaseNotConfigured:
        logger.warning("dpdp_sweeper: service_client unavailable; aborting pass")
        return result

    now_iso = _now_iso()
    try:
        res = (
            client.table("deletion_log")
            .select("id, user_id, hard_delete_after, completed_at")
            .is_("completed_at", "null")
            .lte("hard_delete_after", now_iso)
            .execute()
        )
        rows = getattr(res, "data", None) or []
    except Exception as exc:
        logger.exception("dpdp_sweeper: failed to scan deletion_log")
        result.errors.append(f"scan: {type(exc).__name__}: {exc}")
        return result

    result.scanned = len(rows)
    if not rows:
        return result

    for row in rows:
        deletion_id = row.get("id")
        user_id = row.get("user_id")
        if not deletion_id or not user_id:
            result.skipped += 1
            continue
        per_table: dict[str, int] = {}
        ok = True
        for table in _PER_USER_TABLES:
            try:
                # Hard-delete only the soft-deleted rows owned by this
                # user. Rows that were never soft-deleted (somehow not
                # captured by the original DELETE /user/data sweep) are
                # left for a future pass — visibility into the gap
                # comes from per-table count = 0.
                deleted = (
                    client.table(table)
                    .delete()
                    .eq("user_id", user_id)
                    .not_.is_("deleted_at", "null")
                    .execute()
                )
                count = len(getattr(deleted, "data", None) or [])
                per_table[table] = count
                result.rows_deleted_by_table[table] = (
                    result.rows_deleted_by_table.get(table, 0) + count
                )
            except Exception as exc:
                logger.exception(
                    "dpdp_sweeper: hard-delete failed for table=%s user=%s deletion=%s",
                    table, user_id, deletion_id,
                )
                result.errors.append(
                    f"{table}/{deletion_id}: {type(exc).__name__}: {exc}"
                )
                ok = False
                break

        if not ok:
            # Leave completed_at NULL — next pass will retry.
            continue

        try:
            client.table("deletion_log").update({"completed_at": _now_iso()}) \
                .eq("id", deletion_id).execute()
        except Exception as exc:
            logger.exception(
                "dpdp_sweeper: failed to mark deletion_log complete deletion=%s",
                deletion_id,
            )
            result.errors.append(
                f"mark_complete/{deletion_id}: {type(exc).__name__}: {exc}"
            )
            continue

        try:
            write_audit(
                event="dpdp_hard_delete_completed",
                session_id=None,
                user_id=user_id,
                model_version=None,
                inputs={"deletion_id": deletion_id},
                output_summary={"rows_deleted": per_table},
            )
        except AuditWriteFailed:
            logger.exception("dpdp_sweeper: audit write failed deletion=%s", deletion_id)
            # The hard-delete succeeded; the audit row is the regulator-
            # visible event. Re-queue by clearing completed_at so the
            # next pass writes the audit again.
            try:
                client.table("deletion_log").update({"completed_at": None}) \
                    .eq("id", deletion_id).execute()
            except Exception:
                logger.exception("dpdp_sweeper: failed to re-queue deletion=%s", deletion_id)
            result.errors.append(f"audit/{deletion_id}: audit write failed")
            continue

        result.processed += 1

    return result
