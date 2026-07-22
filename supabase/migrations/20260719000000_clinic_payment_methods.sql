-- ============================================================================
-- Per-clinic accepted payment methods + per-appointment chosen method.
--
-- A patient, when booking, chooses HOW to pay: online (in-app) or at the clinic
-- (cash). Each CLINIC controls which methods it accepts. Additive & safe:
--   * clinics gets two booleans, both DEFAULT true → existing clinics keep
--     accepting both methods, so nothing changes for current data.
--   * appointments.payment_method is nullable (legacy rows = unspecified).
-- No existing column, policy, status, or the payment_status pipeline is touched.
-- The live online charge (Paymob/Fawry) is a separate, later step; this only
-- records the patient's choice + the clinic's allowed methods.
-- ============================================================================

-- 1) Per-clinic accepted payment methods.
ALTER TABLE public.clinics
  ADD COLUMN IF NOT EXISTS accepts_online_payment boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS accepts_clinic_payment boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.clinics.accepts_online_payment
  IS 'Clinic accepts in-app online payment for its bookings.';
COMMENT ON COLUMN public.clinics.accepts_clinic_payment
  IS 'Clinic accepts pay-at-clinic (cash) for its bookings.';

-- 2) The method the patient chose for a specific appointment.
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS payment_method text
    CHECK (payment_method IS NULL OR payment_method IN ('online','clinic'));

COMMENT ON COLUMN public.appointments.payment_method
  IS 'How the patient chose to pay: online (in-app) or clinic (cash). NULL = unspecified/legacy.';
