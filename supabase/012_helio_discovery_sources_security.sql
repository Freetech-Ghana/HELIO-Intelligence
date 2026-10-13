-- Run after manually creating exhibition_discovery_sources as in v1.8.1 setup.
ALTER TABLE public.exhibition_discovery_sources ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS exhibition_sources_authenticated_read ON public.exhibition_discovery_sources;
CREATE POLICY exhibition_sources_authenticated_read ON public.exhibition_discovery_sources FOR SELECT TO authenticated USING (true);
-- No browser insert/update/delete policies: source changes require trusted server/database access.
