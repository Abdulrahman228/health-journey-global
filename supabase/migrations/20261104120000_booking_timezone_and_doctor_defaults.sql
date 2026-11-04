-- ============================================================================
-- Booking times in the clinic's timezone + honest doctor defaults (2026-11-04)
--
-- Found by booking on the Android emulator against production: a patient picked
-- 4:00 PM, the appointment was stored as 16:00 UTC and every app/web screen showed
-- 6:00 PM. The slot functions turned the clinic's wall-clock schedule into an
-- instant with `AT TIME ZONE 'UTC'`; clinics are in Egypt (UTC+2/+3). Now they use
-- the clinic's timezone (from clinics.country; Africa/Cairo by default). Only one
-- future clinic booking existed (a QA test booking); past rows are left as-is.
--
-- Also:
--   * online bookings charged the in-clinic fee -> now the online fee.
--   * slot length: the functions read avg_consultation_minutes (default 15) while
--     the Android hours editor saves slot_duration_minutes (the web writes both),
--     so a doctor who chose 30-minute visits got 15-minute slots. Prefer
--     slot_duration_minutes.
--   * doctor_details defaults of consultation_fee = 1, rating = 1 and
--     years_experience = 1 made every new doctor show "1 EGP · 1 year · 1.0 star".
--     Defaults dropped; ratings without any review are cleared.
-- Bodies below are the live definitions with only those lines changed.
-- ============================================================================

CREATE OR REPLACE FUNCTION public._clinic_tz(p_clinic_id uuid)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT CASE
           WHEN c.country ILIKE ANY (ARRAY['%saudi%', '%السعودية%', 'SA', 'KSA']) THEN 'Asia/Riyadh'
           WHEN c.country ILIKE ANY (ARRAY['%emirates%', '%الإمارات%', '%الامارات%', 'AE', 'UAE']) THEN 'Asia/Dubai'
           WHEN c.country ILIKE ANY (ARRAY['%qatar%', '%قطر%', 'QA']) THEN 'Asia/Qatar'
           WHEN c.country ILIKE ANY (ARRAY['%kuwait%', '%الكويت%', 'KW']) THEN 'Asia/Kuwait'
           ELSE 'Africa/Cairo'
         END
    FROM (SELECT (SELECT country FROM public.clinics WHERE id = p_clinic_id) AS country) c;
$$;
REVOKE EXECUTE ON FUNCTION public._clinic_tz(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._clinic_tz(uuid) TO authenticated, service_role;

-- book_slot_appointment
CREATE OR REPLACE FUNCTION public.book_slot_appointment(p_doctor_id uuid, p_clinic_id uuid, p_appointment_date date, p_slot_time time without time zone, p_appointment_type text DEFAULT 'in_person'::text, p_notes text DEFAULT NULL::text)
 RETURNS appointments
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  SELECT s.start_time, s.end_time, COALESCE(s.slot_duration_minutes, s.avg_consultation_minutes, 15) AS step
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

  v_slot_at := (p_appointment_date + p_slot_time) AT TIME ZONE public._clinic_tz(p_clinic_id);
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

  SELECT CASE
           WHEN p_appointment_type IN ('online', 'video', 'telehealth') THEN
             COALESCE(NULLIF(c.online_fee, 0), NULLIF(dd.online_consultation_fee, 0), c.consultation_fee, 0)
           ELSE COALESCE(c.consultation_fee, 0)
         END
    INTO v_fee
    FROM public.clinics c
    LEFT JOIN public.doctor_details dd ON dd.id = c.doctor_id
   WHERE c.id = p_clinic_id;

  INSERT INTO public.appointments (
    patient_id, doctor_id, clinic_id, scheduled_at, appointment_date, appointment_type,
    duration_minutes, status, fee, notes, estimated_start_at
  ) VALUES (
    v_patient_id, p_doctor_id, p_clinic_id, v_slot_at, p_appointment_date, p_appointment_type,
    v_sched.step, 'confirmed', v_fee, p_notes, v_slot_at
  )
  RETURNING * INTO v_appt;

  RETURN v_appt;
END$function$;

-- book_queue_appointment
CREATE OR REPLACE FUNCTION public.book_queue_appointment(p_doctor_id uuid, p_clinic_id uuid, p_appointment_date date, p_appointment_type text DEFAULT 'in_person'::text, p_notes text DEFAULT NULL::text)
 RETURNS appointments
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_patient_id   UUID;
  v_dow          SMALLINT;
  v_schedule     RECORD;
  v_cap          INTEGER;
  v_booked       BIGINT;
  v_queue_no     INTEGER;
  v_est_start    TIMESTAMPTZ;
  v_fee          NUMERIC;
  v_appt         public.appointments;
BEGIN
  -- resolve patient profile from auth user
  SELECT id INTO v_patient_id
    FROM public.profiles
   WHERE user_id = auth.uid();

  IF v_patient_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated' USING ERRCODE = '28000';
  END IF;

  -- validate date is not in the past
  IF p_appointment_date < CURRENT_DATE THEN
    RAISE EXCEPTION 'Cannot book in the past' USING ERRCODE = '22023';
  END IF;

  -- check not on a time-off day
  IF EXISTS (
    SELECT 1 FROM public.clinic_time_off
     WHERE clinic_id = p_clinic_id AND off_date = p_appointment_date
  ) THEN
    RAISE EXCEPTION 'Clinic closed on this date' USING ERRCODE = '23514';
  END IF;

  -- find matching schedule row for that weekday
  v_dow := EXTRACT(DOW FROM p_appointment_date)::SMALLINT;

  SELECT s.start_time,
         s.end_time,
         COALESCE(s.slot_duration_minutes, s.avg_consultation_minutes, 15)              AS avg_min,
         COALESCE(
           s.max_patients_per_day,
           GREATEST(1,
             (EXTRACT(EPOCH FROM (s.end_time - s.start_time)) / 60
              / COALESCE(s.slot_duration_minutes, s.avg_consultation_minutes, 15))::INTEGER
           )
         )                                                     AS cap
    INTO v_schedule
    FROM public.clinic_schedules s
    JOIN public.clinics c ON c.id = s.clinic_id
   WHERE c.id            = p_clinic_id
     AND c.doctor_id     = p_doctor_id
     AND s.day_of_week   = v_dow
     AND s.is_active     = true
   ORDER BY s.start_time
   LIMIT 1;

  IF v_schedule IS NULL THEN
    RAISE EXCEPTION 'Doctor not available on this day' USING ERRCODE = '23514';
  END IF;

  v_cap := v_schedule.cap;

  -- lock and count atomically: serialize bookings per (clinic, date)
  PERFORM pg_advisory_xact_lock(
    hashtext(p_clinic_id::text || '|' || p_appointment_date::text)
  );

  SELECT COUNT(*) INTO v_booked
    FROM public.appointments
   WHERE clinic_id        = p_clinic_id
     AND appointment_date = p_appointment_date
     AND status NOT IN ('cancelled', 'no_show');

  IF v_booked >= v_cap THEN
    RAISE EXCEPTION 'No slots remaining for this day' USING ERRCODE = '23505';
  END IF;

  v_queue_no  := (v_booked + 1)::INTEGER;
  v_est_start := (p_appointment_date::timestamp + v_schedule.start_time)
                 AT TIME ZONE public._clinic_tz(p_clinic_id)
                 + (v_booked * v_schedule.avg_min || ' minutes')::INTERVAL;

  -- fee comes from clinic
  SELECT COALESCE(consultation_fee, 0) INTO v_fee
    FROM public.clinics WHERE id = p_clinic_id;

  INSERT INTO public.appointments (
    patient_id, doctor_id, clinic_id,
    scheduled_at, appointment_date, appointment_type,
    duration_minutes, status, fee, notes,
    queue_number, estimated_start_at
  ) VALUES (
    v_patient_id, p_doctor_id, p_clinic_id,
    v_est_start, p_appointment_date, p_appointment_type,
    v_schedule.avg_min, 'waiting', v_fee, p_notes,
    v_queue_no, v_est_start
  )
  RETURNING * INTO v_appt;

  RETURN v_appt;
END$function$;

-- get_clinic_day_slots
CREATE OR REPLACE FUNCTION public.get_clinic_day_slots(p_doctor_id uuid, p_clinic_id uuid, p_date date)
 RETURNS TABLE(slot_time time without time zone, slot_start_at timestamp with time zone, is_taken boolean, is_past boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  SELECT s.start_time, s.end_time, COALESCE(s.slot_duration_minutes, s.avg_consultation_minutes, 15) AS step
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
    slot_start_at := (p_date + v_t) AT TIME ZONE public._clinic_tz(p_clinic_id);
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
END$function$;

-- get_next_available_slot
CREATE OR REPLACE FUNCTION public.get_next_available_slot(p_doctor_id uuid, p_clinic_id uuid DEFAULT NULL::uuid, p_days_ahead integer DEFAULT 30)
 RETURNS TABLE(clinic_id uuid, clinic_name text, clinic_city text, schedule_date date, day_of_week smallint, start_time time without time zone, end_time time without time zone, avg_minutes integer, max_patients integer, booked_count bigint, slots_remaining integer, queue_position_if_book_now integer, estimated_start_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_offset INTEGER;
  v_date DATE;
  v_dow SMALLINT;
  v_rec RECORD;
  v_booked BIGINT;
  v_cap INTEGER;
  v_start_ts TIMESTAMPTZ;
BEGIN
  FOR v_offset IN 0 .. p_days_ahead LOOP
    v_date := (CURRENT_DATE + v_offset);
    v_dow  := EXTRACT(DOW FROM v_date)::SMALLINT;

    FOR v_rec IN
      SELECT s.id          AS schedule_id,
             c.id          AS clinic_id,
             c.name        AS clinic_name,
             c.city        AS clinic_city,
             s.start_time,
             s.end_time,
             COALESCE(s.slot_duration_minutes, s.avg_consultation_minutes, 15)      AS avg_minutes,
             COALESCE(
               s.max_patients_per_day,
               GREATEST(1,
                 (EXTRACT(EPOCH FROM (s.end_time - s.start_time)) / 60
                  / COALESCE(s.slot_duration_minutes, s.avg_consultation_minutes, 15))::INTEGER
               )
             )            AS max_patients
        FROM public.clinic_schedules s
        JOIN public.clinics c ON c.id = s.clinic_id
       WHERE c.doctor_id    = p_doctor_id
         AND s.day_of_week  = v_dow
         AND s.is_active    = true
         AND (p_clinic_id IS NULL OR c.id = p_clinic_id)
         AND NOT EXISTS (
               SELECT 1 FROM public.clinic_time_off t
                WHERE t.clinic_id = c.id AND t.off_date = v_date
             )
       ORDER BY s.start_time
    LOOP
      -- count active bookings for this clinic+date
      SELECT COUNT(*) INTO v_booked
        FROM public.appointments a
       WHERE a.clinic_id        = v_rec.clinic_id
         AND a.appointment_date = v_date
         AND a.status NOT IN ('cancelled', 'no_show');

      v_cap := v_rec.max_patients;

      IF v_booked < v_cap THEN
        -- compute estimated start = day_start + booked_count * avg_minutes
        v_start_ts := (v_date::timestamp + v_rec.start_time)
                      AT TIME ZONE public._clinic_tz(v_rec.clinic_id)
                      + (v_booked * v_rec.avg_minutes || ' minutes')::INTERVAL;

        -- if today and current time is past start, push it forward
        IF v_date = CURRENT_DATE AND v_start_ts < NOW() THEN
          v_start_ts := NOW() + (v_booked * v_rec.avg_minutes || ' minutes')::INTERVAL;
        END IF;

        clinic_id                   := v_rec.clinic_id;
        clinic_name                 := v_rec.clinic_name;
        clinic_city                 := v_rec.clinic_city;
        schedule_date               := v_date;
        day_of_week                 := v_dow;
        start_time                  := v_rec.start_time;
        end_time                    := v_rec.end_time;
        avg_minutes                 := v_rec.avg_minutes;
        max_patients                := v_cap;
        booked_count                := v_booked;
        slots_remaining             := v_cap - v_booked::INTEGER;
        queue_position_if_book_now  := (v_booked + 1)::INTEGER;
        estimated_start_at          := v_start_ts;
        RETURN NEXT;
        RETURN;  -- first available wins
      END IF;
    END LOOP;
  END LOOP;

  RETURN;  -- nothing available within window
END$function$;

-- The QA test booking made while finding this bug was stored 2h late; fix it so
-- the test account shows the slot that was picked (4:00 PM Cairo).
UPDATE public.appointments a
   SET scheduled_at = (a.scheduled_at AT TIME ZONE 'UTC') AT TIME ZONE public._clinic_tz(a.clinic_id),
       estimated_start_at = CASE WHEN a.estimated_start_at IS NULL THEN NULL
                                 ELSE (a.estimated_start_at AT TIME ZONE 'UTC') AT TIME ZONE public._clinic_tz(a.clinic_id) END
  FROM public.clinics c
 WHERE c.id = a.clinic_id
   AND c.name = 'QA Clinic'
   AND a.scheduled_at > now();

-- Honest doctor defaults ------------------------------------------------------
ALTER TABLE public.doctor_details ALTER COLUMN consultation_fee DROP DEFAULT;
ALTER TABLE public.doctor_details ALTER COLUMN rating DROP DEFAULT;
ALTER TABLE public.doctor_details ALTER COLUMN years_experience DROP DEFAULT;
UPDATE public.doctor_details SET rating = NULL WHERE COALESCE(reviews_count, 0) = 0 AND rating IS NOT NULL;
UPDATE public.doctor_details SET consultation_fee = NULL WHERE consultation_fee = 1;

NOTIFY pgrst, 'reload schema';
