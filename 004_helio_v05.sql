-- HELIO Intelligence v0.5: run once in existing Supabase SQL Editor.
-- Does NOT delete or modify your 79 exhibition rows or existing exhibitors.
-- Enables safe idempotent CSV import by (exhibition_id, profile_url).
CREATE UNIQUE INDEX IF NOT EXISTS exhibitor_profile_unique
 ON public.exhibitors(exhibition_id,profile_url) WHERE profile_url IS NOT NULL;
ALTER TABLE public.exhibitors ADD COLUMN IF NOT EXISTS outreach_opt_out boolean NOT NULL DEFAULT false;
CREATE TABLE IF NOT EXISTS public.helio_campaign_drafts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 owner_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
 exhibitor_id uuid NOT NULL REFERENCES public.exhibitors(id) ON DELETE CASCADE,
 campaign_key text NOT NULL,
 subject text NOT NULL,
 body text NOT NULL,
 status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','approved','sent','replied','opted_out')),
 follow_up_on date,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(owner_id,exhibitor_id,campaign_key),
 CONSTRAINT helio_draft_owned_exhibitor FOREIGN KEY(owner_id,exhibitor_id)
  REFERENCES public.exhibitors(owner_id,id)
);
ALTER TABLE public.helio_campaign_drafts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS helio_drafts_select ON public.helio_campaign_drafts;
DROP POLICY IF EXISTS helio_drafts_insert ON public.helio_campaign_drafts;
DROP POLICY IF EXISTS helio_drafts_update ON public.helio_campaign_drafts;
DROP POLICY IF EXISTS helio_drafts_delete ON public.helio_campaign_drafts;
CREATE POLICY helio_drafts_select ON public.helio_campaign_drafts FOR SELECT TO authenticated USING (owner_id=(SELECT auth.uid()));
CREATE POLICY helio_drafts_insert ON public.helio_campaign_drafts FOR INSERT TO authenticated WITH CHECK (owner_id=(SELECT auth.uid()));
CREATE POLICY helio_drafts_update ON public.helio_campaign_drafts FOR UPDATE TO authenticated USING (owner_id=(SELECT auth.uid())) WITH CHECK (owner_id=(SELECT auth.uid()));
CREATE POLICY helio_drafts_delete ON public.helio_campaign_drafts FOR DELETE TO authenticated USING (owner_id=(SELECT auth.uid()));
