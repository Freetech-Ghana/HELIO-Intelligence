-- HELIO v1.8: run after existing exhibition migrations.
alter table public.exhibitions add column if not exists discovery_source_url text;
alter table public.exhibitions add column if not exists discovery_event_url text;
alter table public.exhibitions add column if not exists discovery_key text;
alter table public.exhibitions add column if not exists discovery_last_seen timestamptz;
alter table public.exhibitions add column if not exists discovery_start_date date;
alter table public.exhibitions add column if not exists discovery_end_date date;
alter table public.exhibitions add column if not exists discovery_city text;
alter table public.exhibitions add column if not exists discovery_country text;
create unique index if not exists exhibitions_discovery_key_owner_unique on public.exhibitions(owner_id,discovery_key) where discovery_key is not null;
create table if not exists public.exhibition_discovery_runs (
 id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id),
 started_at timestamptz not null default now(), finished_at timestamptz,
 status text not null default 'running' check(status in ('running','completed','partial','failed')),
 sources_checked int not null default 0, discovered int not null default 0, duplicates int not null default 0,
 errors jsonb not null default '[]'::jsonb
);
create index if not exists exhibition_discovery_runs_owner_date on public.exhibition_discovery_runs(owner_id,started_at desc);
alter table public.exhibition_discovery_runs enable row level security;
drop policy if exists discovery_runs_select on public.exhibition_discovery_runs;
create policy discovery_runs_select on public.exhibition_discovery_runs for select to authenticated using (owner_id=(select auth.uid()));
