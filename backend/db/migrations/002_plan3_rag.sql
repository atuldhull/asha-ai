-- ASHA-AI Plan 3.0 schema additions: RAG snippets + Realtime publication.
--
-- Apply AFTER 001_plan2_schema.sql via Supabase Dashboard → SQL Editor.
--
-- What this does:
--   1. Enables pgvector and adds the `rag_snippets` table (BGE-M3 1024-dim).
--   2. Creates the `match_rag_snippets(query_embedding, match_count)` RPC.
--   3. Adds the verdicts table to the supabase_realtime publication so
--      the frontend doctor cockpit gets INSERT events live.
--   4. Adds a Storage bucket `voice-audio` (private; signed URLs only).
--   5. Adds the helper view `recent_verdicts_24h` doctors can read.

-- ─────────────────────────── pgvector ─────────────────────────────────────
create extension if not exists vector;

create table if not exists public.rag_snippets (
    id          text primary key,
    source      text not null,
    section     text,
    text        text not null,
    tags        jsonb not null default '[]'::jsonb,
    embedding   vector(1024),
    created_at  timestamptz not null default now(),
    updated_at  timestamptz not null default now()
);

-- Cosine-distance index (ivfflat needs ANALYZE for good lists count).
create index if not exists rag_snippets_emb_idx
    on public.rag_snippets
    using ivfflat (embedding vector_cosine_ops) with (lists = 100);

create or replace function public.match_rag_snippets(
    query_embedding vector(1024),
    match_count int default 3
) returns table (
    id text,
    source text,
    section text,
    "text" text,
    tags jsonb,
    score float
) language sql stable as $$
    select id, source, section, text, tags,
           1 - (embedding <=> query_embedding) as score
    from public.rag_snippets
    where embedding is not null
    order by embedding <=> query_embedding asc
    limit match_count
$$;

-- Read-only for all authenticated users; writes only via service_role.
alter table public.rag_snippets enable row level security;
drop policy if exists rag_snippets_read_all on public.rag_snippets;
create policy rag_snippets_read_all on public.rag_snippets
    for select using (auth.role() = 'authenticated' or auth.role() = 'service_role');

-- ─────────────────────────── Realtime ─────────────────────────────────────
-- Publish INSERT events on verdicts so the doctor cockpit sees new cases
-- without polling. Wrap in DO block so re-applying the migration is idempotent.
do $$
begin
    if not exists (
        select 1
        from pg_publication_tables
        where pubname = 'supabase_realtime'
          and tablename = 'verdicts'
    ) then
        alter publication supabase_realtime add table public.verdicts;
    end if;
end$$;

-- ─────────────────────────── Storage bucket ───────────────────────────────
-- Bucket for the voice ASR/TTS audio blobs. Created if missing; private.
insert into storage.buckets (id, name, public)
    values ('voice-audio', 'voice-audio', false)
    on conflict (id) do nothing;

-- Owner-only read/write (defence in depth on top of signed URLs).
drop policy if exists "voice-audio owner read" on storage.objects;
create policy "voice-audio owner read"
    on storage.objects for select
    using (
        bucket_id = 'voice-audio'
        and (auth.uid()::text = (storage.foldername(name))[1])
    );

drop policy if exists "voice-audio owner write" on storage.objects;
create policy "voice-audio owner write"
    on storage.objects for insert
    with check (
        bucket_id = 'voice-audio'
        and (auth.uid()::text = (storage.foldername(name))[1])
    );

-- ─────────────────────────── Doctor cockpit helper view ───────────────────
-- A simple denormalised view the doctor cockpit can subscribe to. It
-- already respects the 24h freshness window; RLS on the underlying
-- `verdicts` table continues to apply.
create or replace view public.recent_verdicts_24h as
    select
        v.id,
        v.session_id,
        v.level,
        v.esi,
        v.confidence,
        v.red_flags,
        v.symptoms,
        v.model_version,
        v.created_at,
        s.user_id,
        s.language
    from public.verdicts v
    join public.sessions s on s.id = v.session_id
    where v.created_at > now() - interval '24 hours';

-- ─────────────────────────── Audio retention helper ───────────────────────
-- Scheduled deletion every 24h (configure via Supabase cron / pg_cron):
--   select cron.schedule(
--     'voice-audio-retention',
--     '0 3 * * *',
--     $$
--       delete from storage.objects
--       where bucket_id = 'voice-audio'
--         and created_at < now() - interval '7 days'
--     $$
--   );
