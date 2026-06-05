-- ============================================================================
-- Phase 4 — Doctor analytics: daily profile-view tracking
--
-- Adds a per-day rollup table + RPC so we can graph profile views over time
-- on /dashboard/analytics. Anonymous viewers are accepted (anon role) — we
-- only need volume, no PII. The existing profiles.profile_views_count
-- counter is kept in sync for backward compatibility.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.doctor_profile_views (
  doctor_details_id UUID NOT NULL REFERENCES public.doctor_details(id) ON DELETE CASCADE,
  viewed_on         DATE NOT NULL DEFAULT CURRENT_DATE,
  views             INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (doctor_details_id, viewed_on)
);

CREATE INDEX IF NOT EXISTS idx_dpv_doctor_date
  ON public.doctor_profile_views(doctor_details_id, viewed_on DESC);

ALTER TABLE public.doctor_profile_views ENABLE ROW LEVEL SECURITY;

-- Doctor reads own; admin reads all.
DROP POLICY IF EXISTS "dpv_doctor_read" ON public.doctor_profile_views;
CREATE POLICY "dpv_doctor_read" ON public.doctor_profile_views
  FOR SELECT TO authenticated
  USING (
    doctor_details_id IN (
      SELECT dd.id FROM public.doctor_details dd
      JOIN public.profiles p ON p.id = dd.profile_id
      WHERE p.user_id = auth.uid()
    )
    OR public.is_admin()
  );

-- Inserts/updates only via the SECURITY DEFINER RPC below; deny direct DML
-- to public so spam can't inflate numbers.
DROP POLICY IF EXISTS "dpv_block_writes" ON public.doctor_profile_views;
CREATE POLICY "dpv_block_writes" ON public.doctor_profile_views
  FOR ALL TO authenticated, anon
  USING (false) WITH CHECK (false);

CREATE OR REPLACE FUNCTION public.track_doctor_view(_doctor_details_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pid UUID;
BEGIN
  -- Increment daily counter.
  INSERT INTO public.doctor_profile_views (doctor_details_id, viewed_on, views)
  VALUES (_doctor_details_id, CURRENT_DATE, 1)
  ON CONFLICT (doctor_details_id, viewed_on)
  DO UPDATE SET views = public.doctor_profile_views.views + 1;

  -- Mirror the existing lifetime counter on profiles for backward compat.
  SELECT profile_id INTO v_pid FROM public.doctor_details WHERE id = _doctor_details_id;
  IF v_pid IS NOT NULL THEN
    UPDATE public.profiles
       SET profile_views_count = COALESCE(profile_views_count, 0) + 1
     WHERE id = v_pid;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.track_doctor_view(UUID) TO anon, authenticated;
