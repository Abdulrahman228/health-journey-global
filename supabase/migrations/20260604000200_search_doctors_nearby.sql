-- ============================================================================
-- Phase 4 — Geo search RPC: search_doctors_nearby
--
-- Pure-PostgreSQL Haversine implementation (no PostGIS dependency required).
-- Returns doctors with at least one clinic within radius_km, optionally
-- filtered by specialty slug.
--
-- Why a single RPC: keeps client logic simple and lets us use the cheapest
-- bounding-box pre-filter (lat ± Δ, lng ± Δ) before computing the exact
-- great-circle distance.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.search_doctors_nearby(
  p_lat       DOUBLE PRECISION,
  p_lng       DOUBLE PRECISION,
  p_radius_km DOUBLE PRECISION DEFAULT 15,
  p_specialty TEXT             DEFAULT NULL
)
RETURNS TABLE (
  doctor_id        UUID,
  full_name        TEXT,
  specialty        TEXT,
  consultation_fee NUMERIC,
  rating           NUMERIC,
  clinic_id        UUID,
  clinic_name      TEXT,
  clinic_lat       DOUBLE PRECISION,
  clinic_lng       DOUBLE PRECISION,
  city             TEXT,
  distance_km      DOUBLE PRECISION
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH bounded AS (
    -- Cheap bounding-box pre-filter: 1° lat ≈ 111 km
    SELECT
      c.id            AS clinic_id,
      c.doctor_id,
      c.name          AS clinic_name,
      c.lat,
      c.lng,
      c.city
    FROM public.clinics c
    WHERE c.lat IS NOT NULL
      AND c.lng IS NOT NULL
      AND c.lat BETWEEN p_lat - (p_radius_km / 111.0)
                     AND p_lat + (p_radius_km / 111.0)
      AND c.lng BETWEEN p_lng - (p_radius_km / (111.0 * COS(RADIANS(p_lat))))
                     AND p_lng + (p_radius_km / (111.0 * COS(RADIANS(p_lat))))
  ),
  scored AS (
    SELECT
      b.*,
      -- Haversine in km, R=6371
      2 * 6371 * ASIN(
        SQRT(
          POWER(SIN(RADIANS((b.lat  - p_lat) / 2)), 2) +
          COS(RADIANS(p_lat)) * COS(RADIANS(b.lat)) *
          POWER(SIN(RADIANS((b.lng - p_lng) / 2)), 2)
        )
      ) AS distance_km
    FROM bounded b
  )
  SELECT
    dd.id                         AS doctor_id,
    p.full_name,
    dd.specialty,
    dd.consultation_fee,
    dd.rating,
    s.clinic_id,
    s.clinic_name,
    s.lat                         AS clinic_lat,
    s.lng                         AS clinic_lng,
    s.city,
    s.distance_km
  FROM scored s
  JOIN public.doctor_details dd ON dd.id = s.doctor_id
  JOIN public.profiles       p  ON p.id  = dd.profile_id
  WHERE s.distance_km <= p_radius_km
    AND (p_specialty IS NULL OR dd.specialty = p_specialty)
  ORDER BY s.distance_km ASC
  LIMIT 200;
$$;

GRANT EXECUTE ON FUNCTION public.search_doctors_nearby(
  DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, TEXT
) TO anon, authenticated;

COMMENT ON FUNCTION public.search_doctors_nearby IS
  'Returns doctors with clinics within p_radius_km of (p_lat,p_lng), '
  'optionally filtered by specialty slug. Uses bounding-box pre-filter '
  '+ Haversine. Distance in kilometers.';
