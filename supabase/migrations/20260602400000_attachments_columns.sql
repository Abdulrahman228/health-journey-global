-- Add missing columns to medical_attachments to support attachments UI.
ALTER TABLE public.medical_attachments
  ADD COLUMN IF NOT EXISTS file_size  BIGINT,
  ADD COLUMN IF NOT EXISTS mime_type  TEXT,
  ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();

-- Backfill created_at from uploaded_at where missing.
UPDATE public.medical_attachments
SET created_at = uploaded_at
WHERE created_at IS NULL OR created_at = '1970-01-01'::timestamptz;
