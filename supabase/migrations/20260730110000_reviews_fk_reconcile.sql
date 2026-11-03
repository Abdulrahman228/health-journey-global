-- Fix patient reviews not loading (doctor + admin curation pages hang).
--
-- Root cause: the `reviews` table was created with `patient_id`/`doctor_id` as
-- plain `uuid NOT NULL` columns with NO foreign keys, and no later migration
-- added them. But the app reads reviews with PostgREST embeds that reference FK
-- names explicitly:
--     patient:profiles!reviews_patient_id_fkey ( ... )
--     doctor:doctor_details!reviews_doctor_id_fkey ( ... )
-- With those constraints absent, PostgREST returns PGRST200 ("could not find a
-- relationship") and the query throws, so the page never finishes loading.
--
-- Fix: create the missing FKs with the exact names the embeds expect, and make
-- sure the moderation/curation columns the queries select all exist. Idempotent.

-- 1) Columns the doctor/admin queries select (no-ops if already present). -----
ALTER TABLE public.reviews
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS moderated_at timestamptz,
  ADD COLUMN IF NOT EXISTS moderated_by uuid,
  ADD COLUMN IF NOT EXISTS moderation_notes text,
  ADD COLUMN IF NOT EXISTS is_published_by_doctor boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS doctor_decided_at timestamptz,
  ADD COLUMN IF NOT EXISTS doctor_response text;

-- 2) The missing foreign keys — named exactly as the embeds reference them. ---
--    NOT VALID so creation never fails on any pre-existing orphan row; the FK
--    is still enforced for new rows and (crucially) detected by PostgREST.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'reviews_patient_id_fkey'
       AND conrelid = 'public.reviews'::regclass
  ) THEN
    ALTER TABLE public.reviews
      ADD CONSTRAINT reviews_patient_id_fkey
      FOREIGN KEY (patient_id) REFERENCES public.profiles(id) ON DELETE CASCADE
      NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'reviews_doctor_id_fkey'
       AND conrelid = 'public.reviews'::regclass
  ) THEN
    ALTER TABLE public.reviews
      ADD CONSTRAINT reviews_doctor_id_fkey
      FOREIGN KEY (doctor_id) REFERENCES public.doctor_details(id) ON DELETE CASCADE
      NOT VALID;
  END IF;
END$$;

-- Validate now that the constraints exist (safe if there are no orphans; if it
-- errors, the NOT VALID FK above is already enough for the embeds to resolve).
DO $$
BEGIN
  ALTER TABLE public.reviews VALIDATE CONSTRAINT reviews_patient_id_fkey;
  ALTER TABLE public.reviews VALIDATE CONSTRAINT reviews_doctor_id_fkey;
EXCEPTION WHEN others THEN
  RAISE NOTICE 'reviews FK validation skipped: %', SQLERRM;
END$$;

-- 3) Ask PostgREST to reload its schema cache so the new relationships are
--    picked up immediately (otherwise the embed may 404 until the next reload).
NOTIFY pgrst, 'reload schema';
