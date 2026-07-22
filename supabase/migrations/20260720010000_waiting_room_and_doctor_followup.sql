-- ============================================================================
-- Phase-0 activation helpers (mobile):
--   1) doctor_today_queue_stats()  — live "waiting now" + avg visit minutes for
--      the waiting-room display screen (one SQL source, symmetric on both apps).
--   2) doctor_book_followup(...)    — lets a DOCTOR book a follow-up FOR a patient
--      (the appointments INSERT policy only allows the patient, so this is the
--      SECURITY DEFINER path that verifies the caller is a doctor). Powers the
--      "احجز المتابعة عند الخروج" quick action → patient keeps the app + reminders.
-- Additive & safe: only new functions.
-- ============================================================================

-- 1) Waiting-room live stats for the CALLING doctor (resolved from auth.uid()).
CREATE OR REPLACE FUNCTION public.doctor_today_queue_stats()
RETURNS TABLE (waiting_count integer, avg_minutes integer)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_doctor uuid;
BEGIN
  SELECT dd.id INTO v_doctor
  FROM public.doctor_details dd
  JOIN public.profiles p ON p.id = dd.profile_id
  WHERE p.user_id = auth.uid()
  LIMIT 1;

  IF v_doctor IS NULL THEN
    waiting_count := 0;
    avg_minutes := 0;
    RETURN NEXT;
    RETURN;
  END IF;

  SELECT
    COUNT(*)::int,
    COALESCE(NULLIF(ROUND(AVG(NULLIF(a.duration_minutes, 0)))::int, 0), 20)
  INTO waiting_count, avg_minutes
  FROM public.appointments a
  WHERE a.doctor_id = v_doctor
    AND (a.appointment_date = current_date OR a.scheduled_at::date = current_date)
    AND lower(a.status) NOT IN ('completed','done','cancelled','canceled','missed','no_show');

  waiting_count := COALESCE(waiting_count, 0);
  avg_minutes := COALESCE(avg_minutes, 20);
  RETURN NEXT;
END;
$$;

-- 2) Doctor books a follow-up FOR one of their patients. Returns the appointment id.
CREATE OR REPLACE FUNCTION public.doctor_book_followup(
  p_patient_id     uuid,
  p_scheduled_at   timestamptz,
  p_appointment_date date DEFAULT NULL,
  p_clinic_id      uuid DEFAULT NULL,
  p_fee            numeric DEFAULT 0,
  p_notes          text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_doctor uuid;
  v_id     uuid;
BEGIN
  SELECT dd.id INTO v_doctor
  FROM public.doctor_details dd
  JOIN public.profiles p ON p.id = dd.profile_id
  WHERE p.user_id = auth.uid()
  LIMIT 1;

  IF v_doctor IS NULL THEN
    RAISE EXCEPTION 'not_a_doctor';
  END IF;

  IF p_patient_id IS NULL THEN
    RAISE EXCEPTION 'patient_required';
  END IF;

  INSERT INTO public.appointments (
    doctor_id, patient_id, scheduled_at, appointment_date, appointment_type,
    visit_type, status, fee, currency, clinic_id, notes, payment_status, payment_method
  ) VALUES (
    v_doctor,
    p_patient_id,
    p_scheduled_at,
    COALESCE(p_appointment_date, p_scheduled_at::date),
    'in_person',
    'follow_up',                 -- a doctor-booked next visit is a follow-up
    'confirmed',                 -- doctor-booked ⇒ already confirmed
    COALESCE(p_fee, 0),
    'EGP',
    p_clinic_id,
    p_notes,
    'unpaid',
    'clinic'
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.doctor_today_queue_stats() TO authenticated;
GRANT EXECUTE ON FUNCTION public.doctor_book_followup(uuid, timestamptz, date, uuid, numeric, text) TO authenticated;
