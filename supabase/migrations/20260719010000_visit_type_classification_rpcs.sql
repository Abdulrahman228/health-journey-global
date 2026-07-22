-- ============================================================================
-- كشف / استشارة (first_visit / follow_up) classification for MOBILE.
--
-- The web already classifies via TanStack server functions (clinical.classification.ts)
-- which mobile cannot call. These two RPCs mirror that exact logic so both mobile
-- apps get identical behaviour, driven by the SAME columns the web/back-end use:
--   * doctor_details.followup_period_days  (15–60, default 30) — classification window
--   * doctor_followup_settings.followup_fee (>= 0, may be 0 = free) — follow-up price
--   * appointments.visit_type              ('first_visit' | 'follow_up' | ...)
--
-- Additive & safe: only NEW functions; no table/column/policy/web change.
-- ============================================================================

-- 1) Classify a freshly-booked appointment (call best-effort after booking).
--    first_visit (كشف) unless the patient has a COMPLETED visit with THIS doctor
--    within followup_period_days → follow_up (استشارة/متابعة). Mirrors syncVisitType.
CREATE OR REPLACE FUNCTION public.classify_appointment_visit_type(p_appointment_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_doctor_id     uuid;
  v_patient_id    uuid;
  v_scheduled_at  timestamptz;
  v_caller_pid    uuid;
  v_days          integer;
  v_doctor_pid    uuid;
  v_last          timestamptz;
  v_visit_type    text := 'first_visit';
  v_doctor_user   uuid;
BEGIN
  SELECT a.doctor_id, a.patient_id, a.scheduled_at
    INTO v_doctor_id, v_patient_id, v_scheduled_at
  FROM public.appointments a WHERE a.id = p_appointment_id;
  IF v_doctor_id IS NULL THEN
    RAISE EXCEPTION 'appointment_not_found';
  END IF;

  -- Caller must be the patient on this appointment.
  SELECT p.id INTO v_caller_pid FROM public.profiles p WHERE p.user_id = auth.uid();
  IF v_caller_pid IS NULL OR v_caller_pid <> v_patient_id THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  SELECT COALESCE(dd.followup_period_days, 30), dd.profile_id
    INTO v_days, v_doctor_pid
  FROM public.doctor_details dd WHERE dd.id = v_doctor_id;
  IF v_days IS NULL THEN v_days := 30; END IF;

  -- Patient's last COMPLETED visit with this doctor, excluding this one.
  SELECT a.scheduled_at INTO v_last
  FROM public.appointments a
  WHERE a.doctor_id = v_doctor_id
    AND a.patient_id = v_patient_id
    AND a.status = 'completed'
    AND a.id <> p_appointment_id
  ORDER BY a.scheduled_at DESC
  LIMIT 1;

  IF v_last IS NOT NULL
     AND EXTRACT(EPOCH FROM (v_scheduled_at - v_last)) / 86400.0 <= v_days THEN
    v_visit_type := 'follow_up';
  END IF;

  UPDATE public.appointments SET visit_type = v_visit_type WHERE id = p_appointment_id;

  -- Best-effort doctor notification on a follow-up (never fails the classification).
  IF v_visit_type = 'follow_up' AND v_doctor_pid IS NOT NULL THEN
    BEGIN
      SELECT p.user_id INTO v_doctor_user FROM public.profiles p WHERE p.id = v_doctor_pid;
      IF v_doctor_user IS NOT NULL THEN
        INSERT INTO public.notifications (user_id, kind, title, body, link, metadata)
        VALUES (
          v_doctor_user,
          'booking_classification',
          'تصنيف الحجز كاستشارة',
          'تنبيه: تم تصنيف الحجز كاستشارة بناءً على فترتك المحددة',
          '/dashboard',
          jsonb_build_object(
            'appointment_id', p_appointment_id,
            'visit_type', v_visit_type,
            'event_key', 'classify_' || p_appointment_id::text
          )
        );
      END IF;
    EXCEPTION WHEN OTHERS THEN
      NULL; -- duplicate / schema differences must not break classification
    END;
  END IF;

  RETURN v_visit_type;
END;
$$;

-- 2) Pre-booking preview: the visit type for the current patient + the doctor's
--    follow-up fee (NULL when the doctor set no follow-up price; 0 = free).
--    The app applies followup_fee for a follow_up, else its own per-clinic base fee.
CREATE OR REPLACE FUNCTION public.preview_visit_pricing(
  p_doctor_id uuid,
  p_scheduled_at timestamptz DEFAULT now()
)
RETURNS TABLE (visit_type text, followup_fee numeric)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller uuid;
  v_days   integer;
  v_last   timestamptz;
  v_vt     text := 'first_visit';
  v_fee    numeric := NULL;
BEGIN
  SELECT p.id INTO v_caller FROM public.profiles p WHERE p.user_id = auth.uid();

  SELECT COALESCE(dd.followup_period_days, 30) INTO v_days
  FROM public.doctor_details dd WHERE dd.id = p_doctor_id;
  IF v_days IS NULL THEN v_days := 30; END IF;

  IF v_caller IS NOT NULL THEN
    SELECT a.scheduled_at INTO v_last
    FROM public.appointments a
    WHERE a.doctor_id = p_doctor_id
      AND a.patient_id = v_caller
      AND a.status = 'completed'
    ORDER BY a.scheduled_at DESC
    LIMIT 1;

    IF v_last IS NOT NULL
       AND EXTRACT(EPOCH FROM (p_scheduled_at - v_last)) / 86400.0 <= v_days THEN
      v_vt := 'follow_up';
    END IF;
  END IF;

  IF v_vt = 'follow_up' THEN
    SELECT fs.followup_fee INTO v_fee
    FROM public.doctor_followup_settings fs
    WHERE fs.doctor_details_id = p_doctor_id;
  END IF;

  visit_type := v_vt;
  followup_fee := v_fee;
  RETURN NEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION public.classify_appointment_visit_type(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.preview_visit_pricing(uuid, timestamptz) TO authenticated;
