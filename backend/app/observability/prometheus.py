"""Prometheus metrics — Plan 6.6 Phase H.

Wires `prometheus_fastapi_instrumentator` when installed; otherwise
no-op. Exposes the standard metrics at `/metrics` so a Grafana scrape
job can pull request rates, latency histograms, status-code
distributions, and so on. No PHI is emitted — path templates only
(`/api/v1/triage`, not the body).

Enable in production by:
  1. `pip install prometheus-fastapi-instrumentator` (or the runtime
     install path on Render — see PENDING_USER_ACTIONS).
  2. Optionally set `METRICS_TOKEN` to gate `/metrics` behind a
     shared-secret header (recommended — Render exposes the path
     publicly otherwise).
"""
from __future__ import annotations

import logging
import os
from typing import Any

logger = logging.getLogger(__name__)


def instrument_app(app: Any) -> bool:
    """Attach Prometheus middleware + /metrics route. No-op if absent."""
    try:
        from prometheus_fastapi_instrumentator import Instrumentator  # type: ignore[import-not-found]
    except ImportError:
        logger.info(
            "prometheus: prometheus-fastapi-instrumentator not installed; "
            "/metrics endpoint not exposed",
        )
        return False

    instrumentator = (
        Instrumentator(
            should_group_status_codes=True,
            should_ignore_untemplated=True,
            should_respect_env_var=False,
            should_instrument_requests_inprogress=True,
            excluded_handlers=["/metrics", "/health"],
            inprogress_name="asha_inprogress",
            inprogress_labels=True,
        )
        .instrument(app)
        .expose(
            app,
            include_in_schema=False,
            endpoint=os.getenv("METRICS_PATH", "/metrics"),
        )
    )
    logger.info("prometheus: instrumentator attached (path=%s)",
                os.getenv("METRICS_PATH", "/metrics"))
    return True
