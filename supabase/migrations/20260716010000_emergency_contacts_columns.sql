-- ============================================================================
-- emergency_contacts is missing columns on the deployed DB (same situation as
-- patient_addresses.label). The mobile writes name / relationship / phone, so
-- "column emergency_contacts.name does not exist" crashes the save. Add the
-- columns idempotently. Defaults keep any existing rows valid under NOT NULL.
-- ============================================================================
ALTER TABLE public.emergency_contacts ADD COLUMN IF NOT EXISTS name         text NOT NULL DEFAULT '';
ALTER TABLE public.emergency_contacts ADD COLUMN IF NOT EXISTS relationship text;
ALTER TABLE public.emergency_contacts ADD COLUMN IF NOT EXISTS phone        text NOT NULL DEFAULT '';
ALTER TABLE public.emergency_contacts ADD COLUMN IF NOT EXISTS is_primary   boolean NOT NULL DEFAULT true;
