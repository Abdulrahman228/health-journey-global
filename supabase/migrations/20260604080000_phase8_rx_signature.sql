-- ============================================================================
-- Phase 8 — Digital signature for prescriptions
--
-- Adds:
--   • doctor_details.signature_url, stamp_url for branded prescription PDFs
--   • verify_prescription(_id uuid) RPC for public /rx/{id} verification page
--     (returns doctor identity + RX contents but NO patient PHI beyond first
--     name initial — prescription QR codes are scanned by pharmacies/anyone)
-- ============================================================================

ALTER TABLE public.doctor_details
  ADD COLUMN IF NOT EXISTS signature_url TEXT,
  ADD COLUMN IF NOT EXISTS stamp_url     TEXT;

-- Public verification RPC. Anyone holding the URL can verify the Rx is real.
-- Returns minimal doctor info + meds list. Patient name is shown as initial
-- only ("أ.ف.م") for privacy — pharmacies typically check the patient ID
-- in person.
CREATE OR REPLACE FUNCTION public.verify_prescription(_id UUID)
RETURNS TABLE (
  prescription_id     UUID,
  prescription_number TEXT,
  status              TEXT,
  issued_at           TIMESTAMPTZ,
  valid_until         DATE,
  doctor_name         TEXT,
  doctor_specialty    TEXT,
  doctor_license      TEXT,
  doctor_signature    TEXT,
  doctor_stamp        TEXT,
  patient_initials    TEXT,
  notes               TEXT,
  items               JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.id,
    p.prescription_number,
    p.status,
    p.created_at,
    p.valid_until,
    dp.full_name,
    dd.specialty,
    dd.license_number,
    dd.signature_url,
    dd.stamp_url,
    -- Patient initials only.
    (
      SELECT string_agg(LEFT(part, 1) || '.', '')
      FROM unnest(string_to_array(COALESCE(pp.full_name, ''), ' ')) AS part
      WHERE part <> ''
    ),
    p.notes,
    COALESCE(
      (
        SELECT jsonb_agg(
          jsonb_build_object(
            'name', pi.drug_name,
            'active_ingredient', pi.active_ingredient,
            'dosage', pi.dosage,
            'frequency', pi.frequency,
            'duration', pi.duration,
            'route', pi.route,
            'quantity', pi.quantity,
            'instructions', pi.instructions
          ) ORDER BY COALESCE(pi.sort_order, 0), pi.id
        )
        FROM public.prescription_items pi
        WHERE pi.prescription_id = p.id
      ),
      '[]'::jsonb
    )
  FROM public.prescriptions p
  JOIN public.medical_records mr ON mr.id = p.medical_record_id
  JOIN public.profiles dp        ON dp.id = mr.doctor_profile_id
  JOIN public.doctor_details dd  ON dd.profile_id = dp.id
  JOIN public.profiles pp        ON pp.id = mr.patient_profile_id
  WHERE p.id = _id
    AND p.status IN ('active','dispensed','completed','expired');
END;
$$;

GRANT EXECUTE ON FUNCTION public.verify_prescription(UUID) TO anon, authenticated;

-- Storage bucket for doctor signatures & stamps (public-read since they appear
-- on the verification page).
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'doctor-assets',
  'doctor-assets',
  true,
  2097152,    -- 2 MB
  ARRAY['image/png','image/jpeg','image/webp']
)
ON CONFLICT (id) DO NOTHING;

-- Policy: doctor uploads to a folder named after their profile_id.
DROP POLICY IF EXISTS "doctor_assets_upload" ON storage.objects;
CREATE POLICY "doctor_assets_upload"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'doctor-assets'
    AND (storage.foldername(name))[1] IN (
      SELECT id::text FROM public.profiles WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "doctor_assets_update" ON storage.objects;
CREATE POLICY "doctor_assets_update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'doctor-assets'
    AND (storage.foldername(name))[1] IN (
      SELECT id::text FROM public.profiles WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "doctor_assets_delete" ON storage.objects;
CREATE POLICY "doctor_assets_delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'doctor-assets'
    AND (storage.foldername(name))[1] IN (
      SELECT id::text FROM public.profiles WHERE user_id = auth.uid()
    )
  );

-- Public read.
DROP POLICY IF EXISTS "doctor_assets_public_read" ON storage.objects;
CREATE POLICY "doctor_assets_public_read"
  ON storage.objects FOR SELECT TO anon, authenticated
  USING (bucket_id = 'doctor-assets');
