"""Audit log writes — one row per triage decision (CDSCO ACP requirement).

Never logs raw symptom text. Inputs are hashed; only an output summary is
stored. If the audit insert fails, the caller MUST propagate the error —
silently dropping audit rows is forbidden.
"""
from __future__ import annotations

import hashlib
import json
import logging
from typing import Any

from app.core.supabase_client import SupabaseNotConfigured, service_client

logger = logging.getLogger(__name__)


class AuditWriteFailed(RuntimeError):
    pass


def _hash_inputs(inputs: dict[str, Any]) -> str:
    """Stable SHA-256 over canonical JSON. Never returns PHI."""
    canonical = json.dumps(inputs, sort_keys=True, default=str, ensure_ascii=False)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def write_audit(
    *,
    event: str,
    session_id: str | None,
    user_id: str | None,
    model_version: str | None,
    inputs: dict[str, Any],
    output_summary: dict[str, Any],
) -> None:
    """Insert one audit row. Raises AuditWriteFailed on any error.

    If Supabase is not configured (local/dev), we log a warning and skip
    — the caller's behaviour shouldn't change in that case.
    """
    try:
        client = service_client()
    except SupabaseNotConfigured:
        logger.warning(
            "audit: Supabase not configured; skipping audit row for event=%s",
            event,
        )
        return

    payload = {
        "event": event,
        "session_id": session_id,
        "user_id": user_id,
        "model_version": model_version,
        "inputs_hash": _hash_inputs(inputs),
        "output_summary": output_summary,
    }
    try:
        client.table("audit_log").insert(payload).execute()
    except Exception as exc:  # supabase-py raises various error types
        logger.exception("audit: insert failed")
        raise AuditWriteFailed(f"Audit log insert failed: {exc}") from exc
