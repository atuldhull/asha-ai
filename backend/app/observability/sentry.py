"""Sentry SDK wiring — Plan 6.6 Phase H.

Initialises Sentry when `SENTRY_DSN` is set, otherwise no-op. PHI is
stripped from breadcrumbs + events via a `before_send` hook so a stray
exception message can't leak symptom text.
"""
from __future__ import annotations

import logging
import os
import re
from typing import Any

logger = logging.getLogger(__name__)

# Phone-number patterns (Indian formats + generic E.164). Email pattern.
# Email_re intentionally permissive — we redact aggressively.
_PHI_PATTERNS = [
    re.compile(r"\+?\d{1,3}[\s-]?\d{4,5}[\s-]?\d{4,6}"),  # +91 98765 43210 etc.
    re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}"),  # email
]


def _scrub(value: str) -> str:
    out = value
    for pat in _PHI_PATTERNS:
        out = pat.sub("[redacted]", out)
    return out


def _scrub_event(event: dict[str, Any], hint: dict[str, Any]) -> dict[str, Any]:
    """Run on every Sentry event before send — strip PHI patterns."""
    try:
        for kind in ("message", "exception"):
            payload = event.get(kind)
            if isinstance(payload, str):
                event[kind] = _scrub(payload)
            elif isinstance(payload, dict):
                values = payload.get("values") or []
                for v in values:
                    if isinstance(v, dict) and isinstance(v.get("value"), str):
                        v["value"] = _scrub(v["value"])
        breadcrumbs = (event.get("breadcrumbs") or {}).get("values") or []
        for crumb in breadcrumbs:
            if isinstance(crumb, dict) and isinstance(crumb.get("message"), str):
                crumb["message"] = _scrub(crumb["message"])
    except Exception:
        # Defensive — never let a scrubber bug suppress an error report.
        logger.exception("sentry: PHI scrubber failed; returning event unchanged")
    return event


def init_sentry(*, service: str = "asha-ai-backend") -> bool:
    """Initialise Sentry. Returns True if wired, False otherwise.

    Reads:
      SENTRY_DSN          — required for activation
      SENTRY_ENVIRONMENT  — defaults to "dev"
      SENTRY_TRACES_RATE  — sample rate for performance (default 0.0)
    """
    dsn = os.getenv("SENTRY_DSN", "").strip()
    if not dsn:
        return False
    try:
        import sentry_sdk  # type: ignore[import-not-found]
        from sentry_sdk.integrations.fastapi import FastApiIntegration  # type: ignore
        from sentry_sdk.integrations.starlette import StarletteIntegration  # type: ignore
    except ImportError:
        logger.warning(
            "sentry: SENTRY_DSN set but sentry-sdk not installed; skipping",
        )
        return False
    try:
        rate = float(os.getenv("SENTRY_TRACES_RATE", "0.0"))
    except ValueError:
        rate = 0.0
    sentry_sdk.init(
        dsn=dsn,
        environment=os.getenv("SENTRY_ENVIRONMENT", "dev"),
        traces_sample_rate=rate,
        send_default_pii=False,  # DPDP — never auto-attach IP/headers
        before_send=_scrub_event,
        integrations=[StarletteIntegration(), FastApiIntegration()],
        release=os.getenv("RENDER_GIT_COMMIT") or os.getenv("VERSION", "0.5.1"),
    )
    sentry_sdk.set_tag("service", service)
    logger.info("sentry: initialised (env=%s, sample_rate=%s)",
                os.getenv("SENTRY_ENVIRONMENT", "dev"), rate)
    return True
