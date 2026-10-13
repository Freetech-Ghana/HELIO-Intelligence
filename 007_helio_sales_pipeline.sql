-- HELIO v1.2: non-destructive sales opportunities and quotations.
CREATE TABLE IF NOT EXISTS public.helio_opportunities (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 owner_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
 exhibition_id uuid NOT NULL REFERENCES public.exhibitions(id) ON DELETE CASCADE,
 exhibitor_id uuid NOT NULL REFERENCES public.exhibitors(id) ON DELETE CASCADE,
 title text NOT NULL,
 service_type text NOT NULL DEFAULT 'Exhibition stand design',
 stage text NOT NULL DEFAULT 'prospecting' CHECK(stage IN ('prospecting','discovery','proposal','negotiation','won','lost')),
 estimated_value numeric(14,2) NOT NULL DEFAULT 0 CHECK(estimated_value>=0),
 probability integer NOT NULL DEFAULT 20 CHECK(probability BETWEEN 0 AND 100),
 expected_close_on date,
 notes text,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT opportunity_exhibitor_owner FOREIGN KEY(owner_id,exhibitor_id) REFERENCES public.exhibitors(owner_id,id),
 CONSTRAINT opportunity_exhibition_owner FOREIGN KEY(owner_id,exhibition_id) REFERENCES public.exhibitions(owner_id,id),
 CONSTRAINT opportunity_owner_unique UNIQUE(owner_id,id)
);
CREATE INDEX IF NOT EXISTS helio_opportunities_owner_event ON public.helio_opportunities(owner_id,exhibition_id);
ALTER TABLE public.helio_opportunities ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS opportunity_select ON public.helio_opportunities;
DROP POLICY IF EXISTS opportunity_insert ON public.helio_opportunities;
DROP POLICY IF EXISTS opportunity_update ON public.helio_opportunities;
DROP POLICY IF EXISTS opportunity_delete ON public.helio_opportunities;
CREATE POLICY opportunity_select ON public.helio_opportunities FOR SELECT TO authenticated USING(owner_id=(SELECT auth.uid()));
CREATE POLICY opportunity_insert ON public.helio_opportunities FOR INSERT TO authenticated WITH CHECK(owner_id=(SELECT auth.uid()));
CREATE POLICY opportunity_update ON public.helio_opportunities FOR UPDATE TO authenticated USING(owner_id=(SELECT auth.uid())) WITH CHECK(owner_id=(SELECT auth.uid()));
CREATE POLICY opportunity_delete ON public.helio_opportunities FOR DELETE TO authenticated USING(owner_id=(SELECT auth.uid()));
CREATE TABLE IF NOT EXISTS public.helio_quotations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 owner_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id),
 opportunity_id uuid NOT NULL REFERENCES public.helio_opportunities(id) ON DELETE CASCADE,
 quote_number text NOT NULL,
 status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','approved','sent_manually','accepted','declined','expired')),
 issue_date date NOT NULL DEFAULT CURRENT_DATE,
 valid_until date,
 currency text NOT NULL DEFAULT 'AED' CHECK(currency='AED'),
 customer_name text NOT NULL,
 line_items jsonb NOT NULL DEFAULT '[]'::jsonb CHECK(jsonb_typeof(line_items)='array'),
 discount_amount numeric(14,2) NOT NULL DEFAULT 0 CHECK(discount_amount>=0),
 vat_rate numeric(5,2) NOT NULL DEFAULT 5 CHECK(vat_rate BETWEEN 0 AND 100),
 terms text,
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(owner_id,quote_number),
 CONSTRAINT quotation_opportunity_owner FOREIGN KEY(owner_id,opportunity_id) REFERENCES public.helio_opportunities(owner_id,id)
);
CREATE INDEX IF NOT EXISTS helio_quotations_owner_opp ON public.helio_quotations(owner_id,opportunity_id);
ALTER TABLE public.helio_quotations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS quotation_select ON public.helio_quotations;
DROP POLICY IF EXISTS quotation_insert ON public.helio_quotations;
DROP POLICY IF EXISTS quotation_update ON public.helio_quotations;
DROP POLICY IF EXISTS quotation_delete ON public.helio_quotations;
CREATE POLICY quotation_select ON public.helio_quotations FOR SELECT TO authenticated USING(owner_id=(SELECT auth.uid()));
CREATE POLICY quotation_insert ON public.helio_quotations FOR INSERT TO authenticated WITH CHECK(owner_id=(SELECT auth.uid()));
CREATE POLICY quotation_update ON public.helio_quotations FOR UPDATE TO authenticated USING(owner_id=(SELECT auth.uid())) WITH CHECK(owner_id=(SELECT auth.uid()));
CREATE POLICY quotation_delete ON public.helio_quotations FOR DELETE TO authenticated USING(owner_id=(SELECT auth.uid()));
NOTIFY pgrst, 'reload schema';
