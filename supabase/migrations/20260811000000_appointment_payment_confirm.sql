-- ============================================================================
-- Manual appointment-payment confirmation loop (Trust-but-Verify).
--
-- Closes the gap: after a patient transfers the fee (/pay), they upload the
-- receipt → admins are notified → an admin reviews + confirms → the appointment
-- flips to 'paid' and the patient is notified. Mirrors the Gold subscription
-- receipt flow, applied to appointments. Additive & safe.
-- ============================================================================

ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS payment_receipt_url text,
  ADD COLUMN IF NOT EXISTS payment_receipt_at  timestamptz;

CREATE INDEX IF NOT EXISTS idx_appointments_receipt_pending
  ON public.appointments (payment_receipt_at DESC)
  WHERE payment_receipt_url IS NOT NULL AND payment_status = 'unpaid';

-- 1) Patient submits a transfer receipt for their own appointment → notify admins.
CREATE OR REPLACE FUNCTION public.submit_appointment_receipt(
  p_appointment_id uuid, p_receipt_url text
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_patient uuid; v_admin RECORD;
BEGIN
  SELECT a.patient_id INTO v_patient FROM public.appointments a WHERE a.id = p_appointment_id;
  IF v_patient IS NULL THEN RAISE EXCEPTION 'not_found'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.id = v_patient AND p.user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'not_your_appointment';
  END IF;
  IF coalesce(trim(p_receipt_url), '') = '' THEN RAISE EXCEPTION 'receipt_required'; END IF;

  UPDATE public.appointments
     SET payment_receipt_url = p_receipt_url, payment_receipt_at = now()
   WHERE id = p_appointment_id;

  FOR v_admin IN
    SELECT ur.user_id FROM public.user_roles ur
     WHERE ur.role IN ('admin'::public.app_role, 'super_admin'::public.app_role)
  LOOP
    INSERT INTO public.notifications (user_id, kind, title, body, link)
    VALUES (v_admin.user_id, 'payment_review', 'إيصال دفع بانتظار المراجعة',
            'رفع مريض إيصال تحويل لموعد — راجِعه وأكِّد الدفع.',
            '/admin/appointment-payments');
  END LOOP;
END; $$;

GRANT EXECUTE ON FUNCTION public.submit_appointment_receipt(uuid, text) TO authenticated;

-- 2) Admin list of appointments awaiting payment review.
CREATE OR REPLACE FUNCTION public.list_appointment_payment_reviews()
RETURNS TABLE (
  id uuid, patient_name text, doctor_name text, fee numeric, currency text,
  scheduled_at timestamptz, appointment_type text, receipt_url text, receipt_at timestamptz
)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT a.id, pp.full_name, dp.full_name, a.fee, COALESCE(a.currency,'EGP'),
         a.scheduled_at, a.appointment_type, a.payment_receipt_url, a.payment_receipt_at
  FROM public.appointments a
  LEFT JOIN public.profiles pp ON pp.id = a.patient_id
  LEFT JOIN public.doctor_details dd ON dd.id = a.doctor_id
  LEFT JOIN public.profiles dp ON dp.id = dd.profile_id
  WHERE a.payment_receipt_url IS NOT NULL
    AND a.payment_status = 'unpaid'
    AND public.is_admin()
  ORDER BY a.payment_receipt_at DESC NULLS LAST
  LIMIT 200;
$$;

GRANT EXECUTE ON FUNCTION public.list_appointment_payment_reviews() TO authenticated;

-- 3) Admin confirms (or rejects) the payment → flip status + notify the patient.
CREATE OR REPLACE FUNCTION public.confirm_appointment_payment(
  p_appointment_id uuid, p_approve boolean
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_patient_user uuid;
BEGIN
  IF NOT public.is_admin() THEN RAISE EXCEPTION 'admin_only'; END IF;

  IF p_approve THEN
    UPDATE public.appointments SET payment_status = 'paid', paid_at = now()
     WHERE id = p_appointment_id AND payment_status <> 'paid';
  ELSE
    UPDATE public.appointments SET payment_status = 'failed'
     WHERE id = p_appointment_id;
  END IF;

  SELECT p.user_id INTO v_patient_user
    FROM public.appointments a JOIN public.profiles p ON p.id = a.patient_id
   WHERE a.id = p_appointment_id;

  IF v_patient_user IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, kind, title, body, link)
    VALUES (
      v_patient_user,
      CASE WHEN p_approve THEN 'payment_confirmed' ELSE 'payment_rejected' END,
      CASE WHEN p_approve THEN 'تم تأكيد دفع موعدك ✅' ELSE 'لم يُؤكَّد الدفع' END,
      CASE WHEN p_approve THEN 'تم استلام دفعتك وتأكيد موعدك.'
           ELSE 'تعذّر تأكيد الدفع — تواصل مع الدعم أو أعد رفع الإيصال.' END,
      '/appointments'
    );
  END IF;
END; $$;

GRANT EXECUTE ON FUNCTION public.confirm_appointment_payment(uuid, boolean) TO authenticated;
