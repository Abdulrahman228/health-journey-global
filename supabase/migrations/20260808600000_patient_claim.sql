-- ============================================================================
-- Managed-patient overhaul — Phase B: the CLAIM flow.
--
-- A doctor-created managed patient (profiles.user_id NULL) can be claimed by
-- the real person, who then INHERITS all history. Design: the patient signs up
-- normally (gets a fresh empty profile), then claims via a secure token — the
-- claim ADOPTS the existing managed profile (sets its user_id) and deletes the
-- fresh empty one. Because the managed profile's id never changes, every FK
-- (appointments, medical_records, lab_orders, attachments…) stays intact with
-- zero re-pointing.
--
-- Safety: if the claiming account already has real history, we abort instead of
-- destroying data (that genuine account-merge case is handled separately).
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.patient_claims (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  doctor_profile_id  uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  token              text NOT NULL UNIQUE,
  expires_at         timestamptz NOT NULL,
  used_at            timestamptz,
  used_by_user_id    uuid,
  created_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_patient_claims_patient ON public.patient_claims(patient_profile_id);

ALTER TABLE public.patient_claims ENABLE ROW LEVEL SECURITY;
-- No table policies: every access path is a SECURITY DEFINER RPC below.

-- Doctor: get (or lazily create) a shareable claim link token for one of their
-- UNCLAIMED managed patients. 30-day validity; reuses a live token.
CREATE OR REPLACE FUNCTION public.get_or_create_claim_link(p_patient_profile_id uuid)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_doctor  uuid;
  v_token   text;
BEGIN
  SELECT id INTO v_doctor FROM public.profiles WHERE user_id = auth.uid();
  IF v_doctor IS NULL THEN RAISE EXCEPTION 'no_profile'; END IF;

  -- caller must be a doctor linked to this patient
  IF NOT EXISTS (
    SELECT 1 FROM public.doctor_patients dp
    WHERE dp.doctor_profile_id = v_doctor AND dp.patient_profile_id = p_patient_profile_id
  ) AND NOT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = p_patient_profile_id AND p.managed_by_doctor = v_doctor
  ) THEN
    RAISE EXCEPTION 'not_your_patient';
  END IF;

  -- can't invite an already-claimed (real) patient
  IF EXISTS (SELECT 1 FROM public.profiles p
             WHERE p.id = p_patient_profile_id AND p.user_id IS NOT NULL) THEN
    RAISE EXCEPTION 'already_registered';
  END IF;

  SELECT token INTO v_token FROM public.patient_claims
   WHERE patient_profile_id = p_patient_profile_id
     AND used_at IS NULL AND expires_at > now()
   ORDER BY created_at DESC LIMIT 1;

  IF v_token IS NULL THEN
    v_token := replace(gen_random_uuid()::text, '-', '')
             || replace(gen_random_uuid()::text, '-', '');
    INSERT INTO public.patient_claims (patient_profile_id, doctor_profile_id, token, expires_at)
    VALUES (p_patient_profile_id, v_doctor, v_token, now() + interval '30 days');
  END IF;

  RETURN v_token;
END; $$;

GRANT EXECUTE ON FUNCTION public.get_or_create_claim_link(uuid) TO authenticated;

-- Public: preview who invited me, before signing in. Returns one row or none.
CREATE OR REPLACE FUNCTION public.preview_claim(p_token text)
RETURNS TABLE (doctor_name text, patient_name text, valid boolean)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT
    dp.full_name AS doctor_name,
    pp.full_name AS patient_name,
    (c.used_at IS NULL AND c.expires_at > now() AND pp.user_id IS NULL) AS valid
  FROM public.patient_claims c
  JOIN public.profiles pp ON pp.id = c.patient_profile_id
  LEFT JOIN public.profiles dp ON dp.id = c.doctor_profile_id
  WHERE c.token = p_token
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.preview_claim(text) TO anon, authenticated;

-- Logged-in patient: claim the managed profile → adopt it, inherit history.
CREATE OR REPLACE FUNCTION public.claim_managed_profile(p_token text)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid      uuid := auth.uid();
  v_managed  uuid;
  v_fresh    uuid;
  v_has_hist boolean;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  SELECT patient_profile_id INTO v_managed
  FROM public.patient_claims
  WHERE token = p_token AND used_at IS NULL AND expires_at > now();
  IF v_managed IS NULL THEN RAISE EXCEPTION 'invalid_or_expired'; END IF;

  -- managed profile must still be unclaimed
  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = v_managed AND user_id IS NOT NULL) THEN
    RAISE EXCEPTION 'already_claimed';
  END IF;

  SELECT id INTO v_fresh FROM public.profiles WHERE user_id = v_uid;

  IF v_fresh IS NOT NULL AND v_fresh <> v_managed THEN
    -- refuse to destroy an account that already has real history
    SELECT EXISTS (SELECT 1 FROM public.appointments WHERE patient_id = v_fresh)
        OR EXISTS (SELECT 1 FROM public.medical_records WHERE patient_profile_id = v_fresh)
      INTO v_has_hist;
    IF v_has_hist THEN RAISE EXCEPTION 'account_has_history'; END IF;

    -- keep a name if the managed record has none
    UPDATE public.profiles m
       SET full_name = COALESCE(NULLIF(m.full_name, ''), f.full_name),
           city      = COALESCE(m.city, f.city)
      FROM public.profiles f
     WHERE m.id = v_managed AND f.id = v_fresh;

    -- clear dependents of the empty fresh profile, then remove it (frees user_id)
    DELETE FROM public.patient_details        WHERE profile_id = v_fresh;
    DELETE FROM public.patient_medical_profile WHERE patient_profile_id = v_fresh;
    DELETE FROM public.profiles                WHERE id = v_fresh;
  END IF;

  UPDATE public.profiles
     SET user_id = v_uid, managed_by_doctor = NULL, updated_at = now()
   WHERE id = v_managed;

  UPDATE public.patient_claims
     SET used_at = now(), used_by_user_id = v_uid
   WHERE token = p_token;

  RETURN v_managed;
END; $$;

GRANT EXECUTE ON FUNCTION public.claim_managed_profile(text) TO authenticated;
