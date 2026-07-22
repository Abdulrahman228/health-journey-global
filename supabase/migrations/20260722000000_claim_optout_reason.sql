-- ============================================================================
-- Claim page: capture WHY a seeded doctor declined (reject-with-reason).
-- Additive & safe: one nullable column on the existing scraped_doctors table.
-- opted_out / opted_out_at already exist from the seeded-directory migration.
-- ============================================================================
ALTER TABLE public.scraped_doctors
  ADD COLUMN IF NOT EXISTS opted_out_reason text;

COMMENT ON COLUMN public.scraped_doctors.opted_out_reason
  IS 'Why the doctor declined from the /claim page: not_me | not_interested | free text.';
