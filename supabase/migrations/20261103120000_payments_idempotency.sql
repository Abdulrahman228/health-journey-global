-- ============================================================================
-- Payments idempotency (2026-11-03): one row per provider transaction, so a
-- redelivered Paymob/Stripe webhook can never double-record a payment.
-- ============================================================================
CREATE UNIQUE INDEX IF NOT EXISTS payments_provider_payment_uq
  ON public.payments (provider, provider_payment_id)
  WHERE provider_payment_id IS NOT NULL;
