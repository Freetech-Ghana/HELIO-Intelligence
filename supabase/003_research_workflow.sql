-- Research workflow indexes. Run after schema.sql and 002_helio_schedule.sql.
create index if not exists research_runs_owner_event_time on public.research_runs(owner_id,exhibition_id,created_at desc);
create index if not exists exhibitors_owner_event_status on public.exhibitors(owner_id,exhibition_id,verification_status);
-- Existing research_runs stores a durable cursor and progress counters for a future worker.
-- Do not mark a run 'completed' until an actual directory coverage audit has been performed.
