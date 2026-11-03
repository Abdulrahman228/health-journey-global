-- Doctor-managed (offline) patients.
--
-- A doctor can add or bulk-import patients who have no Tabibi account (their
-- existing/old patients). Such a patient is a normal `profiles` row with a NULL
-- user_id, owned by the doctor via `managed_by_doctor`. This keeps them fully
-- first-class — EMR, appointments, prescriptions, and the patient detail page
-- all work — while patients who book online keep appearing automatically.

ALTER TABLE public.profiles ALTER COLUMN user_id DROP NOT NULL;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS managed_by_doctor uuid;

CREATE INDEX IF NOT EXISTS idx_profiles_managed_by_doctor
  ON public.profiles (managed_by_doctor)
  WHERE managed_by_doctor IS NOT NULL;

COMMENT ON COLUMN public.profiles.managed_by_doctor IS
  'Offline patient added/imported by a doctor: the owning doctor''s profiles.id. NULL for real self-registered users.';

-- RPC so mobile clients (which use the doctor's session, not the service role)
-- can add an offline patient without needing a broad profiles-insert RLS policy.
-- Runs as definer, but only ever creates a patient owned by the calling doctor.
CREATE OR REPLACE FUNCTION public.add_managed_patient(
  p_full_name text,
  p_phone text DEFAULT NULL,
  p_city text DEFAULT NULL,
  p_dob date DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_doctor_profile uuid;
  v_new_profile uuid;
BEGIN
  SELECT id INTO v_doctor_profile FROM public.profiles WHERE user_id = auth.uid();
  IF v_doctor_profile IS NULL THEN
    RAISE EXCEPTION 'no_profile';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'doctor'
  ) THEN
    RAISE EXCEPTION 'not_a_doctor';
  END IF;
  IF coalesce(trim(p_full_name), '') = '' THEN
    RAISE EXCEPTION 'name_required';
  END IF;

  INSERT INTO public.profiles (user_id, managed_by_doctor, full_name, phone, city)
  VALUES (
    NULL,
    v_doctor_profile,
    trim(p_full_name),
    nullif(trim(coalesce(p_phone, '')), ''),
    nullif(trim(coalesce(p_city, '')), '')
  )
  RETURNING id INTO v_new_profile;

  IF p_dob IS NOT NULL THEN
    INSERT INTO public.patient_details (profile_id, date_of_birth)
    VALUES (v_new_profile, p_dob);
  END IF;

  RETURN v_new_profile;
END;
$$;

GRANT EXECUTE ON FUNCTION public.add_managed_patient(text, text, text, date) TO authenticated;

-- Read the calling doctor's managed (offline) patients. SECURITY DEFINER so it
-- works on mobile (guest profiles have a NULL user_id and aren't visible under
-- normal RLS); only ever returns patients owned by the calling doctor.
CREATE OR REPLACE FUNCTION public.get_managed_patients()
RETURNS TABLE (id uuid, full_name text, phone text, city text, date_of_birth date)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.full_name, p.phone, p.city, pd.date_of_birth
  FROM public.profiles p
  LEFT JOIN public.patient_details pd ON pd.profile_id = p.id
  WHERE p.managed_by_doctor = (
    SELECT id FROM public.profiles WHERE user_id = auth.uid()
  )
  ORDER BY p.created_at DESC;
$$;

GRANT EXECUTE ON FUNCTION public.get_managed_patients() TO authenticated;
