-- Phases 3-6: Subdomain Solo Mode + Private Encrypted Feedback + Masked Calling
-- ----------------------------------------------------------------------------

-- ============================================================================
-- PHASE 3: Subdomain isolation + Solo Mode
-- ============================================================================
-- Doctors with a slug get a subdomain at {slug}.mytabibi.com (white-label).
-- When solo_mode_enabled = true, that subdomain hides the marketplace and
-- shows only the doctor's own profile + booking flow.

ALTER TABLE public.doctor_details
  ADD COLUMN IF NOT EXISTS solo_mode_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS solo_brand_color TEXT,
  ADD COLUMN IF NOT EXISTS solo_logo_url TEXT,
  ADD COLUMN IF NOT EXISTS solo_clinic_name TEXT;

-- Public lookup helper: given a slug, return basic doctor profile
CREATE OR REPLACE FUNCTION public.get_doctor_by_slug(p_slug TEXT)
RETURNS TABLE (
  doctor_id UUID,
  profile_id UUID,
  full_name TEXT,
  avatar_url TEXT,
  specialty TEXT,
  bio TEXT,
  is_verified BOOLEAN,
  solo_mode_enabled BOOLEAN,
  solo_brand_color TEXT,
  solo_logo_url TEXT,
  solo_clinic_name TEXT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT
    dd.id, p.id, p.full_name, p.avatar_url,
    dd.specialty, dd.bio, dd.is_verified,
    dd.solo_mode_enabled, dd.solo_brand_color, dd.solo_logo_url, dd.solo_clinic_name
  FROM public.profiles p
  JOIN public.doctor_details dd ON dd.profile_id = p.id
  WHERE p.slug = p_slug
    AND p.profile_visibility IN ('public','unlisted')
    AND dd.is_verified = true
  LIMIT 1
$$;

GRANT EXECUTE ON FUNCTION public.get_doctor_by_slug(TEXT) TO anon, authenticated;

-- ============================================================================
-- PHASE 5: Private encrypted feedback (patient → doctor only)
-- ============================================================================
-- Patients can leave private notes that ONLY the doctor can read. Stored
-- encrypted at rest using pgcrypto symmetric encryption keyed by a per-doctor
-- secret derived from a server pepper + the doctor's profile_id.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.doctor_private_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_details_id UUID NOT NULL REFERENCES public.doctor_details(id) ON DELETE CASCADE,
  patient_profile_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  -- Patient may leave anonymous feedback if they choose
  is_anonymous BOOLEAN NOT NULL DEFAULT false,
  ciphertext BYTEA NOT NULL,
  rating SMALLINT CHECK (rating BETWEEN 1 AND 5),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dpf_doctor ON public.doctor_private_feedback(doctor_details_id, created_at DESC);

ALTER TABLE public.doctor_private_feedback ENABLE ROW LEVEL SECURITY;

-- No direct select/insert/update — all access goes through SECURITY DEFINER fns
-- The pepper is set via: ALTER DATABASE postgres SET app.feedback_pepper = '...'
-- Or via Supabase Vault. For now we use a constant fallback.

CREATE OR REPLACE FUNCTION public._feedback_key(p_doctor_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  pepper TEXT;
BEGIN
  -- Try GUC first; fall back to deterministic constant (NOT for production
  -- secrecy — use Supabase Vault in production by SET app.feedback_pepper).
  BEGIN
    pepper := current_setting('app.feedback_pepper', true);
  EXCEPTION WHEN OTHERS THEN
    pepper := NULL;
  END;
  IF pepper IS NULL OR pepper = '' THEN
    pepper := 'tabibi_default_pepper_change_me_in_production_2026';
  END IF;
  RETURN encode(digest(pepper || '::' || p_doctor_id::text, 'sha256'), 'hex');
END
$$;

-- Patient submits encrypted feedback
CREATE OR REPLACE FUNCTION public.submit_private_feedback(
  p_doctor_details_id UUID,
  p_message TEXT,
  p_rating SMALLINT DEFAULT NULL,
  p_anonymous BOOLEAN DEFAULT false
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_id UUID;
  v_key TEXT;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF p_message IS NULL OR length(trim(p_message)) < 5 THEN
    RAISE EXCEPTION 'Message too short';
  END IF;
  IF length(p_message) > 5000 THEN
    RAISE EXCEPTION 'Message too long (max 5000 chars)';
  END IF;

  v_key := public._feedback_key(p_doctor_details_id);

  INSERT INTO public.doctor_private_feedback
    (doctor_details_id, patient_profile_id, is_anonymous, ciphertext, rating)
  VALUES (
    p_doctor_details_id,
    CASE WHEN p_anonymous THEN NULL ELSE v_uid END,
    p_anonymous,
    pgp_sym_encrypt(p_message, v_key),
    p_rating
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END
$$;

GRANT EXECUTE ON FUNCTION public.submit_private_feedback(UUID, TEXT, SMALLINT, BOOLEAN) TO authenticated;

-- Doctor reads their own feedback (decrypted)
CREATE OR REPLACE FUNCTION public.read_my_private_feedback(p_limit INT DEFAULT 50)
RETURNS TABLE (
  id UUID,
  is_anonymous BOOLEAN,
  patient_profile_id UUID,
  message TEXT,
  rating SMALLINT,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid UUID := auth.uid();
  v_doctor_id UUID;
  v_key TEXT;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  SELECT dd.id INTO v_doctor_id
    FROM public.doctor_details dd
    WHERE dd.profile_id = v_uid;
  IF v_doctor_id IS NULL THEN
    RAISE EXCEPTION 'Doctor profile not found';
  END IF;
  v_key := public._feedback_key(v_doctor_id);

  RETURN QUERY
  SELECT
    f.id,
    f.is_anonymous,
    f.patient_profile_id,
    pgp_sym_decrypt(f.ciphertext, v_key)::TEXT,
    f.rating,
    f.created_at
  FROM public.doctor_private_feedback f
  WHERE f.doctor_details_id = v_doctor_id
  ORDER BY f.created_at DESC
  LIMIT GREATEST(1, LEAST(200, p_limit));
END
$$;

GRANT EXECUTE ON FUNCTION public.read_my_private_feedback(INT) TO authenticated;

-- ============================================================================
-- PHASE 6: Masked calling sessions
-- ============================================================================
-- Patients call doctor via a proxy number. Phone numbers are never exposed in
-- the UI. Tracks billing units (per-minute) and provides audit trail.

DO $$ BEGIN
  CREATE TYPE call_status AS ENUM ('queued','ringing','in_progress','completed','failed','no_answer','rejected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.masked_call_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id UUID REFERENCES public.appointments(id) ON DELETE SET NULL,
  doctor_details_id UUID NOT NULL REFERENCES public.doctor_details(id) ON DELETE CASCADE,
  patient_profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  initiated_by UUID NOT NULL REFERENCES public.profiles(id),
  proxy_number TEXT,
  provider TEXT NOT NULL DEFAULT 'twilio' CHECK (provider IN ('twilio','vonage','africastalking','whatsapp','test')),
  provider_call_sid TEXT,
  status call_status NOT NULL DEFAULT 'queued',
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  duration_seconds INT,
  cost_cents INT,
  recording_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_mcs_doctor ON public.masked_call_sessions(doctor_details_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mcs_patient ON public.masked_call_sessions(patient_profile_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mcs_appt ON public.masked_call_sessions(appointment_id) WHERE appointment_id IS NOT NULL;

ALTER TABLE public.masked_call_sessions ENABLE ROW LEVEL SECURITY;

-- Doctor sees calls to themselves
DROP POLICY IF EXISTS mcs_doctor_select ON public.masked_call_sessions;
CREATE POLICY mcs_doctor_select ON public.masked_call_sessions
  FOR SELECT TO authenticated
  USING (
    doctor_details_id IN (SELECT id FROM public.doctor_details WHERE profile_id = auth.uid())
  );

-- Patient sees their own initiated calls
DROP POLICY IF EXISTS mcs_patient_select ON public.masked_call_sessions;
CREATE POLICY mcs_patient_select ON public.masked_call_sessions
  FOR SELECT TO authenticated
  USING (patient_profile_id = auth.uid());

-- Admin can see all
DROP POLICY IF EXISTS mcs_admin_all ON public.masked_call_sessions;
CREATE POLICY mcs_admin_all ON public.masked_call_sessions
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Inserts go through server-side function only (service role)
COMMENT ON TABLE public.masked_call_sessions IS 'Inserts/updates restricted to service role via initiate_masked_call() server fn.';
