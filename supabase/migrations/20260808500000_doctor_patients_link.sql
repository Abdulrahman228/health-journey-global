-- ============================================================================
-- Managed-patient overhaul — Phase A: doctor↔patient link (many-to-many).
--
-- Today a managed patient is a profiles row owned by ONE doctor
-- (managed_by_doctor). If two doctors register the same phone they get two
-- separate rows — no shared identity. This adds `doctor_patients` so multiple
-- doctors can follow ONE patient, and makes add_managed_patient DEDUP by phone.
--
-- Fully backward-compatible: managed_by_doctor stays; existing rows are
-- backfilled into the link table; get_managed_patients returns the UNION so
-- nothing a doctor sees today disappears. Cross-doctor DATA visibility is NOT
-- granted here (each doctor still only sees records/appointments they created);
-- shared-care consent is a later phase.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.doctor_patients (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_profile_id  uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  patient_profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (doctor_profile_id, patient_profile_id)
);
CREATE INDEX IF NOT EXISTS idx_doctor_patients_doctor  ON public.doctor_patients(doctor_profile_id);
CREATE INDEX IF NOT EXISTS idx_doctor_patients_patient ON public.doctor_patients(patient_profile_id);

ALTER TABLE public.doctor_patients ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "doctor reads own patient links" ON public.doctor_patients;
CREATE POLICY "doctor reads own patient links" ON public.doctor_patients
  FOR SELECT USING (auth.uid() IN (SELECT user_id FROM public.profiles WHERE id = doctor_profile_id));

DROP POLICY IF EXISTS "patient reads own doctor links" ON public.doctor_patients;
CREATE POLICY "patient reads own doctor links" ON public.doctor_patients
  FOR SELECT USING (auth.uid() IN (SELECT user_id FROM public.profiles WHERE id = patient_profile_id));

DROP POLICY IF EXISTS "admin reads doctor_patients" ON public.doctor_patients;
CREATE POLICY "admin reads doctor_patients" ON public.doctor_patients
  FOR SELECT USING (public.has_role(auth.uid(), 'admin'));
-- (writes go through add_managed_patient / future RPCs, all SECURITY DEFINER)

-- Backfill existing managed relationships.
INSERT INTO public.doctor_patients (doctor_profile_id, patient_profile_id)
SELECT managed_by_doctor, id
  FROM public.profiles
 WHERE managed_by_doctor IS NOT NULL
ON CONFLICT (doctor_profile_id, patient_profile_id) DO NOTHING;

-- Dedup by phone + link. Reuses an existing UNCLAIMED (managed) profile with
-- the same phone so multiple doctors share ONE patient identity. Real
-- self-registered users are never auto-linked here (that needs the claim flow).
CREATE OR REPLACE FUNCTION public.add_managed_patient(
  p_full_name text,
  p_phone text DEFAULT NULL,
  p_city text DEFAULT NULL,
  p_dob date DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_doctor_profile uuid;
  v_patient        uuid;
  v_phone          text := nullif(trim(coalesce(p_phone, '')), '');
BEGIN
  SELECT id INTO v_doctor_profile FROM public.profiles WHERE user_id = auth.uid();
  IF v_doctor_profile IS NULL THEN RAISE EXCEPTION 'no_profile'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'doctor'
  ) THEN RAISE EXCEPTION 'not_a_doctor'; END IF;
  IF coalesce(trim(p_full_name), '') = '' THEN RAISE EXCEPTION 'name_required'; END IF;

  IF v_phone IS NOT NULL THEN
    SELECT id INTO v_patient
      FROM public.profiles
     WHERE phone = v_phone AND user_id IS NULL
     ORDER BY created_at ASC
     LIMIT 1;
  END IF;

  IF v_patient IS NULL THEN
    INSERT INTO public.profiles (user_id, managed_by_doctor, full_name, phone, city)
    VALUES (NULL, v_doctor_profile, trim(p_full_name), v_phone,
            nullif(trim(coalesce(p_city, '')), ''))
    RETURNING id INTO v_patient;

    IF p_dob IS NOT NULL THEN
      INSERT INTO public.patient_details (profile_id, date_of_birth)
      VALUES (v_patient, p_dob);
    END IF;
  END IF;

  INSERT INTO public.doctor_patients (doctor_profile_id, patient_profile_id)
  VALUES (v_doctor_profile, v_patient)
  ON CONFLICT (doctor_profile_id, patient_profile_id) DO NOTHING;

  RETURN v_patient;
END; $$;

GRANT EXECUTE ON FUNCTION public.add_managed_patient(text, text, text, date) TO authenticated;

-- Return every patient linked to the calling doctor (link table ∪ legacy
-- managed_by_doctor), so shared patients appear and nothing disappears.
CREATE OR REPLACE FUNCTION public.get_managed_patients()
RETURNS TABLE (id uuid, full_name text, phone text, city text, date_of_birth date)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT DISTINCT p.id, p.full_name, p.phone, p.city, pd.date_of_birth
  FROM public.profiles p
  LEFT JOIN public.patient_details pd ON pd.profile_id = p.id
  WHERE p.id IN (
    SELECT dp.patient_profile_id FROM public.doctor_patients dp
     WHERE dp.doctor_profile_id = (SELECT id FROM public.profiles WHERE user_id = auth.uid())
    UNION
    SELECT p2.id FROM public.profiles p2
     WHERE p2.managed_by_doctor = (SELECT id FROM public.profiles WHERE user_id = auth.uid())
  )
  ORDER BY p.full_name;
$$;

GRANT EXECUTE ON FUNCTION public.get_managed_patients() TO authenticated;
