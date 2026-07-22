-- ============================================================================
-- Per-clinic pricing: separate ONLINE fee from the IN-CLINIC fee.
--
-- clinics.consultation_fee already holds the in-clinic (physical visit) price,
-- per clinic. Add clinics.online_fee for the telemedicine price, also per clinic.
-- Nullable: when a clinic has no explicit online fee, callers fall back to
-- consultation_fee. This keeps online and in-clinic prices independent AND
-- per-clinic (not one flat price across all of a doctor's clinics).
-- ============================================================================
ALTER TABLE public.clinics
  ADD COLUMN IF NOT EXISTS online_fee numeric;

COMMENT ON COLUMN public.clinics.consultation_fee IS 'In-clinic (physical visit) fee for THIS clinic.';
COMMENT ON COLUMN public.clinics.online_fee        IS 'Online/telemedicine fee for THIS clinic (falls back to consultation_fee if null).';
