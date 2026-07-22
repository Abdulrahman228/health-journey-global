-- ============================================================================
-- Emergency booking (Point 5) + queue auto-delay (Point 4) for the MOBILE apps.
--
-- The web does this via service-role server functions (emergency.booking.ts /
-- emergency.shift.ts). Mobile can't use the service role, so we expose the same
-- logic as SECURITY DEFINER RPCs that verify the caller and reuse the existing
-- _notify() helper. Additive & safe — no existing behavior changes.
-- ============================================================================

ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS is_emergency boolean NOT NULL DEFAULT false;

-- ── Point 5: patient flags their OWN appointment as emergency + alerts doctor ──
CREATE OR REPLACE FUNCTION public.flag_emergency_appointment(p_appointment_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_appt RECORD;
  v_caller_profile uuid;
  v_doctor_user uuid;
BEGIN
  SELECT id, doctor_id, patient_id INTO v_appt
  FROM public.appointments WHERE id = p_appointment_id;
  IF v_appt.id IS NULL THEN RAISE EXCEPTION 'Appointment not found'; END IF;

  SELECT id INTO v_caller_profile FROM public.profiles WHERE user_id = auth.uid();
  IF v_caller_profile IS NULL OR v_caller_profile <> v_appt.patient_id THEN
    RAISE EXCEPTION 'Forbidden: not your appointment';
  END IF;

  UPDATE public.appointments SET is_emergency = true WHERE id = p_appointment_id;

  v_doctor_user := public._user_id_from_doctor_details(v_appt.doctor_id);
  PERFORM public._notify(
    v_doctor_user,
    'emergency_alert',
    'حالة طارئة - مريض يحتاج اهتمامًا عاجلًا!',
    'تم تصنيف هذا الحجز كحالة طارئة، يرجى التواصل مع المريض فورًا.',
    '/dashboard',
    'emergency:' || p_appointment_id::text,
    jsonb_build_object('priority', 'high', 'appointment_id', p_appointment_id::text)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.flag_emergency_appointment(uuid) TO authenticated;

-- ── Point 4: doctor delays TODAY's queue by N minutes + alerts patients ────────
CREATE OR REPLACE FUNCTION public.emergency_shift_queue(p_doctor_id uuid, p_delay_minutes int)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner uuid;
  v_today date := current_date;
  v_shifted int := 0;
  r RECORD;
BEGIN
  IF p_delay_minutes < 1 OR p_delay_minutes > 240 THEN
    RAISE EXCEPTION 'Invalid delay minutes';
  END IF;

  -- AUTHZ: caller must own this doctor_details row.
  SELECT p.user_id INTO v_owner
  FROM public.doctor_details dd
  JOIN public.profiles p ON p.id = dd.profile_id
  WHERE dd.id = p_doctor_id;
  IF v_owner IS NULL OR v_owner <> auth.uid() THEN
    RAISE EXCEPTION 'Forbidden: not your queue';
  END IF;

  -- Push every not-yet-served appointment today back by the delay.
  UPDATE public.appointments
  SET estimated_start_at = COALESCE(estimated_start_at, now()) + (p_delay_minutes || ' minutes')::interval
  WHERE doctor_id = p_doctor_id
    AND appointment_date = v_today
    AND status IN ('waiting', 'called', 'pending', 'confirmed')
    AND started_at IS NULL;
  GET DIAGNOSTICS v_shifted = ROW_COUNT;

  -- High-priority notification to each affected patient.
  FOR r IN
    SELECT DISTINCT p.user_id AS uid
    FROM public.appointments a
    JOIN public.profiles p ON p.id = a.patient_id
    WHERE a.doctor_id = p_doctor_id
      AND a.appointment_date = v_today
      AND a.status IN ('waiting', 'called', 'pending', 'confirmed')
      AND a.started_at IS NULL
      AND p.user_id IS NOT NULL
  LOOP
    PERFORM public._notify(
      r.uid,
      'emergency_shift',
      'ترحيل المواعيد',
      'تم ترحيل مواعيد العيادة لمدة ' || p_delay_minutes || ' دقيقة، نعتذر عن التأخير.',
      '/appointments',
      'shift:' || p_doctor_id::text || ':' || extract(epoch from now())::bigint::text,
      jsonb_build_object('priority', 'high', 'delay_minutes', p_delay_minutes)
    );
  END LOOP;

  RETURN v_shifted;
END;
$$;

GRANT EXECUTE ON FUNCTION public.emergency_shift_queue(uuid, int) TO authenticated;
