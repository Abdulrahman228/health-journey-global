-- =====================================================================
-- Appointments × Payments wiring
-- =====================================================================
-- Adds payment_intent_id + payment_status to appointments so the Stripe
-- webhook (`payment_intent.succeeded`) can confirm an appointment atomically.
-- Also ensures payments.appointment_id can link a payment to its appointment.
-- =====================================================================

-- 1) appointments: payment columns
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS payment_intent_id text,
  ADD COLUMN IF NOT EXISTS payment_status    text NOT NULL DEFAULT 'unpaid'
    CHECK (payment_status IN ('unpaid','paid','refunded','failed','partially_refunded')),
  ADD COLUMN IF NOT EXISTS paid_at           timestamptz,
  ADD COLUMN IF NOT EXISTS refunded_at       timestamptz,
  ADD COLUMN IF NOT EXISTS currency          text NOT NULL DEFAULT 'EGP',
  ADD COLUMN IF NOT EXISTS payment_environment text
    CHECK (payment_environment IN ('sandbox','live'));

CREATE UNIQUE INDEX IF NOT EXISTS uniq_appointments_payment_intent
  ON public.appointments(payment_intent_id)
  WHERE payment_intent_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_appointments_payment_status
  ON public.appointments(payment_status, scheduled_at);

-- 2) payments: optional appointment link (only if column missing)
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS appointment_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND table_name = 'payments'
      AND constraint_name = 'payments_appointment_id_fkey'
  ) THEN
    ALTER TABLE public.payments
      ADD CONSTRAINT payments_appointment_id_fkey
      FOREIGN KEY (appointment_id) REFERENCES public.appointments(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_payments_appointment
  ON public.payments(appointment_id) WHERE appointment_id IS NOT NULL;

COMMENT ON COLUMN public.appointments.payment_intent_id  IS 'Stripe PaymentIntent id (pi_…) — set when patient initiates checkout.';
COMMENT ON COLUMN public.appointments.payment_status      IS 'unpaid | paid | refunded | failed | partially_refunded — updated by Stripe webhook.';
COMMENT ON COLUMN public.appointments.payment_environment IS 'Which Stripe env handled the payment (sandbox | live).';
