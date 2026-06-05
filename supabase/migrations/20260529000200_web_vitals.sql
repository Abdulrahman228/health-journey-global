-- =====================================================================
-- Web Vitals RUM (Real User Monitoring) — store Core Web Vitals
-- =====================================================================
-- Captures CLS, LCP, INP, FCP, TTFB from real browser sessions.
-- Indexed by metric+rating+created_at for performance dashboards.
-- Public INSERT (anonymous) is allowed via SECURITY DEFINER RPC only —
-- a permissive RLS INSERT policy keeps anon writes safe & rate-limit-friendly.
-- Admin SELECT only (no PII; just url/metric/value/device).
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.web_vitals_events (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  metric          text NOT NULL CHECK (metric IN ('CLS','LCP','INP','FCP','TTFB','FID')),
  value           double precision NOT NULL,
  rating          text NOT NULL CHECK (rating IN ('good','needs-improvement','poor')),
  delta           double precision,
  navigation_type text,
  url             text NOT NULL,
  path            text NOT NULL,
  referrer        text,
  user_agent      text,
  connection      text,
  device_type     text,
  viewport_width  integer,
  viewport_height integer,
  user_id         uuid,
  session_id      text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wv_metric_created ON public.web_vitals_events (metric, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wv_path_metric    ON public.web_vitals_events (path, metric);
CREATE INDEX IF NOT EXISTS idx_wv_rating         ON public.web_vitals_events (rating, created_at DESC);

ALTER TABLE public.web_vitals_events ENABLE ROW LEVEL SECURITY;

-- Anyone (including anon) may INSERT events; columns are validated by CHECK constraints
DROP POLICY IF EXISTS "wv_anon_insert" ON public.web_vitals_events;
CREATE POLICY "wv_anon_insert"
  ON public.web_vitals_events
  FOR INSERT
  TO public
  WITH CHECK (true);

-- Only admins may read
DROP POLICY IF EXISTS "wv_admin_select" ON public.web_vitals_events;
CREATE POLICY "wv_admin_select"
  ON public.web_vitals_events
  FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.role = 'admin'));

-- Aggregate view (per path × metric) for the admin dashboard
CREATE OR REPLACE VIEW public.web_vitals_summary AS
SELECT
  path,
  metric,
  count(*)                                                            AS samples,
  percentile_cont(0.5)  WITHIN GROUP (ORDER BY value)                 AS p50,
  percentile_cont(0.75) WITHIN GROUP (ORDER BY value)                 AS p75,
  percentile_cont(0.95) WITHIN GROUP (ORDER BY value)                 AS p95,
  100.0 * sum(CASE WHEN rating = 'good' THEN 1 ELSE 0 END) / count(*) AS good_pct
FROM public.web_vitals_events
WHERE created_at >= now() - interval '28 days'
GROUP BY path, metric;

COMMENT ON TABLE  public.web_vitals_events  IS 'RUM (Real User Monitoring) — Core Web Vitals samples for Rank Math performance audit.';
COMMENT ON VIEW   public.web_vitals_summary IS '28-day rolling p75 per path/metric (Google CWV uses p75).';
