-- ============================================================================
-- Backfill: Auto-generate slugs for existing verified doctors with Latin names
-- ============================================================================
-- Run ONCE in Supabase SQL Editor AFTER the main migration
-- (20260530000100_public_profiles_qr.sql) has been applied.
--
-- This script only backfills doctors whose names are ASCII/Latin. Doctors
-- with Arabic-only names will be handled organically when they log in and
-- click "Suggest slug" in the dashboard (which uses our TypeScript
-- transliteration helper in src/lib/slug.ts).
-- ============================================================================

DO $$
DECLARE
  r RECORD;
  base_slug text;
  final_slug text;
BEGIN
  FOR r IN
    SELECT p.id, p.full_name, p.city
    FROM profiles p
    JOIN doctor_details d ON d.profile_id = p.id
    WHERE p.slug IS NULL
      AND d.is_verified = true
      AND p.full_name ~ '^[A-Za-z][A-Za-z0-9 .''-]*$'  -- ASCII only
  LOOP
    -- Build "dr-firstname-lastname-city" from ASCII name
    base_slug := 'dr-' ||
      regexp_replace(
        lower(regexp_replace(r.full_name, '^(Dr\.?|د\.?)\s*', '', 'i')),
        '[^a-z0-9]+', '-', 'g'
      );
    IF r.city IS NOT NULL AND r.city ~ '^[A-Za-z]' THEN
      base_slug := base_slug || '-' ||
        regexp_replace(lower(r.city), '[^a-z0-9]+', '-', 'g');
    END IF;
    -- Trim trailing hyphens
    base_slug := regexp_replace(base_slug, '-+$', '');
    base_slug := regexp_replace(base_slug, '^-+', '');

    -- Skip if shorter than 3 chars (invalid)
    CONTINUE WHEN length(base_slug) < 3;

    -- Resolve collisions via helper
    final_slug := public.suggest_unique_slug(base_slug);
    UPDATE profiles SET slug = final_slug WHERE id = r.id;
  END LOOP;
END $$;

-- Quick verification: how many got a slug?
SELECT
  count(*) FILTER (WHERE slug IS NOT NULL) AS with_slug,
  count(*) FILTER (WHERE slug IS NULL) AS without_slug,
  count(*) AS total_verified_doctors
FROM profiles p
JOIN doctor_details d ON d.profile_id = p.id
WHERE d.is_verified = true;
