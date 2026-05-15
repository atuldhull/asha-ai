-- ASHA-AI · postgres + postgis init script
-- Runs once on first boot of the postgres container (via /docker-entrypoint-initdb.d/).
-- Enables PostGIS for Plan 5.4 outbreak detection and pgvector for RAG.

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS postgis_topology;
CREATE EXTENSION IF NOT EXISTS pgcrypto;        -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- pgvector for Plan 3.0+ RAG semantic search.
CREATE EXTENSION IF NOT EXISTS vector;

-- Alembic migrations (backend/alembic) take over from here.
-- See backend/alembic/versions/* for schema history.
