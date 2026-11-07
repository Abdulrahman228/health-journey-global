-- ============================================================================
-- 2026-11-07 — connect the notification joints.
--
-- §1 appointments → in-app notifications. The live trigger function was a
--    debug stub ("New appointment / Booking test", doctor only, INSERT only).
--    Now: Arabic, both parties, every status / payment transition. The two
--    triggers (trg_notify_appointment_ai / _au) already exist; only the
--    function body changes.
-- §2 notifications → push. send-push is deployed and both apps store
--    profiles.fcm_token, but nothing ever called the function. An AFTER INSERT
--    trigger now POSTs the row to send-push through pg_net, authenticated with
--    the Vault secret `push_webhook_secret` (apply_with_token.ps1 creates it and
--    sets the same value as PUSH_WEBHOOK_SECRET on the function). Without the
--    secret or a device token the trigger is a silent no-op.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- §1
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._notify_on_appointment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_doctor_user  uuid;
  v_patient_user uuid;
  v_doctor_name  text;
  v_patient_name text;
  v_when         text;
  v_with_doctor  text;
  v_patient_link text;
  v_doctor_link  text := '/dashboard/appointments';
  v_key          text;
BEGIN
  v_doctor_user  := public._user_id_from_doctor_details(NEW.doctor_id);
  v_patient_user := public._user_id_from_profile(NEW.patient_id);
  IF v_doctor_user IS NULL AND v_patient_user IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(NULLIF(btrim(p.full_name), ''), 'الطبيب') INTO v_doctor_name
    FROM public.doctor_details d
    JOIN public.profiles p ON p.id = d.profile_id
   WHERE d.id = NEW.doctor_id;
  SELECT COALESCE(NULLIF(btrim(full_name), ''), 'مريض') INTO v_patient_name
    FROM public.profiles WHERE id = NEW.patient_id;

  v_when := CASE
    WHEN NEW.scheduled_at IS NOT NULL THEN
      to_char(NEW.scheduled_at AT TIME ZONE COALESCE(public._clinic_tz(NEW.clinic_id), 'Africa/Cairo'),
              'YYYY-MM-DD HH24:MI')
    WHEN NEW.appointment_date IS NOT NULL THEN NEW.appointment_date::text
    ELSE ''
  END;
  IF NEW.queue_number IS NOT NULL THEN
    v_when := v_when || ' (رقم الدور ' || NEW.queue_number || ')';
  END IF;
  v_when := CASE WHEN v_when = '' THEN '' ELSE ' — ' || btrim(v_when) END;
  v_with_doctor  := 'موعدك مع د. ' || COALESCE(v_doctor_name, 'الطبيب');
  v_patient_link := CASE WHEN NEW.queue_number IS NOT NULL
                         THEN '/my-queue/' || NEW.id::text ELSE '/appointments' END;
  v_key := 'appt:' || NEW.id::text;

  IF TG_OP = 'INSERT' THEN
    PERFORM public._notify(v_doctor_user, 'appointment_booked', 'حجز جديد',
      v_patient_name || ' حجز موعدًا' || v_when, v_doctor_link, v_key || ':booked:doctor');
    PERFORM public._notify(v_patient_user, 'appointment_booked', 'تم استلام حجزك',
      v_with_doctor || v_when || '. سنخبرك بأي تحديث.', v_patient_link, v_key || ':booked:patient');
    RETURN NEW;
  END IF;

  IF OLD.status IS DISTINCT FROM NEW.status THEN
    IF NEW.status = 'confirmed' THEN
      PERFORM public._notify(v_patient_user, 'appointment_confirmed', 'تم تأكيد موعدك',
        v_with_doctor || v_when || '.', v_patient_link, v_key || ':confirmed');
    ELSIF NEW.status = 'in_progress' THEN
      PERFORM public._notify(v_patient_user, 'appointment_started', 'حان دورك الآن',
        'بدأ د. ' || v_doctor_name || ' زيارتك.', v_patient_link, v_key || ':started');
    ELSIF NEW.status = 'completed' THEN
      PERFORM public._notify(v_patient_user, 'appointment_completed', 'اكتملت زيارتك',
        'شكرًا لزيارتك د. ' || v_doctor_name || ' — يمكنك تقييم التجربة الآن.',
        '/appointments', v_key || ':completed');
    ELSIF NEW.status = 'cancelled' THEN
      PERFORM public._notify(v_patient_user, 'appointment_cancelled', 'تم إلغاء الموعد',
        'أُلغي ' || v_with_doctor || v_when || '.', '/appointments', v_key || ':cancelled:patient');
      PERFORM public._notify(v_doctor_user, 'appointment_cancelled', 'إلغاء حجز',
        'أُلغي حجز ' || v_patient_name || v_when || '.', v_doctor_link, v_key || ':cancelled:doctor');
    ELSIF NEW.status = 'no_show' THEN
      PERFORM public._notify(v_patient_user, 'appointment_no_show', 'لم يتم حضور الموعد',
        'سُجّل ' || v_with_doctor || v_when || ' كغياب. يمكنك الحجز مجددًا.',
        '/appointments', v_key || ':no_show');
    END IF;
  END IF;

  IF OLD.payment_status IS DISTINCT FROM NEW.payment_status AND NEW.payment_status = 'paid' THEN
    PERFORM public._notify(v_patient_user, 'payment_confirmed', 'تم تأكيد الدفع',
      'تم تأكيد دفع ' || v_with_doctor || v_when || '.', v_patient_link, v_key || ':paid:patient');
    PERFORM public._notify(v_doctor_user, 'payment_confirmed', 'تم استلام دفعة',
      'تم تأكيد دفع حجز ' || v_patient_name ||
      CASE WHEN NEW.fee IS NOT NULL THEN ' (' || NEW.fee::text || ' ج.م)' ELSE '' END || '.',
      v_doctor_link, v_key || ':paid:doctor');
  END IF;

  RETURN NEW;
END;
$$;

-- ----------------------------------------------------------------------------
-- §2
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._push_on_notification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_secret text;
  v_token  text;
BEGIN
  -- No registered device → nothing to push (the in-app list still shows it).
  SELECT fcm_token INTO v_token
    FROM public.profiles
   WHERE user_id = NEW.user_id AND fcm_token IS NOT NULL
   LIMIT 1;
  IF v_token IS NULL THEN RETURN NEW; END IF;

  SELECT decrypted_secret INTO v_secret
    FROM vault.decrypted_secrets WHERE name = 'push_webhook_secret' LIMIT 1;
  IF COALESCE(v_secret, '') = '' THEN RETURN NEW; END IF;  -- push not configured yet

  PERFORM net.http_post(
    url     := 'https://wqrrwvaxovrjjiilqkmt.supabase.co/functions/v1/send-push',
    headers := jsonb_build_object('Content-Type', 'application/json',
                                  'x-webhook-secret', v_secret),
    body    := jsonb_build_object('record', jsonb_build_object(
                 'user_id', NEW.user_id, 'title', NEW.title,
                 'body', NEW.body, 'link', NEW.link)),
    timeout_milliseconds := 8000
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Never let push delivery break the insert of the in-app notification.
  RAISE WARNING 'push enqueue failed for notification %: %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public._push_on_notification() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_push_on_notification ON public.notifications;
CREATE TRIGGER trg_push_on_notification
  AFTER INSERT ON public.notifications
  FOR EACH ROW EXECUTE FUNCTION public._push_on_notification();

NOTIFY pgrst, 'reload schema';
