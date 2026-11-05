-- ============================================================================
-- Visit status rules (2026-11-04), found on the Android emulator:
--   * cancel_appointment only accepted queue statuses ('waiting','called'); slot
--     bookings start as 'confirmed', so neither the patient nor the doctor could
--     cancel them from the apps ("Cannot cancel this appointment").
--   * start_visit / complete_visit had NO status check: a cancelled or completed
--     appointment could be (re)completed, posting revenue to the doctor ledger.
--   * all three authorised the doctor only through the clinic, so a follow-up the
--     doctor booked without a clinic could not be started / completed / cancelled.
--   * complete_visit recomputed ETAs with avg_consultation_minutes only.
-- Bodies are the live ones with only those conditions changed.
-- ============================================================================

-- True when the signed-in user is the doctor of this appointment (via the
-- appointment's doctor or its clinic's doctor).
CREATE OR REPLACE FUNCTION public._is_appointment_doctor(p_doctor_id uuid, p_clinic_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.doctor_details dd
      JOIN public.profiles p ON p.id = dd.profile_id
     WHERE p.user_id = auth.uid()
       AND (dd.id = p_doctor_id
            OR dd.id = (SELECT c.doctor_id FROM public.clinics c WHERE c.id = p_clinic_id))
  );
$$;
REVOKE EXECUTE ON FUNCTION public._is_appointment_doctor(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._is_appointment_doctor(uuid, uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.cancel_appointment(p_appointment_id uuid)
 RETURNS appointments
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_appt public.appointments;
BEGIN
  UPDATE public.appointments a
     SET status = 'cancelled', updated_at = now()
   WHERE a.id = p_appointment_id
     AND a.status IN ('pending', 'confirmed', 'waiting', 'called')
     AND (
       -- patient cancelling own
       EXISTS (SELECT 1 FROM public.profiles p
                WHERE p.id = a.patient_id AND p.user_id = auth.uid())
       OR
       -- the appointment's doctor
       public._is_appointment_doctor(a.doctor_id, a.clinic_id)
     )
   RETURNING * INTO v_appt;

  IF v_appt IS NULL THEN
    RAISE EXCEPTION 'لا يمكن إلغاء هذا الموعد (بدأ الكشف أو انتهى أو أُلغي من قبل)' USING ERRCODE = '42501';
  END IF;
  RETURN v_appt;
END$function$;

CREATE OR REPLACE FUNCTION public.start_visit(p_appointment_id uuid)
 RETURNS appointments
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_appt public.appointments;
BEGIN
  UPDATE public.appointments a
     SET status     = 'in_progress',
         started_at = now()
   WHERE a.id = p_appointment_id
     AND a.status IN ('pending', 'confirmed', 'waiting', 'called')
     AND public._is_appointment_doctor(a.doctor_id, a.clinic_id)
   RETURNING * INTO v_appt;

  IF v_appt IS NULL THEN
    RAISE EXCEPTION 'لا يمكن بدء هذا الكشف (غير موجود، أو ليس لك، أو بدأ/انتهى/أُلغي)' USING ERRCODE = '42501';
  END IF;
  RETURN v_appt;
END$function$;

CREATE OR REPLACE FUNCTION public.complete_visit(p_appointment_id uuid)
 RETURNS appointments
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_appt    public.appointments;
  v_clinic  UUID;
  v_date    DATE;
  v_avg     INTEGER;
  v_dow     SMALLINT;
BEGIN
  UPDATE public.appointments a
     SET status   = 'completed',
         ended_at = now()
   WHERE a.id = p_appointment_id
     AND a.status IN ('confirmed', 'waiting', 'called', 'in_progress')
     AND public._is_appointment_doctor(a.doctor_id, a.clinic_id)
   RETURNING * INTO v_appt;

  IF v_appt IS NULL THEN
    RAISE EXCEPTION 'لا يمكن إنهاء هذا الكشف (غير موجود، أو ليس لك، أو انتهى/أُلغي)' USING ERRCODE = '42501';
  END IF;

  v_clinic := v_appt.clinic_id;
  v_date   := v_appt.appointment_date;
  IF v_clinic IS NULL OR v_date IS NULL THEN
    RETURN v_appt;  -- no clinic queue to re-time (e.g. a doctor-booked follow-up)
  END IF;
  v_dow    := EXTRACT(DOW FROM v_date)::SMALLINT;

  -- pull current slot length from schedule
  SELECT COALESCE(s.slot_duration_minutes, s.avg_consultation_minutes, 15) INTO v_avg
    FROM public.clinic_schedules s
   WHERE s.clinic_id = v_clinic AND s.day_of_week = v_dow AND s.is_active
   ORDER BY s.start_time LIMIT 1;

  -- recompute ETAs for remaining waiting/called patients
  --  baseline = now() (since we just finished one)
  UPDATE public.appointments a
     SET estimated_start_at = now()
                              + ((rn - 1) * COALESCE(v_avg, 15) || ' minutes')::INTERVAL
    FROM (
      SELECT id,
             ROW_NUMBER() OVER (ORDER BY queue_number) AS rn
        FROM public.appointments
       WHERE clinic_id        = v_clinic
         AND appointment_date = v_date
         AND status IN ('waiting', 'called')
    ) ranked
   WHERE a.id = ranked.id;

  RETURN v_appt;
END$function$;

NOTIFY pgrst, 'reload schema';
