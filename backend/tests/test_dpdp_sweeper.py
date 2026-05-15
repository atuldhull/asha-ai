"""Plan 6.6 Phase J — DPDP hard-delete sweeper tests.

The sweeper runs against Supabase when configured. In the test env
Supabase is NOT configured, so we verify:
  1. The sweeper short-circuits gracefully when Supabase is unwired.
  2. The CLI returns the expected exit code in that state.
  3. The SweepResult dataclass shape stays stable.
"""
from __future__ import annotations

from app.jobs.dpdp_sweeper import SweepResult, run_once


def test_sweeper_short_circuits_when_supabase_unconfigured():
    """In test env Supabase is unset → run_once returns an empty result."""
    result = run_once()
    assert isinstance(result, SweepResult)
    assert result.scanned == 0
    assert result.processed == 0
    assert result.skipped == 0
    assert result.errors == []
    assert result.rows_deleted_by_table == {}


def test_sweepresult_dataclass_defaults():
    """Empty SweepResult is well-formed — important for the CLI's pprint."""
    r = SweepResult()
    assert r.scanned == 0
    assert r.processed == 0
    assert r.errors == []
    assert r.rows_deleted_by_table == {}


def test_cli_returns_nonzero_when_supabase_unwired(monkeypatch):
    """Run the CLI in-process and capture its exit code."""
    monkeypatch.delenv("SUPABASE_URL", raising=False)
    monkeypatch.delenv("SUPABASE_SERVICE_ROLE_KEY", raising=False)

    from scripts import run_dpdp_sweeper as cli

    rc = cli.main()
    # 1 = configured-but-nothing-found OR supabase-unwired (which is
    # what we expect in CI/local without Supabase env). 0 is the
    # happy-path return when Supabase IS wired but nothing's due.
    assert rc == 1
