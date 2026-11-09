-- ============================================================================
-- 2026-11-09 — Admin control panel foundation (phase 1 of the admin plan).
--
-- §1 Admins can read and write EVERY public table (owner decision: "كافة
--    الصلاحيات"), via one permissive policy per table. Two tables stay closed
--    even to admins: doctor_finance_pins (hashed secrets) and
--    doctor_private_feedback (designed as private doctor↔patient channel).
--    Existing narrower admin policies are left in place (permissive policies
--    are OR-ed). Server-side admin functions use the service role anyway; this
--    covers the admin pages that query with the admin's own JWT.
-- §2 Admins can manage every storage bucket.
-- §3 app_settings: key/value store for platform defaults and feature flags,
--    readable by everyone signed in (the apps need some values), writable by
--    admins only.
-- ============================================================================

-- §1 ------------------------------------------------------------------------
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT c.relname AS tbl
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public' AND c.relkind = 'r'
       AND c.relname NOT IN ('doctor_finance_pins', 'doctor_private_feedback')
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', r.tbl);
    EXECUTE format('DROP POLICY IF EXISTS admin_full_access ON public.%I', r.tbl);
    EXECUTE format(
      'CREATE POLICY admin_full_access ON public.%I FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin())',
      r.tbl
    );
  END LOOP;
END $$;

-- §2 ------------------------------------------------------------------------
DROP POLICY IF EXISTS admin_full_access ON storage.objects;
CREATE POLICY admin_full_access ON storage.objects
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- §3 ------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.app_settings (
  key         text PRIMARY KEY,
  value       jsonb NOT NULL,
  description text,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  updated_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL
);
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS app_settings_read ON public.app_settings;
CREATE POLICY app_settings_read ON public.app_settings
  FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS admin_full_access ON public.app_settings;
CREATE POLICY admin_full_access ON public.app_settings
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
GRANT SELECT ON public.app_settings TO authenticated;
GRANT ALL ON public.app_settings TO authenticated;

INSERT INTO public.app_settings (key, value, description) VALUES
  ('commission.online_default_pct', '15',   'Default online-consultation commission for the free tier (%)'),
  ('commission.clinic_pct',         '0',    'Commission on clinic visits (%) — paid at the clinic'),
  ('payout.minimum_egp',            '200',  'Minimum withdrawal a doctor can request (EGP)'),
  ('manual_payment.grace_hours',    '24',   'Hours a pending receipt grants Gold access before review'),
  ('maintenance.enabled',           'false','When true the public site shows a maintenance notice'),
  ('features.ai_assistant',         'true', 'Doctor AI clinical assistant on/off'),
  ('features.community_feed',       'true', 'Community feed on/off')
ON CONFLICT (key) DO NOTHING;

NOTIFY pgrst, 'reload schema';
