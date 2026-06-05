-- Online consultation request workflow (Phase 7)
-- Patient submits a request → doctor proposes time/fee → patient accepts (paid via Stripe) or rejects (no charge)

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'consultation_request_status') THEN
    CREATE TYPE consultation_request_status AS ENUM (
      'pending_doctor',
      'proposed',
      'accepted',
      'paid',
      'rejected_by_patient',
      'rejected_by_doctor',
      'expired',
      'cancelled'
    );
  END IF;
END$$;

CREATE TABLE IF NOT EXISTS public.consultation_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  doctor_details_id UUID NOT NULL REFERENCES public.doctor_details(id) ON DELETE CASCADE,

  -- Patient's input
  reason TEXT NOT NULL CHECK (length(reason) BETWEEN 5 AND 2000),
  preferred_dates JSONB,
  consultation_type TEXT NOT NULL DEFAULT 'video'
    CHECK (consultation_type IN ('video','voice','chat')),

  -- Doctor's proposal
  proposed_slot TIMESTAMPTZ,
  proposed_duration_minutes INT DEFAULT 30,
  doctor_note TEXT,
  fee_cents INT,
  currency TEXT NOT NULL DEFAULT 'EGP',

  -- Payment / outcome
  payment_intent_id TEXT,
  status consultation_request_status NOT NULL DEFAULT 'pending_doctor',
  appointment_id UUID REFERENCES public.appointments(id) ON DELETE SET NULL,
  patient_reject_note TEXT,
  doctor_reject_note TEXT,

  -- Lifecycle
  expires_at TIMESTAMPTZ,
  proposed_at TIMESTAMPTZ,
  responded_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_creq_patient ON public.consultation_requests(patient_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_creq_doctor ON public.consultation_requests(doctor_details_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_creq_status ON public.consultation_requests(status) WHERE status IN ('pending_doctor','proposed');

ALTER TABLE public.consultation_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS creq_patient_select ON public.consultation_requests;
CREATE POLICY creq_patient_select ON public.consultation_requests
  FOR SELECT USING (
    auth.uid() IN (SELECT user_id FROM public.profiles WHERE id = patient_id)
  );

DROP POLICY IF EXISTS creq_doctor_select ON public.consultation_requests;
CREATE POLICY creq_doctor_select ON public.consultation_requests
  FOR SELECT USING (
    auth.uid() IN (
      SELECT p.user_id FROM public.profiles p
      JOIN public.doctor_details dd ON dd.profile_id = p.id
      WHERE dd.id = doctor_details_id
    )
  );

DROP POLICY IF EXISTS creq_admin_all ON public.consultation_requests;
CREATE POLICY creq_admin_all ON public.consultation_requests
  FOR ALL USING (public.has_role(auth.uid(), 'admin'));

-- All writes go through server functions (service_role) — no insert/update RLS for end users.

CREATE OR REPLACE FUNCTION public.consultation_requests_touch_updated()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END$$;

DROP TRIGGER IF EXISTS trg_creq_touch ON public.consultation_requests;
CREATE TRIGGER trg_creq_touch BEFORE UPDATE ON public.consultation_requests
  FOR EACH ROW EXECUTE FUNCTION public.consultation_requests_touch_updated();

COMMENT ON TABLE public.consultation_requests IS 'Online consultation request workflow. Inserts/updates restricted to service_role via server functions.';
