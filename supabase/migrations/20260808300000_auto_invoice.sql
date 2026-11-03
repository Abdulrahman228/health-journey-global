-- ============================================================================
-- RBAC Phase 3 — platform-branded electronic receipts (invoices).
--
-- The `invoices` table (ETA-ready) already exists but nothing ever populated
-- it. This adds automatic generation: whenever an appointment's payment_status
-- becomes 'paid', issue ONE invoice IN THE PLATFORM'S NAME (seller = Tabibi)
-- to the paying patient, visible to the patient (user_id) and the doctor
-- (doctor_profile_id) via the table's existing SELECT policies. The billing
-- page already lists invoices, so receipts appear with no UI change.
--
-- Lab fees are intentionally NOT invoiced here: the patient pays the lab
-- directly and the platform has no access to that money (see lab_orders).
--
-- SECURITY DEFINER because only service_role may INSERT into invoices per RLS.
-- ============================================================================

CREATE OR REPLACE FUNCTION public._invoice_on_appointment_paid()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_patient_user  uuid;
  v_patient_name  text;
  v_doctor_profile uuid;
BEGIN
  -- Only when transitioning INTO 'paid' (INSERT-as-paid or UPDATE to paid).
  IF NEW.payment_status <> 'paid' OR COALESCE(OLD.payment_status, '') = 'paid' THEN
    RETURN NEW;
  END IF;

  -- No receipt for zero-fee (free) consultations.
  IF COALESCE(NEW.fee, 0) <= 0 THEN
    RETURN NEW;
  END IF;

  -- Idempotent: never issue two invoices for the same appointment.
  IF EXISTS (SELECT 1 FROM public.invoices WHERE appointment_id = NEW.id) THEN
    RETURN NEW;
  END IF;

  SELECT p.user_id, p.full_name
    INTO v_patient_user, v_patient_name
    FROM public.profiles p WHERE p.id = NEW.patient_id;

  SELECT dd.profile_id
    INTO v_doctor_profile
    FROM public.doctor_details dd WHERE dd.id = NEW.doctor_id;

  -- Managed patient (no auth account) → attribute the receipt to the doctor's
  -- user so the row is valid (user_id is NOT NULL) and the doctor still sees it.
  IF v_patient_user IS NULL THEN
    SELECT p.user_id INTO v_patient_user
      FROM public.profiles p WHERE p.id = v_doctor_profile;
  END IF;
  IF v_patient_user IS NULL THEN
    RETURN NEW; -- cannot attribute an owner; skip rather than fail the payment
  END IF;

  INSERT INTO public.invoices (
    user_id, appointment_id, doctor_profile_id,
    amount_cents, net_cents, currency, status, environment,
    description, customer_name, seller_name,
    issued_at, paid_at
  ) VALUES (
    v_patient_user, NEW.id, v_doctor_profile,
    ROUND(COALESCE(NEW.fee, 0) * 100)::int,
    ROUND(COALESCE(NEW.fee, 0) * 100)::int,
    'EGP', 'paid', 'live',
    'كشف طبي عبر منصة طبيبي', v_patient_name, 'طبيبي Tabibi',
    now(), now()
  );

  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_invoice_on_appointment_paid ON public.appointments;
CREATE TRIGGER trg_invoice_on_appointment_paid
  AFTER INSERT OR UPDATE OF payment_status ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public._invoice_on_appointment_paid();

-- Backfill: issue receipts for already-paid appointments that have none.
INSERT INTO public.invoices (
  user_id, appointment_id, doctor_profile_id,
  amount_cents, net_cents, currency, status, environment,
  description, customer_name, seller_name, issued_at, paid_at
)
SELECT
  COALESCE(pp.user_id, dp.user_id),
  a.id, dd.profile_id,
  ROUND(COALESCE(a.fee, 0) * 100)::int,
  ROUND(COALESCE(a.fee, 0) * 100)::int,
  'EGP', 'paid', 'live',
  'كشف طبي عبر منصة طبيبي', pp.full_name, 'طبيبي Tabibi',
  now(), now()
FROM public.appointments a
JOIN public.doctor_details dd ON dd.id = a.doctor_id
LEFT JOIN public.profiles pp ON pp.id = a.patient_id
LEFT JOIN public.profiles dp ON dp.id = dd.profile_id
WHERE a.payment_status = 'paid'
  AND COALESCE(a.fee, 0) > 0
  AND COALESCE(pp.user_id, dp.user_id) IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.invoices i WHERE i.appointment_id = a.id);
