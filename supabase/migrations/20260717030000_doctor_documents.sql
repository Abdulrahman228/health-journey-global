-- ============================================================================
-- Doctor verification documents (syndicate card / specialty certificates).
-- The doctor uploads credential files for the platform admin to review and
-- verify the doctor. Files live in a PRIVATE bucket (sensitive); metadata +
-- review status live in public.doctor_documents.
-- ============================================================================

-- 1) Metadata table
CREATE TABLE IF NOT EXISTS public.doctor_documents (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id    uuid NOT NULL REFERENCES public.doctor_details(id) ON DELETE CASCADE,
  doc_type     text NOT NULL DEFAULT 'credential',
  file_name    text,
  storage_path text NOT NULL,
  status       text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_doctor_documents_doctor ON public.doctor_documents(doctor_id);

ALTER TABLE public.doctor_documents ENABLE ROW LEVEL SECURITY;

-- Owner (the doctor) + platform admins.
DROP POLICY IF EXISTS "Doctor reads own documents" ON public.doctor_documents;
CREATE POLICY "Doctor reads own documents"
  ON public.doctor_documents FOR SELECT
  USING (
    auth.uid() IN (
      SELECT p.user_id FROM public.profiles p
      JOIN public.doctor_details dd ON dd.profile_id = p.id
      WHERE dd.id = doctor_documents.doctor_id
    )
    OR auth.uid() IN (SELECT user_id FROM public.user_roles WHERE role IN ('admin', 'super_admin'))
  );

DROP POLICY IF EXISTS "Doctor inserts own documents" ON public.doctor_documents;
CREATE POLICY "Doctor inserts own documents"
  ON public.doctor_documents FOR INSERT
  WITH CHECK (
    auth.uid() IN (
      SELECT p.user_id FROM public.profiles p
      JOIN public.doctor_details dd ON dd.profile_id = p.id
      WHERE dd.id = doctor_documents.doctor_id
    )
  );

DROP POLICY IF EXISTS "Doctor deletes own documents" ON public.doctor_documents;
CREATE POLICY "Doctor deletes own documents"
  ON public.doctor_documents FOR DELETE
  USING (
    auth.uid() IN (
      SELECT p.user_id FROM public.profiles p
      JOIN public.doctor_details dd ON dd.profile_id = p.id
      WHERE dd.id = doctor_documents.doctor_id
    )
  );

DROP POLICY IF EXISTS "Admin updates document status" ON public.doctor_documents;
CREATE POLICY "Admin updates document status"
  ON public.doctor_documents FOR UPDATE
  USING (auth.uid() IN (SELECT user_id FROM public.user_roles WHERE role IN ('admin', 'super_admin')));

-- 2) Private storage bucket. Object paths are `{auth.uid()}/{uuid}.{ext}`.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'doctor-documents',
  'doctor-documents',
  false,
  10485760, -- 10 MB
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf']
)
ON CONFLICT (id) DO UPDATE
  SET public = EXCLUDED.public,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Doctor uploads own documents" ON storage.objects;
CREATE POLICY "Doctor uploads own documents"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'doctor-documents'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "Doctor reads own documents storage" ON storage.objects;
CREATE POLICY "Doctor reads own documents storage"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'doctor-documents'
    AND (
      auth.uid()::text = (storage.foldername(name))[1]
      OR auth.uid() IN (SELECT user_id FROM public.user_roles WHERE role IN ('admin', 'super_admin'))
    )
  );

DROP POLICY IF EXISTS "Doctor deletes own documents storage" ON storage.objects;
CREATE POLICY "Doctor deletes own documents storage"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'doctor-documents'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );
