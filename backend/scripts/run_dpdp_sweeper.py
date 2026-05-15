"""CLI wrapper for the DPDP hard-delete sweeper.

Run on a schedule (cron / k8s CronJob / GitHub Actions schedule /
apscheduler). One pass per invocation. Exits 0 on a clean run,
1 if Supabase is unconfigured, 2 if any deletion errored.

Usage:
    .venv\\Scripts\\python.exe -m scripts.run_dpdp_sweeper

Recommended schedule: every hour. The hard_delete_after is 72h after
soft-delete, so hourly polling adds ≤1h of grace beyond the legal
deadline (DPDP §13 doesn't pin an exact SLA but "reasonable time" is
the standard; 72h + 1h is well within that).
"""
from __future__ import annotations

import sys

from app.jobs.dpdp_sweeper import run_once


def main() -> int:
    result = run_once()
    print("==== DPDP hard-delete sweeper ====")
    print(f"Scanned:    {result.scanned} pending deletions")
    print(f"Processed:  {result.processed}")
    print(f"Skipped:    {result.skipped}")
    if result.rows_deleted_by_table:
        print(f"Rows deleted by table: {result.rows_deleted_by_table}")
    if result.errors:
        print(f"\n!! Errors ({len(result.errors)}) !!")
        for err in result.errors:
            print(f"  {err}")
        return 2
    if result.scanned == 0 and result.processed == 0:
        # Nothing to do is success, but exit 1 when Supabase is unwired
        # so an unscheduled-but-misconfigured deploy is visible. The
        # sweeper logs the actual reason at WARNING level.
        from app.core.supabase_client import is_configured
        if not is_configured():
            return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
