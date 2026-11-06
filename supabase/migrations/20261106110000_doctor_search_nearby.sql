-- ============================================================================
-- 2026-11-06 — "Near me" doctor search fixes (search_doctors_nearby)
--
-- 1) Specialty match was an exact string compare (dd.specialty = p_specialty),
--    but doctor_details.specialty is free text: sign-up stores "General", doctors
--    type "طب عام" / "General Practice", the page sends a slug or Arabic name.
--    Now any name of the chosen specialty matches (name_ar, name_en, slug —
--    case/space-insensitive). The slug "general" also covers the "General"
--    placeholder.
-- 2) Verified doctors only — the same rule as the doctors list, specialty pages
--    and both mobile apps (it returned unverified sign-ups with a verified badge).
--    Also returns is_verified + reviews_count so the page shows the badge and the
--    rating only when they are true.
--
-- The return type changes, so the function is dropped and re-created; grants
-- are restored to the same roles as before (anon, authenticated).
-- Safe to re-run.
-- ============================================================================

DROP FUNCTION IF EXISTS public.search_doctors_nearby(
  DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, TEXT
);

CREATE FUNCTION public.search_doctors_nearby(
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
  reviews_count    INTEGER,
  is_verified      BOOLEAN,
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
  WITH wanted AS (
    -- Every accepted spelling of the requested specialty (empty when no filter).
    SELECT lower(btrim(v)) AS v
      FROM public.specialties s
     CROSS JOIN LATERAL unnest(ARRAY[s.name_ar, s.name_en, s.slug]) AS v
     WHERE p_specialty IS NOT NULL
       AND lower(btrim(p_specialty)) IN (lower(btrim(s.name_ar)), lower(btrim(s.name_en)), lower(btrim(s.slug)))
    UNION
    SELECT lower(btrim(p_specialty)) WHERE p_specialty IS NOT NULL
  ),
  bounded AS (
    -- Cheap bounding-box pre-filter: 1° lat ≈ 111 km
    SELECT c.id AS clinic_id, c.doctor_id, c.name AS clinic_name, c.lat, c.lng, c.city
      FROM public.clinics c
     WHERE c.lat IS NOT NULL
       AND c.lng IS NOT NULL
       AND c.lat BETWEEN p_lat - (p_radius_km / 111.0) AND p_lat + (p_radius_km / 111.0)
       AND c.lng BETWEEN p_lng - (p_radius_km / (111.0 * COS(RADIANS(p_lat))))
                     AND p_lng + (p_radius_km / (111.0 * COS(RADIANS(p_lat))))
  ),
  scored AS (
    SELECT b.*,
           -- Haversine in km, R = 6371
           2 * 6371 * ASIN(SQRT(
             POWER(SIN(RADIANS((b.lat - p_lat) / 2)), 2) +
             COS(RADIANS(p_lat)) * COS(RADIANS(b.lat)) *
             POWER(SIN(RADIANS((b.lng - p_lng) / 2)), 2)
           )) AS distance_km
      FROM bounded b
  )
  SELECT dd.id              AS doctor_id,
         p.full_name,
         dd.specialty,
         dd.consultation_fee,
         dd.rating,
         dd.reviews_count,
         COALESCE(dd.is_verified, false) AS is_verified,
         s.clinic_id,
         s.clinic_name,
         s.lat              AS clinic_lat,
         s.lng              AS clinic_lng,
         s.city,
         s.distance_km
    FROM scored s
    JOIN public.doctor_details dd ON dd.id = s.doctor_id
    JOIN public.profiles       p  ON p.id  = dd.profile_id
   WHERE s.distance_km <= p_radius_km
     AND COALESCE(dd.is_verified, false)
     AND (p_specialty IS NULL
          OR lower(btrim(coalesce(dd.specialty, ''))) IN (SELECT v FROM wanted))
   ORDER BY s.distance_km ASC
   LIMIT 200;
$$;

GRANT EXECUTE ON FUNCTION public.search_doctors_nearby(
  DOUBLE PRECISION, DOUBLE PRECISION, DOUBLE PRECISION, TEXT
) TO anon, authenticated;

COMMENT ON FUNCTION public.search_doctors_nearby IS
  'Verified doctors with clinics within p_radius_km of (p_lat,p_lng), optionally filtered by '
  'specialty (any of its name_ar / name_en / slug). Returns is_verified and '
  'reviews_count for display. Bounding box + Haversine, distance in km.';

NOTIFY pgrst, 'reload schema';
