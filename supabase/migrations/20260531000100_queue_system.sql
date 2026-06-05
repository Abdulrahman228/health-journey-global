-- ============================================================================
-- Queue-based appointment system
-- Adds: clinic capacity, time-off, queue management on appointments,
--       RPC functions for booking + queue advancement.
-- ============================================================================

-- 1. Extend clinic_schedules with capacity + average consult duration
ALTER TABLE public.clinic_schedules
  ADD COLUMN IF NOT EXISTS max_patients_per_day INTEGER,
  ADD COLUMN IF NOT EXISTS avg_consultation_minutes INTEGER NOT NULL DEFAULT 15,
  ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;

-- 2. Doctor time-off / clinic closures (exceptions to the weekly schedule)
CREATE TABLE IF NOT EXISTS public.clinic_time_off (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  off_date DATE NOT NULL,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (clinic_id, off_date)
);

ALTER TABLE public.clinic_time_off ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Time-off viewable by everyone" ON public.clinic_time_off;
CREATE POLICY "Time-off viewable by everyone"
  ON public.clinic_time_off FOR SELECT USING (true);

DROP POLICY IF EXISTS "Doctors manage own time-off" ON public.clinic_time_off;
CREATE POLICY "Doctors manage own time-off"
  ON public.clinic_time_off FOR ALL
  USING (auth.uid() IN (
    SELECT p.user_id FROM public.profiles p
    JOIN public.doctor_details dd ON dd.profile_id = p.id
    JOIN public.clinics c ON c.doctor_id = dd.id
    WHERE c.id = clinic_time_off.clinic_id
  ))
  WITH CHECK (auth.uid() IN (
    SELECT p.user_id FROM public.profiles p
    JOIN public.doctor_details dd ON dd.profile_id = p.id
    JOIN public.clinics c ON c.doctor_id = dd.id
    WHERE c.id = clinic_time_off.clinic_id
  ));

CREATE INDEX IF NOT EXISTS idx_clinic_time_off_lookup
  ON public.clinic_time_off (clinic_id, off_date);

-- 3. Extend appointments with queue / clinic fields
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS clinic_id UUID REFERENCES public.clinics(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS appointment_date DATE,
  ADD COLUMN IF NOT EXISTS queue_number INTEGER,
  ADD COLUMN IF NOT EXISTS estimated_start_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS called_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS started_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS ended_at TIMESTAMPTZ;

-- Backfill appointment_date from scheduled_at for existing rows
UPDATE public.appointments
   SET appointment_date = (scheduled_at AT TIME ZONE 'UTC')::date
 WHERE appointment_date IS NULL;

-- Enforce one queue_number per clinic per date (only when both are set)
CREATE UNIQUE INDEX IF NOT EXISTS uniq_clinic_day_queue
  ON public.appointments (clinic_id, appointment_date, queue_number)
  WHERE clinic_id IS NOT NULL AND queue_number IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_appointments_clinic_day
  ON public.appointments (clinic_id, appointment_date, queue_number);

-- 4. Enable realtime on appointments (Supabase Realtime publication)
DO $$
BEGIN
  PERFORM 1 FROM pg_publication_tables
   WHERE pubname = 'supabase_realtime' AND tablename = 'appointments';
  IF NOT FOUND THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.appointments';
  END IF;
EXCEPTION WHEN OTHERS THEN
  -- publication may not exist in local dev; ignore
  NULL;
END$$;

-- ============================================================================
-- 5. RPC: compute next available slot for a doctor / clinic
-- Returns: clinic_id, schedule_date, day_start, day_end, max_patients,
--          avg_minutes, booked_count, queue_position_if_book_now,
--          estimated_start_at, slots_remaining
-- Searches up to 30 days ahead.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.get_next_available_slot(
  p_doctor_id UUID,
  p_clinic_id UUID DEFAULT NULL,
  p_days_ahead INTEGER DEFAULT 30
)
RETURNS TABLE (
  clinic_id UUID,
  clinic_name TEXT,
  clinic_city TEXT,
  schedule_date DATE,
  day_of_week SMALLINT,
  start_time TIME,
  end_time TIME,
  avg_minutes INTEGER,
  max_patients INTEGER,
  booked_count BIGINT,
  slots_remaining INTEGER,
  queue_position_if_book_now INTEGER,
  estimated_start_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
             COALESCE(s.avg_consultation_minutes, 15)      AS avg_minutes,
             COALESCE(
               s.max_patients_per_day,
               GREATEST(1,
                 (EXTRACT(EPOCH FROM (s.end_time - s.start_time)) / 60
                  / COALESCE(s.avg_consultation_minutes, 15))::INTEGER
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
                      AT TIME ZONE 'UTC'
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
END$$;

GRANT EXECUTE ON FUNCTION public.get_next_available_slot(UUID, UUID, INTEGER) TO anon, authenticated;

-- ============================================================================
-- 6. RPC: book an appointment in the queue (atomic, race-safe)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.book_queue_appointment(
  p_doctor_id        UUID,
  p_clinic_id        UUID,
  p_appointment_date DATE,
  p_appointment_type TEXT DEFAULT 'in_person',
  p_notes            TEXT DEFAULT NULL
)
RETURNS public.appointments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
         COALESCE(s.avg_consultation_minutes, 15)              AS avg_min,
         COALESCE(
           s.max_patients_per_day,
           GREATEST(1,
             (EXTRACT(EPOCH FROM (s.end_time - s.start_time)) / 60
              / COALESCE(s.avg_consultation_minutes, 15))::INTEGER
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
                 AT TIME ZONE 'UTC'
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
END$$;

GRANT EXECUTE ON FUNCTION public.book_queue_appointment(UUID, UUID, DATE, TEXT, TEXT) TO authenticated;

-- ============================================================================
-- 7. RPC: doctor advances the queue (call next patient)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.advance_queue(
  p_clinic_id UUID,
  p_date      DATE DEFAULT NULL
)
RETURNS public.appointments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_date    DATE;
  v_doctor  UUID;
  v_next    public.appointments;
BEGIN
  v_date := COALESCE(p_date, CURRENT_DATE);

  -- ensure caller is the doctor owning this clinic
  SELECT c.doctor_id INTO v_doctor
    FROM public.clinics c
    JOIN public.doctor_details dd ON dd.id = c.doctor_id
    JOIN public.profiles p ON p.id = dd.profile_id
   WHERE c.id = p_clinic_id AND p.user_id = auth.uid();

  IF v_doctor IS NULL THEN
    RAISE EXCEPTION 'Not authorized for this clinic' USING ERRCODE = '42501';
  END IF;

  -- pick next waiting patient
  UPDATE public.appointments
     SET status   = 'called',
         called_at = now()
   WHERE id = (
     SELECT id FROM public.appointments
      WHERE clinic_id        = p_clinic_id
        AND appointment_date = v_date
        AND status           = 'waiting'
      ORDER BY queue_number ASC
      LIMIT 1
      FOR UPDATE SKIP LOCKED
   )
   RETURNING * INTO v_next;

  RETURN v_next;  -- may be NULL if queue empty
END$$;

GRANT EXECUTE ON FUNCTION public.advance_queue(UUID, DATE) TO authenticated;

-- ============================================================================
-- 8. RPC: doctor marks the current visit as in_progress (started)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.start_visit(p_appointment_id UUID)
RETURNS public.appointments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_appt public.appointments;
BEGIN
  UPDATE public.appointments a
     SET status     = 'in_progress',
         started_at = now()
   WHERE a.id = p_appointment_id
     AND EXISTS (
       SELECT 1 FROM public.clinics c
         JOIN public.doctor_details dd ON dd.id = c.doctor_id
         JOIN public.profiles p ON p.id = dd.profile_id
        WHERE c.id = a.clinic_id AND p.user_id = auth.uid()
     )
   RETURNING * INTO v_appt;

  IF v_appt IS NULL THEN
    RAISE EXCEPTION 'Appointment not found or not authorized' USING ERRCODE = '42501';
  END IF;
  RETURN v_appt;
END$$;

GRANT EXECUTE ON FUNCTION public.start_visit(UUID) TO authenticated;

-- ============================================================================
-- 9. RPC: doctor completes the current visit
--     -> recomputes estimated_start_at for remaining waiting patients
-- ============================================================================
CREATE OR REPLACE FUNCTION public.complete_visit(p_appointment_id UUID)
RETURNS public.appointments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
     AND EXISTS (
       SELECT 1 FROM public.clinics c
         JOIN public.doctor_details dd ON dd.id = c.doctor_id
         JOIN public.profiles p ON p.id = dd.profile_id
        WHERE c.id = a.clinic_id AND p.user_id = auth.uid()
     )
   RETURNING * INTO v_appt;

  IF v_appt IS NULL THEN
    RAISE EXCEPTION 'Appointment not found or not authorized' USING ERRCODE = '42501';
  END IF;

  v_clinic := v_appt.clinic_id;
  v_date   := v_appt.appointment_date;
  v_dow    := EXTRACT(DOW FROM v_date)::SMALLINT;

  -- pull current avg from schedule
  SELECT COALESCE(s.avg_consultation_minutes, 15) INTO v_avg
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
END$$;

GRANT EXECUTE ON FUNCTION public.complete_visit(UUID) TO authenticated;

-- ============================================================================
-- 10. RPC: cancel my appointment (patient or doctor)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.cancel_appointment(p_appointment_id UUID)
RETURNS public.appointments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_appt public.appointments;
BEGIN
  UPDATE public.appointments a
     SET status = 'cancelled', updated_at = now()
   WHERE a.id = p_appointment_id
     AND a.status IN ('waiting', 'called')
     AND (
       -- patient cancelling own
       EXISTS (SELECT 1 FROM public.profiles p
                WHERE p.id = a.patient_id AND p.user_id = auth.uid())
       OR
       -- doctor cancelling
       EXISTS (SELECT 1 FROM public.clinics c
                 JOIN public.doctor_details dd ON dd.id = c.doctor_id
                 JOIN public.profiles p ON p.id = dd.profile_id
                WHERE c.id = a.clinic_id AND p.user_id = auth.uid())
     )
   RETURNING * INTO v_appt;

  IF v_appt IS NULL THEN
    RAISE EXCEPTION 'Cannot cancel this appointment' USING ERRCODE = '42501';
  END IF;
  RETURN v_appt;
END$$;

GRANT EXECUTE ON FUNCTION public.cancel_appointment(UUID) TO authenticated;

-- ============================================================================
-- 11. VIEW: live queue snapshot per clinic+date (for realtime subscribe)
-- ============================================================================
CREATE OR REPLACE VIEW public.v_clinic_queue AS
SELECT
  a.clinic_id,
  a.appointment_date,
  a.id              AS appointment_id,
  a.queue_number,
  a.status,
  a.estimated_start_at,
  a.called_at,
  a.started_at,
  a.ended_at,
  a.patient_id
  FROM public.appointments a
 WHERE a.clinic_id IS NOT NULL
   AND a.queue_number IS NOT NULL
   AND a.status IN ('waiting','called','in_progress','completed');

GRANT SELECT ON public.v_clinic_queue TO anon, authenticated;
