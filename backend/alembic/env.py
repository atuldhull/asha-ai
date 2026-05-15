"""Alembic environment script for ASHA-AI · Tier 6.6 Phase D.

Reads `DATABASE_URL` from the environment (matches the rest of the backend).
Imports SQLAlchemy metadata from `app.db.base` for autogenerate support — if
the app doesn't yet have a declarative Base, we fall back to migrations that
operate purely on raw DDL (which is fine for our existing `db/migrations/*.sql`
ported into Alembic).

Usage (from backend/):
    alembic upgrade head
    alembic revision --autogenerate -m "add red_flag_predictions table"
"""
from __future__ import annotations

import os
import sys
from logging.config import fileConfig
from pathlib import Path

from sqlalchemy import engine_from_config, pool

from alembic import context

# ──────────── Logging ────────────
config = context.config
if config.config_file_name:
    fileConfig(config.config_file_name)

# ──────────── Path setup so `app.*` is importable ────────────
BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

# ──────────── DATABASE_URL from env ────────────
database_url = os.getenv("DATABASE_URL")
if database_url:
    config.set_main_option("sqlalchemy.url", database_url)
else:
    # Sensible local default for dev — Mumbai-region Supabase or local postgres.
    config.set_main_option(
        "sqlalchemy.url",
        "postgresql+psycopg://asha:asha@localhost:5432/asha_ai",
    )

# ──────────── Metadata import (optional — graceful if app.db.base absent) ────────────
target_metadata = None
try:
    from app.db.base import Base  # type: ignore
    target_metadata = Base.metadata
except ImportError:
    # No SQLAlchemy declarative Base yet — autogenerate disabled; migrations
    # are still hand-authored. This is fine for the initial port from raw SQL.
    pass


def run_migrations_offline() -> None:
    """Generate SQL files rather than running against the live DB.

    Useful for review / pre-prod approval.
    """
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        compare_type=True,
        compare_server_default=True,
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    """Run migrations against the live DB."""
    connectable = engine_from_config(
        config.get_section(config.config_ini_section) or {},
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            compare_type=True,
            compare_server_default=True,
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
