-- Google Places verification for clinics (compliant onboarding).
--
-- A doctor confirms their OWN clinic against Google Maps during onboarding.
-- Per Google Maps Platform ToS, place_id is the only Places field we may store
-- permanently; google_maps_uri is a deep link (safe to store). The
-- address/lat/lng already on this table are the doctor's own confirmed clinic
-- data. We do NOT store harvested ratings/phone directories.

ALTER TABLE public.clinics
  ADD COLUMN IF NOT EXISTS google_place_id text,
  ADD COLUMN IF NOT EXISTS google_maps_uri text,
  ADD COLUMN IF NOT EXISTS place_verified boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS place_verified_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_clinics_google_place_id
  ON public.clinics (google_place_id)
  WHERE google_place_id IS NOT NULL;

COMMENT ON COLUMN public.clinics.google_place_id IS
  'Google Maps place_id of the doctor-confirmed clinic (only Places field storable long-term per ToS).';
COMMENT ON COLUMN public.clinics.place_verified IS
  'True once the doctor selected & confirmed this clinic from Google Maps during onboarding.';
