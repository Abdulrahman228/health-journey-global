-- ============================================================================
-- Phase 1A — Hierarchical regions + Doctor credential documents
--
-- Goals:
--   1. Hierarchical address (Country → Governorate → City → District) so
--      patients can search by location accurately.
--   2. Per-clinic granular fields (street/building/unit/landmark) for the
--      detailed address shown only to confirmed-booking patients.
--   3. doctor_credentials table + private storage bucket so admins can verify
--      identity, syndicate, license, and degree documents before granting
--      the verified badge.
--
-- SEO/AEO impact (Rank Math course module 5 — YMYL signals):
--   * Verified credentials feed schema.org/Person `hasCredential` on
--     doctor pages → strong E-E-A-T signal for medical YMYL content.
--   * Hierarchical address feeds schema.org/PostalAddress with addressRegion,
--     addressLocality, postOfficeBoxNumber → boosts Google "near me" packs.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) regions tree
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.regions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_id   UUID NULL REFERENCES public.regions(id) ON DELETE CASCADE,
  type        TEXT NOT NULL CHECK (type IN ('country','governorate','city','district')),
  level       SMALLINT NOT NULL CHECK (level BETWEEN 0 AND 3),
  code        TEXT,                          -- ISO-3166-2 / local code
  name_ar     TEXT NOT NULL,
  name_en     TEXT NOT NULL,
  slug        TEXT NOT NULL,                 -- url-safe, unique within parent
  lat         DOUBLE PRECISION,
  lng         DOUBLE PRECISION,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_regions_parent ON public.regions(parent_id);
CREATE INDEX IF NOT EXISTS idx_regions_type   ON public.regions(type);
CREATE UNIQUE INDEX IF NOT EXISTS idx_regions_parent_slug
  ON public.regions(COALESCE(parent_id::text, ''), slug);

ALTER TABLE public.regions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "regions_public_read" ON public.regions;
CREATE POLICY "regions_public_read" ON public.regions
  FOR SELECT TO anon, authenticated
  USING (is_active = TRUE);

DROP POLICY IF EXISTS "regions_admin_write" ON public.regions;
CREATE POLICY "regions_admin_write" ON public.regions
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ----------------------------------------------------------------------------
-- 2) clinics: hierarchical FKs + granular fields
-- ----------------------------------------------------------------------------
ALTER TABLE public.clinics
  ADD COLUMN IF NOT EXISTS country_id      UUID REFERENCES public.regions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS governorate_id  UUID REFERENCES public.regions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS city_id         UUID REFERENCES public.regions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS district_id     UUID REFERENCES public.regions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS street          TEXT,
  ADD COLUMN IF NOT EXISTS building        TEXT,
  ADD COLUMN IF NOT EXISTS floor_unit      TEXT,
  ADD COLUMN IF NOT EXISTS landmark        TEXT;

CREATE INDEX IF NOT EXISTS idx_clinics_governorate_id ON public.clinics(governorate_id);
CREATE INDEX IF NOT EXISTS idx_clinics_city_id        ON public.clinics(city_id);
CREATE INDEX IF NOT EXISTS idx_clinics_district_id    ON public.clinics(district_id);

-- ----------------------------------------------------------------------------
-- 3) doctor_documents — verification document files
--    (Note: legacy table public.doctor_credentials stores license_number only)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.doctor_documents (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id       UUID NOT NULL REFERENCES public.doctor_details(id) ON DELETE CASCADE,
  document_type   TEXT NOT NULL CHECK (document_type IN (
    'national_id_front',
    'national_id_back',
    'syndicate_card',
    'medical_license',
    'degree_certificate',
    'specialty_certificate',
    'professional_photo',
    'liveness_selfie',
    'other'
  )),
  storage_path    TEXT NOT NULL,             -- doctor-credentials/{doctor_id}/{uuid}.ext
  file_name       TEXT,
  file_size       INTEGER,
  mime_type       TEXT,
  status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','approved','rejected','superseded')),
  rejection_reason TEXT,
  uploaded_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at     TIMESTAMPTZ,
  reviewed_by     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  notes_internal  TEXT
);

CREATE INDEX IF NOT EXISTS idx_doc_documents_doctor ON public.doctor_documents(doctor_id);
CREATE INDEX IF NOT EXISTS idx_doc_documents_status ON public.doctor_documents(status);

ALTER TABLE public.doctor_documents ENABLE ROW LEVEL SECURITY;

-- doctor reads/writes own
DROP POLICY IF EXISTS "doctor_documents_owner_read" ON public.doctor_documents;
CREATE POLICY "doctor_documents_owner_read" ON public.doctor_documents
  FOR SELECT TO authenticated
  USING (
    doctor_id IN (
      SELECT dd.id FROM public.doctor_details dd
      JOIN public.profiles p ON p.id = dd.profile_id
      WHERE p.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "doctor_documents_owner_insert" ON public.doctor_documents;
CREATE POLICY "doctor_documents_owner_insert" ON public.doctor_documents
  FOR INSERT TO authenticated
  WITH CHECK (
    doctor_id IN (
      SELECT dd.id FROM public.doctor_details dd
      JOIN public.profiles p ON p.id = dd.profile_id
      WHERE p.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "doctor_documents_owner_delete" ON public.doctor_documents;
CREATE POLICY "doctor_documents_owner_delete" ON public.doctor_documents
  FOR DELETE TO authenticated
  USING (
    status = 'pending' AND
    doctor_id IN (
      SELECT dd.id FROM public.doctor_details dd
      JOIN public.profiles p ON p.id = dd.profile_id
      WHERE p.user_id = auth.uid()
    )
  );

-- admin full access (uses helper from 20260601200000)
DROP POLICY IF EXISTS "doctor_documents_admin_all" ON public.doctor_documents;
CREATE POLICY "doctor_documents_admin_all" ON public.doctor_documents
  FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ----------------------------------------------------------------------------
-- 4) doctor_details: track overall verification level
-- ----------------------------------------------------------------------------
ALTER TABLE public.doctor_details
  ADD COLUMN IF NOT EXISTS verification_level SMALLINT NOT NULL DEFAULT 0
    CHECK (verification_level BETWEEN 0 AND 3),
  ADD COLUMN IF NOT EXISTS credentials_completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS credentials_review_started_at TIMESTAMPTZ;

COMMENT ON COLUMN public.doctor_details.verification_level IS
  '0=none, 1=docs uploaded, 2=verified by admin, 3=premium-verified (syndicate cross-check)';

-- ----------------------------------------------------------------------------
-- 5) Storage bucket — private, only doctor + admin
-- ----------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'doctor-credentials',
  'doctor-credentials',
  false,
  10485760, -- 10 MB
  ARRAY['image/jpeg','image/png','image/webp','image/heic','application/pdf']
)
ON CONFLICT (id) DO NOTHING;

-- File path: doctor-credentials/{doctor_details.id}/{uuid}.{ext}
-- The first folder MUST equal the doctor's doctor_details.id

DROP POLICY IF EXISTS "doctor_creds_upload_own" ON storage.objects;
CREATE POLICY "doctor_creds_upload_own"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'doctor-credentials'
    AND (storage.foldername(name))[1] IN (
      SELECT dd.id::text FROM public.doctor_details dd
      JOIN public.profiles p ON p.id = dd.profile_id
      WHERE p.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "doctor_creds_read_own" ON storage.objects;
CREATE POLICY "doctor_creds_read_own"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'doctor-credentials'
    AND (
      public.is_admin()
      OR (storage.foldername(name))[1] IN (
        SELECT dd.id::text FROM public.doctor_details dd
        JOIN public.profiles p ON p.id = dd.profile_id
        WHERE p.user_id = auth.uid()
      )
    )
  );

DROP POLICY IF EXISTS "doctor_creds_delete_own_or_admin" ON storage.objects;
CREATE POLICY "doctor_creds_delete_own_or_admin"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'doctor-credentials'
    AND (
      public.is_admin()
      OR (storage.foldername(name))[1] IN (
        SELECT dd.id::text FROM public.doctor_details dd
        JOIN public.profiles p ON p.id = dd.profile_id
        WHERE p.user_id = auth.uid()
      )
    )
  );
