-- ============================================================================
-- 2026-11-06 — Database fixes found by the web / Android / iOS wiring audit.
-- Every item was confirmed against production (read-only) before writing.
-- Safe to re-run.
-- ============================================================================

-- 1) Queue booking was broken everywhere (PostgREST PGRST203 "could not choose
--    the best candidate function"): a stray 6-argument book_queue_appointment
--    overload (p_is_emergency) made every call ambiguous. That overload was an
--    unused stub (no patient, no status, no fee, no clinic timezone). The real
--    5-argument function stays.
DROP FUNCTION IF EXISTS public.book_queue_appointment(uuid, uuid, date, text, text, boolean);

-- 2) One "is this doctor linked to this patient?" rule for RLS — the same rule
--    the website enforces server-side (src/lib/_identity.ts isDoctorLinkedToPatient):
--    an active appointment, a doctor_patients link, a managed profile, or a
--    prior medical record by this doctor.
CREATE OR REPLACE FUNCTION public._doctor_linked_to_patient(
  p_doctor_profile  uuid,
  p_patient_profile uuid
) RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p_doctor_profile IS NOT NULL AND p_patient_profile IS NOT NULL AND (
       p_doctor_profile = p_patient_profile
    OR EXISTS (SELECT 1 FROM public.doctor_patients dp
                WHERE dp.doctor_profile_id = p_doctor_profile
                  AND dp.patient_profile_id = p_patient_profile)
    OR EXISTS (SELECT 1 FROM public.profiles pp
                WHERE pp.id = p_patient_profile
                  AND pp.managed_by_doctor = p_doctor_profile)
    OR EXISTS (SELECT 1 FROM public.medical_records mr
                WHERE mr.doctor_profile_id = p_doctor_profile
                  AND mr.patient_profile_id = p_patient_profile)
    OR EXISTS (SELECT 1 FROM public.appointments a
                 JOIN public.doctor_details dd ON dd.id = a.doctor_id
                WHERE dd.profile_id = p_doctor_profile
                  AND a.patient_id = p_patient_profile
                  AND a.status NOT IN ('cancelled', 'no_show'))
  );
$$;
-- Called from RLS policies as the querying role, so authenticated needs EXECUTE.
REVOKE ALL ON FUNCTION public._doctor_linked_to_patient(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._doctor_linked_to_patient(uuid, uuid) TO authenticated;

-- 3) Doctors could not see a patient's medical profile (allergies, chronic
--    conditions) from an appointment: the policy compared profiles.id with
--    appointments.doctor_id, which holds a doctor_details.id.
DROP POLICY IF EXISTS "doctor reads patient profile of treated patients" ON public.patient_medical_profile;
CREATE POLICY "doctor reads patient profile of treated patients" ON public.patient_medical_profile
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.profiles me
     WHERE me.user_id = auth.uid()
       AND public._doctor_linked_to_patient(me.id, patient_medical_profile.patient_profile_id)
  ));

-- 4) patient_details (DOB, blood type) for the doctor: only went through
--    appointments and doctor_details.user_id (NULL for some doctors), so
--    manually added patients showed no age / blood type.
DROP POLICY IF EXISTS patient_details_doctor_read ON public.patient_details;
CREATE POLICY patient_details_doctor_read ON public.patient_details
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.profiles me
     WHERE me.user_id = auth.uid()
       AND public._doctor_linked_to_patient(me.id, patient_details.profile_id)
  ));

-- 5) medical_records INSERT only checked that the doctor writes as himself —
--    any doctor could add a record to any patient's history from the apps.
--    Now the patient must be linked to that doctor (rule 2).
DROP POLICY IF EXISTS "doctor inserts medical_records" ON public.medical_records;
CREATE POLICY "doctor inserts medical_records" ON public.medical_records
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() IN (SELECT p.user_id FROM public.profiles p WHERE p.id = medical_records.doctor_profile_id)
    AND public._doctor_linked_to_patient(medical_records.doctor_profile_id, medical_records.patient_profile_id)
  );

-- 6) Labs could never upload results: unqualified `name` inside the subquery
--    resolved to lab_facilities.name instead of the storage object's path.
DROP POLICY IF EXISTS "lab_upload_order_attachment" ON storage.objects;
CREATE POLICY "lab_upload_order_attachment" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'medical-attachments'
    AND EXISTS (
      SELECT 1 FROM public.lab_orders lo
        JOIN public.lab_facilities lf ON lf.id = lo.lab_id
       WHERE lf.owner_user_id = auth.uid()
         AND lo.patient_profile_id::text = (storage.foldername(objects.name))[1]
    )
  );

-- 7) Lab result files follow the website rule (src/lib/labs.functions.ts):
--    the patient and the doctor the patient authorized may open them once the
--    lab marked the order paid.
--    The check runs as SECURITY DEFINER so it does not depend on the caller's
--    RLS view of medical_attachments / lab_orders.
CREATE OR REPLACE FUNCTION public._lab_file_access(p_path text, p_as_doctor boolean)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.medical_attachments ma
      JOIN public.lab_orders lo ON lo.id = ma.lab_order_id
     WHERE ma.file_url = p_path
       AND lo.payment_status = 'paid'
       AND (
         NOT p_as_doctor
         OR (lo.patient_authorized IS TRUE
             AND EXISTS (SELECT 1 FROM public.profiles dp
                          WHERE dp.id = lo.authorized_doctor_profile_id
                            AND dp.user_id = auth.uid()))
       )
  );
$$;
REVOKE ALL ON FUNCTION public._lab_file_access(text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._lab_file_access(text, boolean) TO authenticated;

--    a) the authorized doctor could not open them at all from the apps;
DROP POLICY IF EXISTS "authorized_doctor_read_lab_result" ON storage.objects;
CREATE POLICY "authorized_doctor_read_lab_result" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'medical-attachments'
    AND public._lab_file_access(objects.name, true)
  );
--    b) the patient could download a lab result before paying (listing their
--       own folder bypassed the paywall). Lab files (<patient>/lab/...) now need
--       a paid order; everything else in the patient's folder is unchanged.
DROP POLICY IF EXISTS "patient_read_own_attachment" ON storage.objects;
CREATE POLICY "patient_read_own_attachment" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'medical-attachments'
    AND (storage.foldername(objects.name))[1] IN (
      SELECT p.id::text FROM public.profiles p WHERE p.user_id = auth.uid()
    )
    AND (
      coalesce((storage.foldername(objects.name))[2], '') <> 'lab'
      OR public._lab_file_access(objects.name, false)
    )
  );

-- 8) The "online consultations" switch in the apps reported success but never
--    changed anything: telemedicine_enabled is a locked column
--    (guard_doctor_details_writes). Same rule as the website server function:
--    only a verified doctor may switch it on.
CREATE OR REPLACE FUNCTION public.set_my_telemedicine_enabled(p_enabled boolean)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_dd       uuid;
  v_verified boolean;
BEGIN
  SELECT dd.id, coalesce(dd.is_verified, false)
    INTO v_dd, v_verified
    FROM public.doctor_details dd
    JOIN public.profiles p ON p.id = dd.profile_id
   WHERE p.user_id = auth.uid()
   LIMIT 1;
  IF v_dd IS NULL THEN
    RAISE EXCEPTION 'لم يتم العثور على ملف الطبيب' USING ERRCODE = '42501';
  END IF;
  IF p_enabled AND NOT v_verified THEN
    RAISE EXCEPTION 'يجب توثيق حسابك أولاً لتفعيل الاستشارات أونلاين' USING ERRCODE = '42501';
  END IF;
  PERFORM set_config('app.privileged', 'on', true);
  UPDATE public.doctor_details SET telemedicine_enabled = p_enabled WHERE id = v_dd;
  PERFORM set_config('app.privileged', '', true);
  RETURN p_enabled;
END;
$$;
REVOKE ALL ON FUNCTION public.set_my_telemedicine_enabled(boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_my_telemedicine_enabled(boolean) TO authenticated;

-- 9) Follow-up pricing never applied when the PATIENT booked:
--    classify_appointment_visit_type updates visit_type/fee, which
--    guard_appointment_writes silently reverts for patient callers. The function
--    already checks the caller is the patient or the doctor, so its own UPDATE
--    runs as a privileged write. (Body otherwise unchanged.)
CREATE OR REPLACE FUNCTION public.classify_appointment_visit_type(p_appointment_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_doctor_id uuid; v_patient_id uuid; v_scheduled_at timestamptz;
  v_type text; v_fee numeric;
BEGIN
  SELECT doctor_id, patient_id, scheduled_at INTO v_doctor_id, v_patient_id, v_scheduled_at
    FROM public.appointments WHERE id = p_appointment_id;
  IF v_doctor_id IS NULL THEN RETURN 'appointment_not_found'; END IF;

  -- Only the patient, the doctor, or the server may (re)classify an appointment.
  IF NOT public._is_privileged_writer()
     AND NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = v_patient_id AND p.user_id = auth.uid())
     AND NOT EXISTS (SELECT 1 FROM public.doctor_details dd JOIN public.profiles p ON p.id = dd.profile_id
                      WHERE dd.id = v_doctor_id AND p.user_id = auth.uid()) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  SELECT vt.visit_type, vt.fee INTO v_type, v_fee
    FROM public.preview_visit_pricing(v_doctor_id, v_patient_id, v_scheduled_at) vt;

  PERFORM set_config('app.privileged', 'on', true);
  UPDATE public.appointments
     SET visit_type = v_type, fee = COALESCE(v_fee, fee)
   WHERE id = p_appointment_id;
  PERFORM set_config('app.privileged', '', true);
  RETURN v_type;
END;
$$;

-- 10) Back-fill details.user_id from the profile (NULL on 1 of 2 doctors and
--     7 of 8 patients); several policies compare <details>.user_id = auth.uid().
UPDATE public.doctor_details d
   SET user_id = p.user_id
  FROM public.profiles p
 WHERE p.id = d.profile_id AND d.user_id IS NULL AND p.user_id IS NOT NULL;

UPDATE public.patient_details d
   SET user_id = p.user_id
  FROM public.profiles p
 WHERE p.id = d.profile_id AND d.user_id IS NULL AND p.user_id IS NOT NULL;

-- 11) Live updates only worked for appointments: posts, medical records and
--     attachments were not in the realtime publication (RLS still applies to
--     every subscriber).
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['posts', 'medical_records', 'medical_attachments'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
       WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
