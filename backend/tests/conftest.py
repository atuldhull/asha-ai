"""Pytest configuration.

Disables the /triage rate limit during tests by setting an absurdly high
limit before the app module imports. Done here so we don't have to thread
this through every test.
"""
from __future__ import annotations

import os

os.environ.setdefault("RATE_LIMIT_TRIAGE", "10000/minute")
