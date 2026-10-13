-- HELIO v1.0: safe, unsent outreach drafts and manual activity tracking.
CREATE TABLE IF NOT EXISTS public.helio_outreach_drafts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 owner_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
 exhibition_id uuid NOT NULL REFERENCES public.exhibitions(id) ON DELETE CASCADE,
 exhibitor_id uuid NOT NULL REFERENCES public.exhibitors(id) ON DELETE CASCADE,
 subject text NOT NULL DEFAULT '', body text NOT NULL DEFAULT '',
 status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','ready_for_review','contacted','replied','meeting','quotation','won','lost','do_not_contact')),
 last_contacted_on date, next_follow_up_on date, reply_notes text,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(owner_id,exhibitor_id),
 CONSTRAINT outreach_exhibitor_owner FOREIGN KEY(owner_id,exhibitor_id) REFERENCES public.exhibitors(owner_id,id),
 CONSTRAINT outreach_exhibition_owner FOREIGN KEY(owner_id,exhibition_id) REFERENCES public.exhibitions(owner_id,id)
);
ALTER TABLE public.helio_outreach_drafts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS outreach_select ON public.helio_outreach_drafts;
DROP POLICY IF EXISTS outreach_insert ON public.helio_outreach_drafts;
DROP POLICY IF EXISTS outreach_update ON public.helio_outreach_drafts;
DROP POLICY IF EXISTS outreach_delete ON public.helio_outreach_drafts;
CREATE POLICY outreach_select ON public.helio_outreach_drafts FOR SELECT TO authenticated USING (owner_id=(SELECT auth.uid()));
CREATE POLICY outreach_insert ON public.helio_outreach_drafts FOR INSERT TO authenticated WITH CHECK (owner_id=(SELECT auth.uid()));
CREATE POLICY outreach_update ON public.helio_outreach_drafts FOR UPDATE TO authenticated USING (owner_id=(SELECT auth.uid())) WITH CHECK (owner_id=(SELECT auth.uid()));
CREATE POLICY outreach_delete ON public.helio_outreach_drafts FOR DELETE TO authenticated USING (owner_id=(SELECT auth.uid()));
NOTIFY pgrst, 'reload schema';
