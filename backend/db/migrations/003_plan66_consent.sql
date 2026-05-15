-- Plan 6.6 Phase B — DPDP Act 2023 consent + right-to-deletion tables.
--
-- Run AFTER 001_plan2_schema.sql and 002_plan3_rag.sql. Safe to re-run
-- idempotently via "create table if not exists".

create table if not exists public.consent_log (
    id              uuid primary key default gen_random_uuid(),
    user_id         uuid references auth.users (id) on delete cascade,
    scopes          text[] not null default '{}'::text[],
    consent_version text not null,
    language        text not null default 'en',
    ip_hash         text,
    user_agent      text,
    granted_at      timestamptz not null default now()
);

create index if not exists consent_log_user_id_idx on public.consent_log (user_id);
create index if not exists consent_log_granted_at_idx on public.consent_log (granted_at desc);


create table if not exists public.deletion_log (
    id                  uuid primary key default gen_random_uuid(),
    user_id             uuid not null references auth.users (id) on delete cascade,
    reason              text,
    soft_deleted_at     timestamptz not null default now(),
    hard_delete_after   timestamptz not null,
    completed_at        timestamptz
);

create index if not exists deletion_log_user_id_idx on public.deletion_log (user_id);
create index if not exists deletion_log_pending_idx on public.deletion_log (hard_delete_after)
    where completed_at is null;


-- Soft-delete columns on data-bearing tables. Idempotent.
do $$
begin
    if not exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'sessions' and column_name = 'deleted_at'
    ) then
        alter table public.sessions add column deleted_at timestamptz;
    end if;
    if not exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'messages' and column_name = 'deleted_at'
    ) then
        alter table public.messages add column deleted_at timestamptz;
    end if;
    if not exists (
        select 1 from information_schema.columns
        where table_schema = 'public' and table_name = 'verdicts' and column_name = 'deleted_at'
    ) then
        alter table public.verdicts add column deleted_at timestamptz;
    end if;
end $$;


-- RLS — users see only their own consent + deletion rows. Service role
-- can read/write everything (the FastAPI backend uses service_client).
alter table public.consent_log enable row level security;
alter table public.deletion_log enable row level security;

drop policy if exists consent_log_owner on public.consent_log;
create policy consent_log_owner on public.consent_log
    for select using (user_id = auth.uid());

drop policy if exists deletion_log_owner on public.deletion_log;
create policy deletion_log_owner on public.deletion_log
    for select using (user_id = auth.uid());
