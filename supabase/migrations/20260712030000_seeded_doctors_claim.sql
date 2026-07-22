-- ============================================================================
-- Growth · seeded (unclaimed) doctor directory + Claim Your Profile
--
-- Unclaimed doctors live HERE, deliberately NOT in doctor_details, so the
-- booking engine (book_queue_appointment / appointments) can never reach them
-- => Ghost Booking is structurally impossible. On claim they are promoted into
-- a real profile + doctor_details (see claimDoctorProfile server fn).
--
-- RLS is enabled with NO client policies: the table is readable only via the
-- SECURITY DEFINER directory RPC (which never exposes claim_token/PII beyond
-- what the public directory needs) and by the service role (server fns).
-- ============================================================================

CREATE TABLE public.scraped_doctors (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name           text NOT NULL,
  specialty           text,
  phone               text,                 -- E.164 business line
  address             text,
  city                text,
  governorate         text,
  lat                 double precision,
  lng                 double precision,
  external_rating     numeric,              -- e.g. Google rating; shown as external, never mixed with Tabibi ratings
  external_review_cnt integer,

  -- provenance (audit + takedown defensibility)
  source              text NOT NULL DEFAULT 'gmaps',   -- 'gmaps' | 'syndicate' | 'referral'
  source_ref          text,                            -- e.g. gmaps place_id — dedupe key

  -- lifecycle
  listing_status      text NOT NULL DEFAULT 'unclaimed'
    CHECK (listing_status IN ('unclaimed','contacted','claim_pending','claimed','suppressed')),
  is_claimed          boolean NOT NULL DEFAULT false,
  claimed_doctor_id   uuid REFERENCES public.doctor_details(id) ON DELETE SET NULL,
  claim_token         uuid NOT NULL DEFAULT gen_random_uuid(),   -- unguessable claim link
  claimed_at          timestamptz,

  -- PDPL compliance: honored opt-out. Never display or contact again.
  opted_out           boolean NOT NULL DEFAULT false,
  opted_out_at        timestamptz,

  imported_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source, source_ref)
);

CREATE INDEX idx_scraped_doctors_directory
  ON public.scraped_doctors (city, specialty)
  WHERE opted_out = false AND is_claimed = false;

-- Fast token lookup for the claim page.
CREATE UNIQUE INDEX idx_scraped_doctors_claim_token
  ON public.scraped_doctors (claim_token);

ALTER TABLE public.scraped_doctors ENABLE ROW LEVEL SECURITY;
-- No client policies on purpose: reads go through list_seeded_doctors() (below)
-- and the service-role claim server fn. Direct client access is denied.

-- ----------------------------------------------------------------------------
-- Outreach log (WhatsApp/SMS). Status, opt-out, dedupe, rate-limit. Locked to
-- the service role (the cron sender); no client access.
-- ----------------------------------------------------------------------------
CREATE TABLE public.doctor_outreach (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scraped_doctor_id   uuid NOT NULL REFERENCES public.scraped_doctors(id) ON DELETE CASCADE,
  channel             text NOT NULL DEFAULT 'whatsapp',
  template            text NOT NULL,
  status              text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued','sent','delivered','read','replied','failed','stopped')),
  provider_message_id text,
  attempt             integer NOT NULL DEFAULT 0,
  sent_at             timestamptz,
  error               text,
  created_at          timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_doctor_outreach_doctor ON public.doctor_outreach (scraped_doctor_id);
ALTER TABLE public.doctor_outreach ENABLE ROW LEVEL SECURITY;
-- No client policies: service role only.

-- ----------------------------------------------------------------------------
-- Provenance flags on the REAL table (how a doctor arrived / claim state).
-- ----------------------------------------------------------------------------
ALTER TABLE public.doctor_details
  ADD COLUMN IF NOT EXISTS source     text NOT NULL DEFAULT 'self_signup', -- 'self_signup'|'claimed_scrape'|'syndicate'
  ADD COLUMN IF NOT EXISTS is_claimed boolean NOT NULL DEFAULT true,       -- self-signups are claimed by definition
  ADD COLUMN IF NOT EXISTS claimed_at timestamptz;

-- ----------------------------------------------------------------------------
-- Public directory RPC: returns ONLY display columns for live, unclaimed,
-- non-opted-out seeded doctors. Never returns claim_token. SECURITY DEFINER so
-- it can read the RLS-locked table.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.list_seeded_doctors(p_limit integer DEFAULT 200)
RETURNS TABLE (
  id                  uuid,
  full_name           text,
  specialty           text,
  phone               text,
  address             text,
  city                text,
  governorate         text,
  external_rating     numeric,
  external_review_cnt integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    s.id, s.full_name, s.specialty, s.phone, s.address, s.city, s.governorate,
    s.external_rating, s.external_review_cnt
  FROM public.scraped_doctors s
  WHERE s.opted_out = false
    AND s.is_claimed = false
    AND s.listing_status IN ('unclaimed','contacted','claim_pending')
  ORDER BY s.external_rating DESC NULLS LAST, s.full_name
  LIMIT GREATEST(1, LEAST(p_limit, 500));
$$;

GRANT EXECUTE ON FUNCTION public.list_seeded_doctors(integer) TO anon, authenticated;
