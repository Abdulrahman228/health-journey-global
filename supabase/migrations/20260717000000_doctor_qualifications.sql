-- ============================================================================
-- Doctor profile: university qualifications / degrees (المؤهلات الجامعية).
-- Editable by the doctor from the Profile Edit screen (web + mobile). Free-text
-- so doctors can list degrees, board certifications, fellowships, etc.
-- ============================================================================
ALTER TABLE public.doctor_details
  ADD COLUMN IF NOT EXISTS qualifications text;

COMMENT ON COLUMN public.doctor_details.qualifications
  IS 'Doctor university degrees / board certifications (free text), shown on profile.';
