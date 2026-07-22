-- ============================================================================
-- Patient "My Account" data model (mobile: Saved Addresses + Emergency Contact)
--
-- Keyed by auth uid (user_id) so RLS is a simple auth.uid() = user_id check and
-- both the Android (KMP) and iOS clients can read/write the signed-in user's own
-- rows with the anon key. Personal Data (name/phone/city) and Change Password
-- reuse existing surfaces (profiles / user_contacts / Supabase Auth), so no
-- tables are needed for those.
-- ============================================================================

CREATE TABLE public.patient_addresses (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  label        text NOT NULL DEFAULT 'home',   -- home | work | other
  address_line text NOT NULL,
  city         text,
  governorate  text,
  lat          double precision,
  lng          double precision,
  is_default   boolean NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.patient_addresses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own addresses"
  ON public.patient_addresses FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_patient_addresses_user ON public.patient_addresses (user_id);

CREATE TABLE public.emergency_contacts (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name         text NOT NULL,
  relationship text,                            -- spouse | parent | sibling | friend | other
  phone        text NOT NULL,
  is_primary   boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.emergency_contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own emergency contacts"
  ON public.emergency_contacts FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_emergency_contacts_user ON public.emergency_contacts (user_id);
