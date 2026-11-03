-- Fixed time-slot booking (replaces the auto "next in queue" pick with the
-- patient choosing a specific time; taken/past times are shown locked).
--
-- get_clinic_day_slots(doctor, clinic, date) → the day's grid of times with a
-- taken/past flag. book_slot_appointment(...) books one specific slot, race-safe
-- (an advisory lock per clinic+date+slot + a taken-check inside it), so two
-- patients can never take the same time.

CREATE OR REPLACE FUNCTION public.get_clinic_day_slots(
  p_doctor_id UUID,
  p_clinic_id UUID,
  p_date      DATE
)
RETURNS TABLE (
  slot_time     time,
  slot_start_at timestamptz,
  is_taken      boolean,
  is_past       boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_sched RECORD;
  v_step  interval;
  v_t     time;
BEGIN
  -- Clinic closed that day → no slots.
  IF EXISTS (
    SELECT 1 FROM public.clinic_time_off
     WHERE clinic_id = p_clinic_id AND off_date = p_date
  ) THEN
    RETURN;
  END IF;

  SELECT s.start_time, s.end_time, COALESCE(s.avg_consultation_minutes, 15) AS step
    INTO v_sched
    FROM public.clinic_schedules s
    JOIN public.clinics c ON c.id = s.clinic_id
   WHERE c.id = p_clinic_id
     AND c.doctor_id = p_doctor_id
     AND s.day_of_week = EXTRACT(DOW FROM p_date)::smallint
     AND s.is_active = true
   ORDER BY s.start_time
   LIMIT 1;

  IF v_sched IS NULL THEN
    RETURN;
  END IF;

  v_step := (v_sched.step || ' minutes')::interval;
  v_t := v_sched.start_time;

  WHILE v_t < v_sched.end_time LOOP
    slot_time     := v_t;
    slot_start_at := (p_date + v_t) AT TIME ZONE 'UTC';
    is_taken := EXISTS (
      SELECT 1 FROM public.appointments a
       WHERE a.clinic_id = p_clinic_id
         AND a.scheduled_at = slot_start_at
         AND a.status NOT IN ('cancelled', 'no_show')
    );
    is_past := slot_start_at <= now();
    RETURN NEXT;
    v_t := v_t + v_step;
  END LOOP;
END$$;

GRANT EXECUTE ON FUNCTION public.get_clinic_day_slots(UUID, UUID, DATE) TO anon, authenticated;

-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.book_slot_appointment(
  p_doctor_id        UUID,
  p_clinic_id        UUID,
  p_appointment_date DATE,
  p_slot_time        time,
  p_appointment_type TEXT DEFAULT 'in_person',
  p_notes            TEXT DEFAULT NULL
)
RETURNS public.appointments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_patient_id UUID;
  v_sched      RECORD;
  v_slot_at    timestamptz;
  v_fee        NUMERIC;
  v_appt       public.appointments;
BEGIN
  SELECT id INTO v_patient_id FROM public.profiles WHERE user_id = auth.uid();
  IF v_patient_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  IF p_appointment_date < CURRENT_DATE THEN
    RAISE EXCEPTION 'Cannot book in the past' USING ERRCODE = '22023';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.clinic_time_off
     WHERE clinic_id = p_clinic_id AND off_date = p_appointment_date
  ) THEN
    RAISE EXCEPTION 'Clinic closed on this date' USING ERRCODE = '23514';
  END IF;

  SELECT s.start_time, s.end_time, COALESCE(s.avg_consultation_minutes, 15) AS step
    INTO v_sched
    FROM public.clinic_schedules s
    JOIN public.clinics c ON c.id = s.clinic_id
   WHERE c.id = p_clinic_id
     AND c.doctor_id = p_doctor_id
     AND s.day_of_week = EXTRACT(DOW FROM p_appointment_date)::smallint
     AND s.is_active = true
   ORDER BY s.start_time
   LIMIT 1;
  IF v_sched IS NULL THEN
    RAISE EXCEPTION 'Doctor not available on this day' USING ERRCODE = '23514';
  END IF;
  IF p_slot_time < v_sched.start_time OR p_slot_time >= v_sched.end_time THEN
    RAISE EXCEPTION 'الوقت خارج مواعيد العمل' USING ERRCODE = '22023';
  END IF;

  v_slot_at := (p_appointment_date + p_slot_time) AT TIME ZONE 'UTC';
  IF v_slot_at <= now() THEN
    RAISE EXCEPTION 'الوقت فات، اختر وقتًا آخر' USING ERRCODE = '22023';
  END IF;

  -- Serialize bookings for this exact slot.
  PERFORM pg_advisory_xact_lock(
    hashtext(p_clinic_id::text || '|' || p_appointment_date::text || '|' || p_slot_time::text)
  );

  IF EXISTS (
    SELECT 1 FROM public.appointments a
     WHERE a.clinic_id = p_clinic_id
       AND a.scheduled_at = v_slot_at
       AND a.status NOT IN ('cancelled', 'no_show')
  ) THEN
    RAISE EXCEPTION 'الموعد محجوز، اختر وقتًا آخر' USING ERRCODE = '23505';
  END IF;

  SELECT COALESCE(consultation_fee, 0) INTO v_fee FROM public.clinics WHERE id = p_clinic_id;

  INSERT INTO public.appointments (
    patient_id, doctor_id, clinic_id, scheduled_at, appointment_date, appointment_type,
    duration_minutes, status, fee, notes, estimated_start_at
  ) VALUES (
    v_patient_id, p_doctor_id, p_clinic_id, v_slot_at, p_appointment_date, p_appointment_type,
    v_sched.step, 'confirmed', v_fee, p_notes, v_slot_at
  )
  RETURNING * INTO v_appt;

  RETURN v_appt;
END$$;

GRANT EXECUTE ON FUNCTION public.book_slot_appointment(UUID, UUID, DATE, time, TEXT, TEXT) TO authenticated;
