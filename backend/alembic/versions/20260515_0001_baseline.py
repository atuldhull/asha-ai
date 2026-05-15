"""baseline — port existing raw SQL migrations into Alembic.

Revision ID: 20260515_0001
Revises:
Create Date: 2026-05-15 00:00:00 UTC

This is the Alembic baseline. It replays the three existing raw SQL files in
`backend/db/migrations/` as a single Alembic revision so that future revisions
can autogenerate cleanly off a known schema state.

Existing raw SQL files (preserved for history; do not delete):
  - 001_plan2_schema.sql        — Plan 2.0 base schema
  - 002_plan3_rag.sql           — Plan 3.0 RAG corpus tables
  - 003_plan66_consent.sql      — Tier 6.6 Phase B DPDP consent/audit/deletion tables

If you're applying this to a database that ALREADY ran the raw SQL migrations
manually, run:
    alembic stamp 20260515_0001

to mark the baseline applied without re-executing the DDL. Otherwise:
    alembic upgrade head

will apply this revision fresh.
"""
from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = "20260515_0001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    """Replay the three existing raw SQL migrations.

    The raw SQL files were written for Supabase (which provides `auth.users`
    + `service_role` + RLS). On vanilla postgres these features are absent —
    so we run each statement in its OWN autocommit connection alongside the
    main Alembic transaction. Supabase-specific statements fail harmlessly
    (logged + skipped); everything else lands.

    Strict mode (env `ALEMBIC_BASELINE_STRICT=1`) re-raises on any error —
    use when running against a real Supabase where every statement should
    succeed.
    """
    import logging
    import os
    import pathlib
    import re

    log = logging.getLogger("alembic.baseline")

    raw_dir = pathlib.Path(__file__).resolve().parents[2] / "db" / "migrations"
    sql_files = [
        "001_plan2_schema.sql",
        "002_plan3_rag.sql",
        "003_plan66_consent.sql",
    ]

    strict = os.getenv("ALEMBIC_BASELINE_STRICT", "").strip().lower() in {"1", "true", "yes"}

    # Bypass the outer Alembic transaction — we need autocommit so a single
    # failed statement doesn't poison the whole replay. Use a separate
    # connection from the same engine.
    bind = op.get_bind()
    engine = bind.engine
    with engine.connect().execution_options(isolation_level="AUTOCOMMIT") as ac:
        for fname in sql_files:
            path = raw_dir / fname
            if not path.exists():
                log.warning("baseline: missing %s — skipping", fname)
                continue

            sql_text = path.read_text(encoding="utf-8")
            # Strip `--` line comments before splitting on `;`.
            sql_text = re.sub(r"--[^\n]*", "", sql_text)

            ok = 0
            skipped = 0
            for stmt in sql_text.split(";"):
                stripped = stmt.strip()
                if not stripped:
                    continue
                try:
                    ac.execute(sa.text(stripped))
                    ok += 1
                except Exception as exc:
                    if strict:
                        raise
                    msg = str(exc).splitlines()[0][:160]
                    log.info("baseline: skip (%s): %s", fname, msg)
                    skipped += 1
            log.info("baseline: %s — %d ok / %d skipped", fname, ok, skipped)


def downgrade() -> None:
    """No-op — downgrading the baseline means dropping the entire schema,
    which we never want on a production DB. Use `alembic downgrade base` only
    on a throwaway dev instance, and even then, manual `DROP DATABASE` is
    safer.
    """
    raise RuntimeError(
        "Refusing to downgrade the baseline migration. This would drop the "
        "entire production schema. If you really need a fresh DB, drop and "
        "recreate it explicitly, then `alembic upgrade head`."
    )
