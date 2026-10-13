-- HELIO Intelligence v0.9. Non-destructive. Run in Supabase SQL Editor.
-- Separate review table keeps existing exhibitor imports and 79 exhibitions unchanged.
CREATE TABLE IF NOT EXISTS public.helio_lead_reviews (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 owner_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
 exhibition_id uuid NOT NULL REFERENCES public.exhibitions(id) ON DELETE CASCADE,
 exhibitor_id uuid NOT NULL REFERENCES public.exhibitors(id) ON DELETE CASCADE,
 priority text NOT NULL DEFAULT 'unreviewed' CHECK(priority IN ('unreviewed','high','medium','low')),
 stage text NOT NULL DEFAULT 'new' CHECK(stage IN ('new','researching','qualified','contacted','replied','meeting','quotation','won','lost')),
 service_interest text NOT NULL DEFAULT 'Not assessed',
 follow_up_on date,
 assigned_to text,
 qualification_notes text,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(owner_id,exhibitor_id),
 CONSTRAINT helio_review_exhibitor_owner FOREIGN KEY(owner_id,exhibitor_id) REFERENCES public.exhibitors(owner_id,id),
 CONSTRAINT helio_review_exhibition_owner FOREIGN KEY(owner_id,exhibition_id) REFERENCES public.exhibitions(owner_id,id)
);
ALTER TABLE public.helio_lead_reviews ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS helio_reviews_select ON public.helio_lead_reviews;
DROP POLICY IF EXISTS helio_reviews_insert ON public.helio_lead_reviews;
DROP POLICY IF EXISTS helio_reviews_update ON public.helio_lead_reviews;
DROP POLICY IF EXISTS helio_reviews_delete ON public.helio_lead_reviews;
CREATE POLICY helio_reviews_select ON public.helio_lead_reviews FOR SELECT TO authenticated USING (owner_id=(SELECT auth.uid()));
CREATE POLICY helio_reviews_insert ON public.helio_lead_reviews FOR INSERT TO authenticated WITH CHECK (owner_id=(SELECT auth.uid()));
CREATE POLICY helio_reviews_update ON public.helio_lead_reviews FOR UPDATE TO authenticated USING (owner_id=(SELECT auth.uid())) WITH CHECK (owner_id=(SELECT auth.uid()));
CREATE POLICY helio_reviews_delete ON public.helio_lead_reviews FOR DELETE TO authenticated USING (owner_id=(SELECT auth.uid()));
NOTIFY pgrst, 'reload schema';
