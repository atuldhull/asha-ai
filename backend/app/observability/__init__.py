"""Plan 6.6 Phase H — production observability.

Wires Sentry (errors) + Prometheus (metrics) into the FastAPI app at
startup. Both are no-ops when the relevant env vars / packages are
absent, so dev/test runs aren't forced to install heavy SDKs.
"""
from app.observability.sentry import init_sentry
from app.observability.prometheus import instrument_app

__all__ = ["init_sentry", "instrument_app"]
