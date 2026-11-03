-- ============================================================================
-- Managed-patient overhaul — Phase D: shared-care consent + transparency.
--
-- The patient controls whether the doctors linked to them (doctor_patients) may
-- follow their case together. Adds:
--   • profiles.shared_care_consent (patient-controlled, default OFF)
--   • set_shared_care_consent()          — patient toggles it
--   • list_my_care_doctors()             — patient sees who follows them
--   • list_care_doctors_for_patient()    — a linked doctor sees co-doctors,
--     only when the patient consented.
-- The EMR read grant for linked-but-not-yet-treating doctors is added in the
-- server fn getPatientHistoryForDoctor (also gated on this consent).
-- ============================================================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS shared_care_consent boolean NOT NULL DEFAULT false;

-- Patient toggles their own consent.
CREATE OR REPLACE FUNCTION public.set_shared_care_consent(p_consent boolean)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.profiles
     SET shared_care_consent = p_consent, updated_at = now()
   WHERE user_id = auth.uid();
  IF NOT FOUND THEN RAISE EXCEPTION 'no_profile'; END IF;
END; $$;

GRANT EXECUTE ON FUNCTION public.set_shared_care_consent(boolean) TO authenticated;

-- Patient: the doctors registered to follow me (transparency — always visible
-- to the patient regardless of consent).
CREATE OR REPLACE FUNCTION public.list_my_care_doctors()
RETURNS TABLE (doctor_profile_id uuid, full_name text, specialty text, linked_at timestamptz)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT dp.doctor_profile_id, p.full_name, dd.specialty, dp.created_at
  FROM public.doctor_patients dp
  JOIN public.profiles me
    ON me.id = dp.patient_profile_id AND me.user_id = auth.uid()
  LEFT JOIN public.profiles p ON p.id = dp.doctor_profile_id
  LEFT JOIN public.doctor_details dd ON dd.profile_id = dp.doctor_profile_id
  ORDER BY dp.created_at DESC;
$$;

GRANT EXECUTE ON FUNCTION public.list_my_care_doctors() TO authenticated;

-- Doctor: co-doctors following a patient — only if the caller is a linked
-- doctor AND the patient consented to shared care.
CREATE OR REPLACE FUNCTION public.list_care_doctors_for_patient(p_patient_profile_id uuid)
RETURNS TABLE (doctor_profile_id uuid, full_name text, specialty text)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT dp.doctor_profile_id, p.full_name, dd.specialty
  FROM public.doctor_patients dp
  LEFT JOIN public.profiles p ON p.id = dp.doctor_profile_id
  LEFT JOIN public.doctor_details dd ON dd.profile_id = dp.doctor_profile_id
  WHERE dp.patient_profile_id = p_patient_profile_id
    AND EXISTS (
      SELECT 1 FROM public.doctor_patients me
      JOIN public.profiles mp ON mp.id = me.doctor_profile_id
      WHERE me.patient_profile_id = p_patient_profile_id AND mp.user_id = auth.uid()
    )
    AND EXISTS (
      SELECT 1 FROM public.profiles pt
      WHERE pt.id = p_patient_profile_id AND pt.shared_care_consent = true
    );
$$;

GRANT EXECUTE ON FUNCTION public.list_care_doctors_for_patient(uuid) TO authenticated;
