-- ============================================================
-- Medical attachments storage bucket + RLS
--
-- The `medical_attachments` table already exists from the EMR migration.
-- This migration creates the storage bucket (private) and policies so
-- that patients/doctors can upload to & read from their own files.
--
-- File path convention:
--   medical-attachments/{patient_profile_id}/{record_id_or_inbox}/{uuid}.{ext}
-- The folder prefix (patient_profile_id) is enforced by RLS.
-- ============================================================

-- Create private bucket if missing
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'medical-attachments',
  'medical-attachments',
  false,
  20971520, -- 20 MB
  ARRAY[
    'image/jpeg','image/png','image/webp','image/heic',
    'application/pdf'
  ]
)
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- Storage policies
-- ============================================================

-- Patient may upload into their own folder
DROP POLICY IF EXISTS "patient_upload_own_attachment" ON storage.objects;
CREATE POLICY "patient_upload_own_attachment"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'medical-attachments'
    AND (storage.foldername(name))[1] IN (
      SELECT id::text FROM public.profiles WHERE user_id = auth.uid()
    )
  );

-- Doctor may upload attachments for a patient they have an appointment OR
-- medical record with
DROP POLICY IF EXISTS "doctor_upload_patient_attachment" ON storage.objects;
CREATE POLICY "doctor_upload_patient_attachment"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'medical-attachments'
    AND EXISTS (
      SELECT 1 FROM public.medical_records mr
      JOIN public.profiles dp ON dp.id = mr.doctor_profile_id
      WHERE dp.user_id = auth.uid()
        AND mr.patient_profile_id::text = (storage.foldername(name))[1]
    )
  );

-- Patient may read their own files
DROP POLICY IF EXISTS "patient_read_own_attachment" ON storage.objects;
CREATE POLICY "patient_read_own_attachment"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'medical-attachments'
    AND (storage.foldername(name))[1] IN (
      SELECT id::text FROM public.profiles WHERE user_id = auth.uid()
    )
  );

-- Doctor may read attachments belonging to a patient they treated
DROP POLICY IF EXISTS "doctor_read_patient_attachment" ON storage.objects;
CREATE POLICY "doctor_read_patient_attachment"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'medical-attachments'
    AND EXISTS (
      SELECT 1 FROM public.medical_records mr
      JOIN public.profiles dp ON dp.id = mr.doctor_profile_id
      WHERE dp.user_id = auth.uid()
        AND mr.patient_profile_id::text = (storage.foldername(name))[1]
    )
  );

-- Admin may read all (audit)
DROP POLICY IF EXISTS "admin_read_attachments" ON storage.objects;
CREATE POLICY "admin_read_attachments"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'medical-attachments'
    AND public.has_role(auth.uid(), 'admin')
  );

-- Patient may delete their own (revoke); admin may delete any
DROP POLICY IF EXISTS "patient_delete_own_attachment" ON storage.objects;
CREATE POLICY "patient_delete_own_attachment"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'medical-attachments'
    AND (
      (storage.foldername(name))[1] IN (
        SELECT id::text FROM public.profiles WHERE user_id = auth.uid()
      )
      OR public.has_role(auth.uid(), 'admin')
    )
  );
