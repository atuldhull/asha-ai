-- ASHA-AI Plan 2.0 schema migration.
--
-- Apply via: Supabase Dashboard → SQL Editor → paste this file → Run.
-- After running, set the following backend env vars from Supabase Project
-- Settings → API:
--   SUPABASE_URL                  → Project URL
--   SUPABASE_SERVICE_ROLE_KEY     → service_role secret (backend-only)
--   SUPABASE_ANON_KEY             → anon public key (for completeness)
--   SUPABASE_JWT_SECRET           → JWT secret (for verifying user tokens)
--
-- Tables: profiles, sessions, messages, verdicts, vitals, audit_log.
-- RLS is enabled on all tables; service_role bypasses RLS by default.

-- ──────────────────────────────────────────────────────────────────────
-- 1. profiles — extends auth.users
-- ──────────────────────────────────────────────────────────────────────
create table if not exists public.profiles (
    id          uuid primary key references auth.users(id) on delete cascade,
    role        text check (role in ('patient', 'asha', 'doctor')) default 'patient',
    language    text default 'en',
    age         int,
    sex         text check (sex in ('M', 'F', 'other')),
    abha_id     text unique,
    phc_code    text,
    created_at  timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
    insert into public.profiles (id) values (new.id)
    on conflict (id) do nothing;
    return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
    after insert on auth.users
    for each row execute function public.handle_new_user();

-- ──────────────────────────────────────────────────────────────────────
-- 2. sessions
-- ──────────────────────────────────────────────────────────────────────
create table if not exists public.sessions (
    id              uuid primary key default gen_random_uuid(),
    user_id         uuid not null references public.profiles(id) on delete cascade,
    initiated_by    uuid references public.profiles(id),
    started_at      timestamptz not null default now(),
    ended_at        timestamptz,
    language        text default 'en',
    llm_provider    text
);

create index if not exists sessions_user_id_idx on public.sessions(user_id);
create index if not exists sessions_started_at_idx on public.sessions(started_at desc);

-- ──────────────────────────────────────────────────────────────────────
-- 3. messages
-- ──────────────────────────────────────────────────────────────────────
create table if not exists public.messages (
    id          uuid primary key default gen_random_uuid(),
    session_id  uuid not null references public.sessions(id) on delete cascade,
    role        text not null check (role in ('user', 'assistant')),
    content     text not null,
    audio_url   text,
    created_at  timestamptz not null default now()
);

create index if not exists messages_session_id_idx on public.messages(session_id, created_at);

-- ──────────────────────────────────────────────────────────────────────
-- 4. verdicts — stores DB-code level ('home','clinic','er'), API
--    translates to exact strings at the boundary.
-- ──────────────────────────────────────────────────────────────────────
create table if not exists public.verdicts (
    id              uuid primary key default gen_random_uuid(),
    session_id      uuid not null references public.sessions(id) on delete cascade,
    level           text not null check (level in ('home', 'clinic', 'er')),
    esi             int check (esi between 1 and 5),
    confidence      numeric(4, 3),
    red_flags       jsonb not null default '[]'::jsonb,
    symptoms        jsonb not null default '[]'::jsonb,
    explanation     jsonb not null default '{}'::jsonb,
    model_version   text,
    created_at      timestamptz not null default now()
);

create index if not exists verdicts_session_id_idx on public.verdicts(session_id);
create index if not exists verdicts_created_at_idx on public.verdicts(created_at desc);

-- ──────────────────────────────────────────────────────────────────────
-- 5. vitals
-- ──────────────────────────────────────────────────────────────────────
create table if not exists public.vitals (
    id              uuid primary key default gen_random_uuid(),
    session_id      uuid not null references public.sessions(id) on delete cascade,
    kind            text not null check (kind in (
        'hr', 'rr', 'spo2', 'bp_sys', 'bp_dia', 'temp_c', 'ecg', 'glucose', 'hrv'
    )),
    value           numeric,
    unit            text,
    source          text check (source in (
        'rppg', 'self_reported', 'health_connect', 'phc_ble',
        'healthkit', 'cgm', 'manual_phc'
    )),
    confidence      text check (confidence in ('low', 'medium', 'high')),
    device_label    text,
    recorded_at     timestamptz not null,
    ingested_at     timestamptz not null default now()
);

-- ──────────────────────────────────────────────────────────────────────
-- 6. audit_log — never logs raw PHI; inputs_hash only
-- ──────────────────────────────────────────────────────────────────────
create table if not exists public.audit_log (
    id              uuid primary key default gen_random_uuid(),
    event           text not null,
    session_id      uuid,
    user_id         uuid,
    model_version   text,
    inputs_hash     text,
    output_summary  jsonb not null default '{}'::jsonb,
    created_at      timestamptz not null default now()
);

create index if not exists audit_log_session_id_idx on public.audit_log(session_id);
create index if not exists audit_log_created_at_idx on public.audit_log(created_at desc);

-- ──────────────────────────────────────────────────────────────────────
-- RLS policies
-- ──────────────────────────────────────────────────────────────────────
alter table public.profiles    enable row level security;
alter table public.sessions    enable row level security;
alter table public.messages    enable row level security;
alter table public.verdicts    enable row level security;
alter table public.vitals      enable row level security;
alter table public.audit_log   enable row level security;

-- profiles: users see / modify only themselves
drop policy if exists profiles_self on public.profiles;
create policy profiles_self on public.profiles
    for all
    using (auth.uid() = id)
    with check (auth.uid() = id);

-- sessions: owners read/write their own
drop policy if exists sessions_owner_select on public.sessions;
create policy sessions_owner_select on public.sessions
    for select using (auth.uid() = user_id);

drop policy if exists sessions_owner_insert on public.sessions;
create policy sessions_owner_insert on public.sessions
    for insert with check (auth.uid() = user_id);

drop policy if exists sessions_owner_update on public.sessions;
create policy sessions_owner_update on public.sessions
    for update using (auth.uid() = user_id);

-- messages: readable/writable by session owner
drop policy if exists messages_owner on public.messages;
create policy messages_owner on public.messages
    for all
    using (
        exists (
            select 1 from public.sessions s
            where s.id = messages.session_id and s.user_id = auth.uid()
        )
    )
    with check (
        exists (
            select 1 from public.sessions s
            where s.id = messages.session_id and s.user_id = auth.uid()
        )
    );

-- verdicts: patient sees own; doctor sees last 24h
drop policy if exists verdicts_owner_select on public.verdicts;
create policy verdicts_owner_select on public.verdicts
    for select using (
        exists (
            select 1 from public.sessions s
            where s.id = verdicts.session_id and s.user_id = auth.uid()
        )
    );

drop policy if exists verdicts_doctor_24h on public.verdicts;
create policy verdicts_doctor_24h on public.verdicts
    for select using (
        exists (
            select 1 from public.profiles p
            where p.id = auth.uid() and p.role = 'doctor'
        )
        and created_at > now() - interval '24 hours'
    );

-- vitals: owner of the session
drop policy if exists vitals_owner on public.vitals;
create policy vitals_owner on public.vitals
    for all using (
        exists (
            select 1 from public.sessions s
            where s.id = vitals.session_id and s.user_id = auth.uid()
        )
    );

-- audit_log: no user reads / writes (service_role bypasses RLS)
drop policy if exists audit_log_no_user_access on public.audit_log;
create policy audit_log_no_user_access on public.audit_log
    for all using (false) with check (false);
