-- ============================================================================
-- Localize appointment notification text to Arabic.
--
-- Additive & safe: only CREATE OR REPLACE of the existing _notify_on_appointment
-- function — same triggers, same event_keys (so idempotency + existing rows are
-- untouched). Just swaps the English title/body strings for Arabic.
-- ============================================================================
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

  IF TG_OP = 'INSERT' THEN
    PERFORM _notify(
      v_doctor_user,
      'appointment_booked',
      'حجز جديد',
      'قام أحد المرضى بحجز موعد معك.',
      '/appointments',
      'appt:' || NEW.id::text || ':booked'
    );
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF (OLD.payment_status IS DISTINCT FROM NEW.payment_status)
       AND NEW.payment_status = 'paid' THEN
      PERFORM _notify(
        v_patient_user,
        'appointment_payment_paid',
        'تم استلام الدفع',
        'تم استلام دفعتك وتأكيد موعدك.',
        '/receipt/' || NEW.id::text,
        'appt:' || NEW.id::text || ':paid'
      );
    END IF;

    IF (OLD.payment_status IS DISTINCT FROM NEW.payment_status)
       AND NEW.payment_status IN ('refunded', 'partially_refunded') THEN
      PERFORM _notify(
        v_patient_user,
        'appointment_refunded',
        'تم استرداد المبلغ',
        'تم استرداد مبلغ موعدك.',
        '/receipt/' || NEW.id::text,
        'appt:' || NEW.id::text || ':refunded'
      );
    END IF;

    IF (OLD.status IS DISTINCT FROM NEW.status)
       AND NEW.status = 'completed' THEN
      PERFORM _notify(
        v_patient_user,
        'appointment_completed',
        'اكتمل الكشف',
        'تم إنهاء موعدك. يمكنك إضافة تقييم الآن.',
        '/doctor/' || NEW.doctor_id::text,
        'appt:' || NEW.id::text || ':completed'
      );
    END IF;

    IF (OLD.status IS DISTINCT FROM NEW.status)
       AND NEW.status = 'cancelled' THEN
      PERFORM _notify(
        v_patient_user,
        'appointment_cancelled',
        'تم إلغاء الموعد',
        'تم إلغاء موعدك.',
        '/appointments',
        'appt:' || NEW.id::text || ':cancelled'
      );
      PERFORM _notify(
        v_doctor_user,
        'appointment_cancelled',
        'تم إلغاء موعد',
        'تم إلغاء موعد أحد المرضى.',
        '/appointments',
        'appt:' || NEW.id::text || ':cancelled:doctor'
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
