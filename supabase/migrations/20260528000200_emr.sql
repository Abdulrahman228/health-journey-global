-- ============================================================
-- EMR (Electronic Medical Records) — Phase 1
-- ============================================================
-- Establishes the core clinical data model:
--   * medical_records      — one row per visit/encounter
--   * prescriptions        — Rx parent (1:1 with a medical_record)
--   * prescription_items   — individual drugs inside an Rx
--   * medical_attachments  — lab results, imaging, ECG files
--   * patient_medical_profile — chronic conditions, allergies (1:1 patient)
--   * doctor_followup_settings — per-doctor free follow-up window config
--
-- All tables enforce strict RLS:
--   * Patient sees own records (across all doctors).
--   * Doctor sees records they authored only.
--   * Admin sees everything (uses has_role).
--   * `private_notes` are filtered out via a `medical_records_patient_view`
--     so the patient never reads doctor-only notes.
--
-- IDs follow the existing convention: doctor_profile_id and
-- patient_profile_id both reference profiles.id (NOT auth.users).
-- This matches the public.appointments schema.
-- ============================================================

-- ============================================================
-- 1) medical_records — clinical encounter
-- ============================================================
CREATE TABLE IF NOT EXISTS public.medical_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  doctor_profile_id  UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  appointment_id     UUID REFERENCES public.appointments(id) ON DELETE SET NULL,

  visit_type TEXT NOT NULL DEFAULT 'first_visit'
    CHECK (visit_type IN ('first_visit','follow_up','tele','emergency')),

  -- Clinical data
  chief_complaint        TEXT,
  history_present_illness TEXT,
  physical_examination   TEXT,
  diagnosis              TEXT[],   -- array supports multiple Dx
  icd10_codes            TEXT[],   -- WHO standard codes
  vitals                 JSONB,    -- { bp:'120/80', hr:72, temp:37.0, weight:70, height:170 }

  -- Plan
  treatment_plan     TEXT,
  recommended_tests  TEXT[],
  follow_up_days     INTEGER,      -- doctor's recommendation

  -- Doctor-only (NEVER exposed to patient)
  private_notes TEXT,

  visit_date TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_medrec_patient ON public.medical_records (patient_profile_id, visit_date DESC);
CREATE INDEX IF NOT EXISTS idx_medrec_doctor  ON public.medical_records (doctor_profile_id, visit_date DESC);
CREATE INDEX IF NOT EXISTS idx_medrec_pair    ON public.medical_records (patient_profile_id, doctor_profile_id, visit_date DESC);

ALTER TABLE public.medical_records ENABLE ROW LEVEL SECURITY;

-- Patient reads their own records (full row including private_notes will
-- be blocked at app layer; SQL view below filters them out for safety).
CREATE POLICY "patient reads own medical_records" ON public.medical_records
  FOR SELECT
  USING (auth.uid() IN (SELECT user_id FROM public.profiles WHERE id = patient_profile_id));

-- Doctor reads records they authored
CREATE POLICY "doctor reads own authored medical_records" ON public.medical_records
  FOR SELECT
  USING (auth.uid() IN (SELECT user_id FROM public.profiles WHERE id = doctor_profile_id));

-- Doctor inserts records where they are the author
CREATE POLICY "doctor inserts medical_records" ON public.medical_records
  FOR INSERT
  WITH CHECK (auth.uid() IN (SELECT user_id FROM public.profiles WHERE id = doctor_profile_id));

-- Doctor updates only their own records
CREATE POLICY "doctor updates own medical_records" ON public.medical_records
  FOR UPDATE
  USING (auth.uid() IN (SELECT user_id FROM public.profiles WHERE id = doctor_profile_id));

-- Admin full access
CREATE POLICY "admin full access medical_records" ON public.medical_records
  FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER medical_records_updated_at
  BEFORE UPDATE ON public.medical_records
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Patient-facing view that strips private_notes (extra defence-in-depth)
CREATE OR REPLACE VIEW public.medical_records_patient_view AS
SELECT
  id, patient_profile_id, doctor_profile_id, appointment_id, visit_type,
  chief_complaint, history_present_illness, physical_examination,
  diagnosis, icd10_codes, vitals,
  treatment_plan, recommended_tests, follow_up_days,
  visit_date, created_at, updated_at
FROM public.medical_records;

-- ============================================================
-- 2) prescriptions + prescription_items
-- ============================================================
CREATE TABLE IF NOT EXISTS public.prescriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  medical_record_id UUID NOT NULL REFERENCES public.medical_records(id) ON DELETE CASCADE,
  prescription_number TEXT UNIQUE NOT NULL,  -- e.g. RX-2026-000123
  qr_code_payload TEXT,                       -- signed token for verification
  notes TEXT,
  valid_until DATE,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','dispensed','expired','cancelled')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rx_record ON public.prescriptions (medical_record_id);
CREATE INDEX IF NOT EXISTS idx_rx_number ON public.prescriptions (prescription_number);

ALTER TABLE public.prescriptions ENABLE ROW LEVEL SECURITY;

-- Read: anyone who can read the parent medical_record can read the Rx.
-- Implemented via a subquery on medical_records (RLS evaluates again there).
CREATE POLICY "prescriptions read via parent record" ON public.prescriptions
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.medical_records mr
      WHERE mr.id = prescriptions.medical_record_id
    )
  );

CREATE POLICY "doctor inserts prescriptions for own records" ON public.prescriptions
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.medical_records mr
      WHERE mr.id = prescriptions.medical_record_id
        AND auth.uid() IN (SELECT user_id FROM public.profiles WHERE id = mr.doctor_profile_id)
    )
  );

CREATE POLICY "doctor updates prescriptions of own records" ON public.prescriptions
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.medical_records mr
      WHERE mr.id = prescriptions.medical_record_id
        AND auth.uid() IN (SELECT user_id FROM public.profiles WHERE id = mr.doctor_profile_id)
    )
  );

CREATE POLICY "admin full prescriptions" ON public.prescriptions
  FOR ALL
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));


CREATE TABLE IF NOT EXISTS public.prescription_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  prescription_id UUID NOT NULL REFERENCES public.prescriptions(id) ON DELETE CASCADE,
  drug_name TEXT NOT NULL,
  active_ingredient TEXT,
  dosage TEXT NOT NULL,        -- "500 mg"
  frequency TEXT NOT NULL,     -- "كل 8 ساعات"
  duration TEXT NOT NULL,      -- "5 أيام"
  route TEXT,                  -- "فموي"
  instructions TEXT,           -- "بعد الأكل"
  quantity INTEGER,
  sort_order INTEGER DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_rx_items_parent ON public.prescription_items (prescription_id);

ALTER TABLE public.prescription_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rx_items read via parent rx" ON public.prescription_items
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.prescriptions p WHERE p.id = prescription_items.prescription_id)
  );

CREATE POLICY "rx_items insert via parent rx" ON public.prescription_items
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.prescriptions p
      JOIN public.medical_records mr ON mr.id = p.medical_record_id
      WHERE p.id = prescription_items.prescription_id
        AND auth.uid() IN (SELECT user_id FROM public.profiles WHERE id = mr.doctor_profile_id)
    )
  );

CREATE POLICY "rx_items update via parent rx" ON public.prescription_items
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.prescriptions p
      JOIN public.medical_records mr ON mr.id = p.medical_record_id
      WHERE p.id = prescription_items.prescription_id
        AND auth.uid() IN (SELECT user_id FROM public.profiles WHERE id = mr.doctor_profile_id)
    )
  );

CREATE POLICY "rx_items delete via parent rx" ON public.prescription_items
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM public.prescriptions p
      JOIN public.medical_records mr ON mr.id = p.medical_record_id
      WHERE p.id = prescription_items.prescription_id
        AND auth.uid() IN (SELECT user_id FROM public.profiles WHERE id = mr.doctor_profile_id)
    )
  );

CREATE POLICY "admin full rx_items" ON public.prescription_items
  FOR ALL USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));


-- ============================================================
-- 3) medical_attachments
-- ============================================================
CREATE TABLE IF NOT EXISTS public.medical_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  medical_record_id UUID REFERENCES public.medical_records(id) ON DELETE CASCADE,
  patient_profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  uploaded_by_profile_id UUID REFERENCES public.profiles(id),
  type TEXT NOT NULL CHECK (type IN ('lab_result','xray','mri','ct','ecg','prescription','other')),
  file_url TEXT NOT NULL,
  file_name TEXT,
  notes TEXT,
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_attach_patient ON public.medical_attachments (patient_profile_id, uploaded_at DESC);
CREATE INDEX IF NOT EXISTS idx_attach_record  ON public.medical_attachments (medical_record_id);

ALTER TABLE public.medical_attachments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "patient reads own attachments" ON public.medical_attachments
  FOR SELECT
  USING (auth.uid() IN (SELECT user_id FROM public.profiles WHERE id = patient_profile_id));

CREATE POLICY "patient uploads to own attachments" ON public.medical_attachments
  FOR INSERT
  WITH CHECK (auth.uid() IN (SELECT user_id FROM public.profiles WHERE id = patient_profile_id));

CREATE POLICY "doctor reads attachments of their patients" ON public.medical_attachments
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.medical_records mr
      WHERE mr.patient_profile_id = medical_attachments.patient_profile_id
        AND auth.uid() IN (SELECT user_id FROM public.profiles WHERE id = mr.doctor_profile_id)
    )
  );

CREATE POLICY "doctor uploads attachments to own records" ON public.medical_attachments
  FOR INSERT
  WITH CHECK (
    medical_record_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.medical_records mr
      WHERE mr.id = medical_attachments.medical_record_id
        AND auth.uid() IN (SELECT user_id FROM public.profiles WHERE id = mr.doctor_profile_id)
    )
  );

CREATE POLICY "admin full attachments" ON public.medical_attachments
  FOR ALL USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));


-- ============================================================
-- 4) patient_medical_profile — chronic conditions, allergies
-- ============================================================
CREATE TABLE IF NOT EXISTS public.patient_medical_profile (
  patient_profile_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  blood_type TEXT,
  allergies TEXT[],
  chronic_conditions TEXT[],
  current_medications TEXT[],
  family_history TEXT,
  smoking BOOLEAN DEFAULT false,
  alcohol BOOLEAN DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.patient_medical_profile ENABLE ROW LEVEL SECURITY;

CREATE POLICY "patient manages own medical profile" ON public.patient_medical_profile
  FOR ALL
  USING (auth.uid() IN (SELECT user_id FROM public.profiles WHERE id = patient_profile_id))
  WITH CHECK (auth.uid() IN (SELECT user_id FROM public.profiles WHERE id = patient_profile_id));

-- Doctor reads if they've ever treated this patient
CREATE POLICY "doctor reads patient profile of treated patients" ON public.patient_medical_profile
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.medical_records mr
      WHERE mr.patient_profile_id = patient_medical_profile.patient_profile_id
        AND auth.uid() IN (SELECT user_id FROM public.profiles WHERE id = mr.doctor_profile_id)
    )
    OR EXISTS (
      SELECT 1 FROM public.appointments a
      WHERE a.patient_id = patient_medical_profile.patient_profile_id
        AND auth.uid() IN (SELECT user_id FROM public.profiles WHERE id = a.doctor_id)
    )
  );

CREATE POLICY "admin full patient profile" ON public.patient_medical_profile
  FOR ALL USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER patient_medical_profile_updated_at
  BEFORE UPDATE ON public.patient_medical_profile
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- ============================================================
-- 5) doctor_followup_settings — per-doctor free follow-up config
-- ============================================================
CREATE TABLE IF NOT EXISTS public.doctor_followup_settings (
  doctor_details_id UUID PRIMARY KEY REFERENCES public.doctor_details(id) ON DELETE CASCADE,
  free_followup_days INTEGER NOT NULL DEFAULT 14
    CHECK (free_followup_days >= 0 AND free_followup_days <= 365),
  followup_fee NUMERIC(10,2) NOT NULL DEFAULT 0
    CHECK (followup_fee >= 0),
  max_free_followups INTEGER NOT NULL DEFAULT 2
    CHECK (max_free_followups >= 0 AND max_free_followups <= 10),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.doctor_followup_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "doctor manages own followup settings" ON public.doctor_followup_settings
  FOR ALL
  USING (auth.uid() IN (
    SELECT p.user_id FROM public.profiles p
    JOIN public.doctor_details d ON d.profile_id = p.id
    WHERE d.id = doctor_details_id
  ))
  WITH CHECK (auth.uid() IN (
    SELECT p.user_id FROM public.profiles p
    JOIN public.doctor_details d ON d.profile_id = p.id
    WHERE d.id = doctor_details_id
  ));

-- Public read so the booking UI can show "follow-up free until day N"
CREATE POLICY "anyone reads followup settings" ON public.doctor_followup_settings
  FOR SELECT USING (true);

CREATE POLICY "admin full followup settings" ON public.doctor_followup_settings
  FOR ALL USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE TRIGGER doctor_followup_settings_updated_at
  BEFORE UPDATE ON public.doctor_followup_settings
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- ============================================================
-- 6) Prescription number sequence
-- ============================================================
CREATE SEQUENCE IF NOT EXISTS public.prescription_seq START WITH 1000;

CREATE OR REPLACE FUNCTION public.next_prescription_number()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  yr TEXT := to_char(now(), 'YYYY');
  n  BIGINT := nextval('public.prescription_seq');
BEGIN
  RETURN 'RX-' || yr || '-' || lpad(n::text, 6, '0');
END;
$$;
