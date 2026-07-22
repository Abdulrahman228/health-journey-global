-- ============================================================================
-- FIX: doctors can't update their own appointments (status stuck on 'pending').
--
-- appointments.doctor_id references doctor_details.id — but the original
-- SELECT/UPDATE policies compared it against profiles.id
-- (`profiles.id = doctor_id`), which never matches for a doctor. So a doctor's
-- status update hit RLS, affected 0 rows, and "succeeded" silently — the
-- approval never persisted.
--
-- This adds a correct doctor SELECT policy (additive, OR-ed with existing) and
-- replaces the UPDATE policy with one that resolves the doctor through
-- doctor_details → profiles → user_id. The PATIENT branch is preserved, so
-- nothing that worked before breaks.
-- ============================================================================

-- Doctor can view own appointments (via doctor_details). Additive.
DROP POLICY IF EXISTS "Doctors view own appointments" ON public.appointments;
CREATE POLICY "Doctors view own appointments" ON public.appointments FOR SELECT
USING (
  auth.uid() IN (
    SELECT p.user_id
    FROM public.doctor_details dd
    JOIN public.profiles p ON p.id = dd.profile_id
    WHERE dd.id = appointments.doctor_id
  )
);

-- Corrected UPDATE: patient (own) OR doctor (via doctor_details).
DROP POLICY IF EXISTS "Doctors and patients update appointments" ON public.appointments;
CREATE POLICY "Doctors and patients update appointments" ON public.appointments FOR UPDATE
USING (
  auth.uid() IN (SELECT user_id FROM public.profiles WHERE id = patient_id)
  OR auth.uid() IN (
    SELECT p.user_id
    FROM public.doctor_details dd
    JOIN public.profiles p ON p.id = dd.profile_id
    WHERE dd.id = appointments.doctor_id
  )
);
