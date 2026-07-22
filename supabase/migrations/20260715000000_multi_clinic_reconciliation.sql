-- ============================================================================
-- Multi-clinic reconciliation.
--
-- The `clinics` table (1-to-many) and `appointments.clinic_id` ALREADY exist and
-- the web already reads them. This migration does NOT recreate them. It:
--   1. adds a per-clinic `services` column (the one field that was missing),
--   2. backfills a primary clinic from the legacy doctor_details single-clinic
--      fields for any doctor who has no clinics row yet (so nobody loses their
--      location/fee when mobile switches to reading `clinics`),
--   3. guarantees exactly one primary clinic per doctor,
--   4. marks the legacy doctor_details clinic fields as deprecated.
-- ============================================================================

-- 1) Per-clinic services (for "view its specific services").
ALTER TABLE public.clinics
  ADD COLUMN IF NOT EXISTS services text[] NOT NULL DEFAULT '{}';

-- 2) Backfill legacy single-clinic data → a primary clinic, only where missing.
INSERT INTO public.clinics (doctor_id, name, address, city, consultation_fee, currency, is_primary)
SELECT
  dd.id,
  COALESCE(NULLIF(btrim(dd.clinic_name), ''), 'العيادة الرئيسية'),
  dd.clinic_address,
  p.city,
  dd.consultation_fee,
  COALESCE(dd.currency, 'EGP'),
  true
FROM public.doctor_details dd
JOIN public.profiles p ON p.id = dd.profile_id
WHERE NOT EXISTS (SELECT 1 FROM public.clinics c WHERE c.doctor_id = dd.id)
  AND (dd.clinic_name IS NOT NULL OR dd.clinic_address IS NOT NULL OR dd.consultation_fee IS NOT NULL);

-- 3) Guarantee one primary clinic per doctor (oldest, if none flagged).
WITH ranked AS (
  SELECT
    id,
    row_number() OVER (PARTITION BY doctor_id ORDER BY created_at) AS rn,
    bool_or(is_primary) OVER (PARTITION BY doctor_id) AS has_primary
  FROM public.clinics
)
UPDATE public.clinics c
SET is_primary = true
FROM ranked r
WHERE c.id = r.id AND r.rn = 1 AND r.has_primary IS NOT TRUE;

-- 4) Deprecate the legacy single-clinic fields (kept until mobile fully reads
--    clinics; drop in a later migration once old app builds age out).
COMMENT ON COLUMN public.doctor_details.clinic_name IS 'DEPRECATED → clinics.name (multi-clinic).';
COMMENT ON COLUMN public.doctor_details.clinic_address IS 'DEPRECATED → clinics.address.';
COMMENT ON COLUMN public.doctor_details.consultation_fee IS 'DEPRECATED → clinics.consultation_fee (per-clinic pricing).';
