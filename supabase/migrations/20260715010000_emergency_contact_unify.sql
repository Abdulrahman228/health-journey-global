-- ============================================================================
-- Unify emergency contact on the structured `emergency_contacts` table.
--
-- The legacy `patient_details.emergency_contact` is a single free-text field.
-- Move any existing values into `emergency_contacts` (used by mobile), then drop
-- the legacy column so all clients use one source of truth.
--
-- The legacy text is preserved in `phone` (an emergency contact is a number to
-- call) with a default `name`; both columns are NOT NULL on the target table.
-- ============================================================================

INSERT INTO public.emergency_contacts (user_id, name, phone)
SELECT p.user_id, 'جهة اتصال الطوارئ', btrim(pd.emergency_contact)
FROM public.patient_details pd
JOIN public.profiles p ON p.id = pd.profile_id
WHERE pd.emergency_contact IS NOT NULL
  AND btrim(pd.emergency_contact) <> ''
  AND NOT EXISTS (
    SELECT 1 FROM public.emergency_contacts ec WHERE ec.user_id = p.user_id
  );

ALTER TABLE public.patient_details DROP COLUMN IF EXISTS emergency_contact;
