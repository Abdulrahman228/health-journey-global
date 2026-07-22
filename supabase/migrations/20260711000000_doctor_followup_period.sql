-- ============================================================================
-- Customizable Follow-up Window
--
-- Per-doctor window that governs BOOKING-TYPE CLASSIFICATION: a new booking
-- within this many days of the patient's last completed visit with this doctor
-- is auto-classified as a follow-up "consultation" (vs "initial_checkup").
--
-- NOTE: this is distinct from doctor_followup_settings.free_followup_days, which
-- governs BILLING (whether a revisit is free/discounted). Classification here,
-- money there.
--
-- Default 30 days; UI-enforced range 15–60 (mirrored by the CHECK below).
-- Idempotent.
-- ============================================================================

ALTER TABLE public.doctor_details
  ADD COLUMN IF NOT EXISTS followup_period_days integer NOT NULL DEFAULT 30;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'doctor_details_followup_period_days_check'
  ) THEN
    ALTER TABLE public.doctor_details
      ADD CONSTRAINT doctor_details_followup_period_days_check
      CHECK (followup_period_days BETWEEN 15 AND 60);
  END IF;
END $$;
