-- Check-in a scheduled appointment into today's live queue.
--
-- Bridges the two systems: a confirmed (scheduled) appointment becomes 'waiting'
-- with a queue number when the patient arrives, so scheduled patients and
-- walk-ins share ONE queue. Only the owning doctor may check a patient in.

CREATE OR REPLACE FUNCTION public.check_in_appointment(p_appointment_id uuid)
RETURNS public.appointments
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_appt   public.appointments;
  v_doctor uuid;
  v_no     integer;
BEGIN
  SELECT * INTO v_appt FROM public.appointments WHERE id = p_appointment_id;
  IF v_appt.id IS NULL THEN
    RAISE EXCEPTION 'not_found';
  END IF;

  -- Only the doctor who owns this appointment's clinic may check patients in.
  SELECT c.doctor_id INTO v_doctor
    FROM public.clinics c
    JOIN public.doctor_details dd ON dd.id = c.doctor_id
    JOIN public.profiles p ON p.id = dd.profile_id
   WHERE c.id = v_appt.clinic_id AND p.user_id = auth.uid();
  IF v_doctor IS NULL THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  -- Already in the queue / seen / done → no-op.
  IF v_appt.status NOT IN ('confirmed', 'pending') THEN
    RETURN v_appt;
  END IF;

  -- Give it the next queue number for the day if it doesn't have one.
  IF v_appt.queue_number IS NULL THEN
    SELECT COALESCE(MAX(queue_number), 0) + 1 INTO v_no
      FROM public.appointments
     WHERE clinic_id = v_appt.clinic_id
       AND appointment_date = v_appt.appointment_date
       AND status NOT IN ('cancelled', 'no_show');
  ELSE
    v_no := v_appt.queue_number;
  END IF;

  UPDATE public.appointments
     SET status = 'waiting',
         queue_number = v_no,
         updated_at = now()
   WHERE id = p_appointment_id
   RETURNING * INTO v_appt;

  RETURN v_appt;
END$$;

GRANT EXECUTE ON FUNCTION public.check_in_appointment(uuid) TO authenticated;

-- NOTE: v_clinic_queue is intentionally left unchanged (it powers the PATIENT
-- queue view, which should show only the ACTIVE queue — waiting → completed —
-- not scheduled appointments that haven't checked in). The doctor's web queue
-- reads the appointments table directly, so it already includes 'confirmed'.
