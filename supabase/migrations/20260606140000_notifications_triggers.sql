-- =====================================================================
-- P3: Notifications event triggers
-- =====================================================================
-- Auto-creates rows in public.notifications when key events happen so
-- that users see updates in their NotificationBell.
--
-- Events handled:
--   * appointment_booked         (appointments INSERT)            -> doctor
--   * appointment_payment_paid   (appointments payment_status='paid')
--                                                                  -> patient
--   * appointment_completed      (appointments status='completed') -> patient
--   * appointment_cancelled      (appointments status='cancelled') -> both
--   * appointment_refunded       (appointments payment_status='refunded'
--                                  or 'partially_refunded')        -> patient
--   * review_submitted           (reviews INSERT)                  -> doctor
--   * review_approved            (reviews status='approved')       -> patient
--   * review_rejected            (reviews status='rejected')       -> patient
--
-- Idempotency: each notification carries metadata.event_key (UNIQUE per
-- (user_id, event_key)) so the same event can't notify twice even if
-- the row updates many times.
-- =====================================================================

-- 1) Partial UNIQUE on (user_id, event_key) ---------------------------
CREATE UNIQUE INDEX IF NOT EXISTS notifications_event_key_unique
  ON public.notifications (user_id, ((metadata ->> 'event_key')))
  WHERE metadata ? 'event_key';

-- 2) Helper: insert notification quietly ------------------------------
CREATE OR REPLACE FUNCTION public._notify(
  p_user_id  UUID,
  p_kind     TEXT,
  p_title    TEXT,
  p_body     TEXT,
  p_link     TEXT,
  p_event_key TEXT,
  p_extra    JSONB DEFAULT '{}'::jsonb
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_user_id IS NULL THEN RETURN; END IF;

  INSERT INTO public.notifications
    (user_id, kind, title, body, link, metadata)
  VALUES (
    p_user_id,
    p_kind,
    p_title,
    p_body,
    p_link,
    COALESCE(p_extra, '{}'::jsonb) || jsonb_build_object('event_key', p_event_key)
  )
  ON CONFLICT DO NOTHING;
END;
$$;

-- 3) Helpers: resolve user_id from profile.id / doctor_details.id -----
CREATE OR REPLACE FUNCTION public._user_id_from_profile(p_profile_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT user_id FROM public.profiles WHERE id = p_profile_id;
$$;

CREATE OR REPLACE FUNCTION public._user_id_from_doctor_details(p_doctor_id UUID)
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.user_id
    FROM public.doctor_details d
    JOIN public.profiles p ON p.id = d.profile_id
   WHERE d.id = p_doctor_id;
$$;

-- 4) Appointment trigger ----------------------------------------------
CREATE OR REPLACE FUNCTION public._notify_on_appointment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_doctor_user UUID;
  v_patient_user UUID;
BEGIN
  v_doctor_user := _user_id_from_doctor_details(NEW.doctor_id);
  v_patient_user := _user_id_from_profile(NEW.patient_id);

  -- INSERT: notify doctor of new booking
  IF TG_OP = 'INSERT' THEN
    PERFORM _notify(
      v_doctor_user,
      'appointment_booked',
      'New appointment',
      'A patient has booked an appointment with you.',
      '/appointments',
      'appt:' || NEW.id::text || ':booked'
    );
    RETURN NEW;
  END IF;

  -- UPDATE: only fire on state transitions
  IF TG_OP = 'UPDATE' THEN
    -- Payment paid
    IF (OLD.payment_status IS DISTINCT FROM NEW.payment_status)
       AND NEW.payment_status = 'paid' THEN
      PERFORM _notify(
        v_patient_user,
        'appointment_payment_paid',
        'Payment received',
        'We received your payment. Your appointment is confirmed.',
        '/receipt/' || NEW.id::text,
        'appt:' || NEW.id::text || ':paid'
      );
    END IF;

    -- Refunded / partially refunded
    IF (OLD.payment_status IS DISTINCT FROM NEW.payment_status)
       AND NEW.payment_status IN ('refunded', 'partially_refunded') THEN
      PERFORM _notify(
        v_patient_user,
        'appointment_refunded',
        'Refund processed',
        'A refund was processed for your appointment.',
        '/receipt/' || NEW.id::text,
        'appt:' || NEW.id::text || ':refunded'
      );
    END IF;

    -- Completed
    IF (OLD.status IS DISTINCT FROM NEW.status)
       AND NEW.status = 'completed' THEN
      PERFORM _notify(
        v_patient_user,
        'appointment_completed',
        'Visit completed',
        'Your appointment was marked as completed. You can leave a review now.',
        '/doctor/' || NEW.doctor_id::text,
        'appt:' || NEW.id::text || ':completed'
      );
    END IF;

    -- Cancelled
    IF (OLD.status IS DISTINCT FROM NEW.status)
       AND NEW.status = 'cancelled' THEN
      PERFORM _notify(
        v_patient_user,
        'appointment_cancelled',
        'Appointment cancelled',
        'Your appointment was cancelled.',
        '/appointments',
        'appt:' || NEW.id::text || ':cancelled'
      );
      PERFORM _notify(
        v_doctor_user,
        'appointment_cancelled',
        'Appointment cancelled',
        'A patient appointment was cancelled.',
        '/appointments',
        'appt:' || NEW.id::text || ':cancelled:doctor'
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_appointment_ai ON public.appointments;
CREATE TRIGGER trg_notify_appointment_ai
AFTER INSERT ON public.appointments
FOR EACH ROW
EXECUTE FUNCTION public._notify_on_appointment();

DROP TRIGGER IF EXISTS trg_notify_appointment_au ON public.appointments;
CREATE TRIGGER trg_notify_appointment_au
AFTER UPDATE ON public.appointments
FOR EACH ROW
EXECUTE FUNCTION public._notify_on_appointment();

-- 5) Review trigger ---------------------------------------------------
CREATE OR REPLACE FUNCTION public._notify_on_review()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_doctor_user UUID;
  v_patient_user UUID;
BEGIN
  v_doctor_user := _user_id_from_doctor_details(COALESCE(NEW.doctor_id, OLD.doctor_id));
  v_patient_user := _user_id_from_profile(COALESCE(NEW.patient_id, OLD.patient_id));

  IF TG_OP = 'INSERT' THEN
    -- Notify doctor of new pending review
    PERFORM _notify(
      v_doctor_user,
      'review_submitted',
      'New review',
      'A patient submitted a review. It will be visible once admin approves it.',
      '/dashboard/reviews',
      'review:' || NEW.id::text || ':submitted'
    );
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
    IF NEW.status = 'approved' THEN
      PERFORM _notify(
        v_patient_user,
        'review_approved',
        'Review published',
        'Your review has been approved and is now visible.',
        '/doctor/' || NEW.doctor_id::text,
        'review:' || NEW.id::text || ':approved'
      );
      PERFORM _notify(
        v_doctor_user,
        'review_approved',
        'Review approved',
        'A patient review on your profile is now visible.',
        '/dashboard/reviews',
        'review:' || NEW.id::text || ':approved:doctor'
      );
    ELSIF NEW.status = 'rejected' THEN
      PERFORM _notify(
        v_patient_user,
        'review_rejected',
        'Review not published',
        'Your review was not approved. You may submit a new one.',
        '/doctor/' || NEW.doctor_id::text,
        'review:' || NEW.id::text || ':rejected'
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_review_aiu ON public.reviews;
CREATE TRIGGER trg_notify_review_aiu
AFTER INSERT OR UPDATE ON public.reviews
FOR EACH ROW
EXECUTE FUNCTION public._notify_on_review();

-- =====================================================================
