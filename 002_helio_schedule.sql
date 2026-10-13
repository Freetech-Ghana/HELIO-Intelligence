-- Apply AFTER supabase/schema.sql. Adds HELIO PDF schedule metadata.
alter table public.exhibitions add column if not exists source_number integer;
alter table public.exhibitions add column if not exists source_date_text text;
alter table public.exhibitions add column if not exists venue text;
alter table public.exhibitions add column if not exists hall text;
alter table public.exhibitions add column if not exists source_document text;
alter table public.exhibitions add column if not exists source_page integer;
alter table public.exhibitions add column if not exists date_verified boolean not null default false;
alter table public.exhibitions add column if not exists research_status text not null default 'not_started';
-- The source includes the same event at different venues (e.g. Gulfood 2027).
-- Do not merge venue-specific entries, but do not create duplicate same-venue records.
create unique index if not exists exhibitions_source_number_per_owner on public.exhibitions(owner_id,source_document,source_number) where source_document is not null;
-- Remove the old uniqueness constraint that disallows distinct venue entries for one edition.
alter table public.exhibitions drop constraint if exists exhibitions_owner_id_name_edition_year_key;
create index if not exists exhibitions_source_order on public.exhibitions(owner_id,edition_year,source_number);
