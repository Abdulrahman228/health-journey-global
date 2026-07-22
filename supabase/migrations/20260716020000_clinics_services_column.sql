-- ============================================================================
-- clinics.services is missing on the deployed DB. The column IS defined in
-- 20260715000000_multi_clinic_reconciliation.sql, but that migration was never
-- applied — so the clinics SELECT (which reads `services`) crashes with
-- "column clinics.services does not exist" when a doctor opens/adds a clinic.
-- Add it here idempotently so the app works regardless of migration order.
-- ============================================================================
ALTER TABLE public.clinics
  ADD COLUMN IF NOT EXISTS services text[] NOT NULL DEFAULT '{}';
