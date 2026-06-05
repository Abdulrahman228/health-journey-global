-- ============================================================================
-- Migration: Public profile pages (/d/{slug} + /u/{slug}) + QR short links
-- ============================================================================
-- Adds slug, visibility, view counter, and bio fields to profiles so each
-- user (doctor or patient) has a shareable public page.
--
-- Adds profile_short_links table for generating /q/{shortId} → /d/{slug}
-- (or /u/{slug}) redirects that can be encoded into QR codes and shared
-- on WhatsApp / SMS / printed marketing material.
--
-- Visibility levels:
--   public   — indexed by Google, listed in /doctors search (default for doctors)
--   unlisted — accessible only via direct link, NOT indexed (default for patients)
--   private  — login required (own profile only)
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Extend profiles table
-- ---------------------------------------------------------------------------
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS slug text UNIQUE,
  ADD COLUMN IF NOT EXISTS public_bio text,
  ADD COLUMN IF NOT EXISTS public_banner_url text,
  ADD COLUMN IF NOT EXISTS profile_visibility text NOT NULL DEFAULT 'unlisted'
    CHECK (profile_visibility IN ('public', 'unlisted', 'private')),
  ADD COLUMN IF NOT EXISTS profile_views_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS social_links jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- Patient medical card (V7) — each field is { value, public } so the owner
  -- can store data privately and opt in to showing specific fields on /u/{slug}.
  ADD COLUMN IF NOT EXISTS medical_card jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Validation: slug must be lowercase alphanumeric + hyphens, 3-80 chars.
-- Using CHECK constraint (added IF NOT EXISTS pattern via DO block).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profiles_slug_format_chk'
  ) THEN
    ALTER TABLE profiles
      ADD CONSTRAINT profiles_slug_format_chk
      CHECK (slug IS NULL OR slug ~ '^[a-z0-9][a-z0-9-]{1,79}$');
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_profiles_slug
  ON profiles(slug) WHERE slug IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_visibility
  ON profiles(profile_visibility);

-- ---------------------------------------------------------------------------
-- 2. RLS policy: allow public read of public + unlisted profiles
-- ---------------------------------------------------------------------------
-- (Unlisted profiles are not searchable but become readable if you know
-- the slug — this is the standard "secret-link" pattern used by GitHub
-- gists, Google Docs, etc.)
DROP POLICY IF EXISTS profiles_public_readable ON profiles;
CREATE POLICY profiles_public_readable ON profiles
  FOR SELECT
  USING (
    profile_visibility IN ('public', 'unlisted')
    OR auth.uid() = user_id
  );

-- ---------------------------------------------------------------------------
-- 3. Short-link table for QR codes
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS profile_short_links (
  short_id     text PRIMARY KEY,
  profile_id   uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  target_path  text NOT NULL,
    -- e.g. '/d/dr-ahmed-shatat-cairo' or '/u/mohamed-nour'
  label        text,
    -- optional human label set by owner (e.g. "Instagram bio", "WhatsApp")
  created_at   timestamptz NOT NULL DEFAULT now(),
  created_by   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  click_count  integer NOT NULL DEFAULT 0,
  last_clicked_at timestamptz,
  CONSTRAINT short_id_format_chk CHECK (short_id ~ '^[A-Za-z0-9]{4,12}$'),
  CONSTRAINT target_path_format_chk CHECK (target_path ~ '^/[a-z]/[a-z0-9-]+$')
);

CREATE INDEX IF NOT EXISTS idx_short_links_profile
  ON profile_short_links(profile_id);

ALTER TABLE profile_short_links ENABLE ROW LEVEL SECURITY;

-- Anyone may resolve a short link (needed for /q/{shortId} redirect).
DROP POLICY IF EXISTS short_links_public_read ON profile_short_links;
CREATE POLICY short_links_public_read ON profile_short_links
  FOR SELECT USING (true);

-- Only the profile owner may create short links pointing at their profile.
DROP POLICY IF EXISTS short_links_owner_insert ON profile_short_links;
CREATE POLICY short_links_owner_insert ON profile_short_links
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = profile_id AND p.user_id = auth.uid()
    )
  );

-- Only the owner may delete their short links.
DROP POLICY IF EXISTS short_links_owner_delete ON profile_short_links;
CREATE POLICY short_links_owner_delete ON profile_short_links
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM profiles p
      WHERE p.id = profile_id AND p.user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- 4. Atomic resolve-and-increment function
-- ---------------------------------------------------------------------------
-- Called by /q/{shortId} route. Returns target path or NULL.
-- SECURITY DEFINER so anon role can update the counter without table grants.
CREATE OR REPLACE FUNCTION public.touch_short_link(p_short_id text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_target text;
BEGIN
  UPDATE profile_short_links
  SET click_count = click_count + 1,
      last_clicked_at = now()
  WHERE short_id = p_short_id
  RETURNING target_path INTO v_target;
  RETURN v_target;
END;
$$;

GRANT EXECUTE ON FUNCTION public.touch_short_link(text) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. Profile view counter (analytics)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.touch_profile_view(p_slug text)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE profiles
  SET profile_views_count = profile_views_count + 1
  WHERE slug = p_slug
    AND profile_visibility IN ('public', 'unlisted');
$$;

GRANT EXECUTE ON FUNCTION public.touch_profile_view(text) TO anon, authenticated;

-- ---------------------------------------------------------------------------
-- 6. Helper: slug suggestion uniqueness check (idempotent collision suffix)
-- ---------------------------------------------------------------------------
-- Given a candidate base slug, return base or base-2/base-3/... if taken.
CREATE OR REPLACE FUNCTION public.suggest_unique_slug(p_base text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_candidate text := p_base;
  v_suffix integer := 1;
BEGIN
  WHILE EXISTS (SELECT 1 FROM profiles WHERE slug = v_candidate) LOOP
    v_suffix := v_suffix + 1;
    v_candidate := p_base || '-' || v_suffix::text;
  END LOOP;
  RETURN v_candidate;
END;
$$;

GRANT EXECUTE ON FUNCTION public.suggest_unique_slug(text) TO authenticated;

-- ---------------------------------------------------------------------------
-- 7. Make verified doctors public by default
-- ---------------------------------------------------------------------------
UPDATE profiles p
SET profile_visibility = 'public'
WHERE EXISTS (
  SELECT 1 FROM doctor_details d
  WHERE d.profile_id = p.id AND d.is_verified = true
)
AND p.profile_visibility = 'unlisted';

COMMENT ON COLUMN profiles.slug IS
  'Public URL slug. Doctors: dr-{name}-{city}. Patients: {name}. NULL until set.';
COMMENT ON COLUMN profiles.profile_visibility IS
  'public = Google-indexed + listed; unlisted = link-only; private = login-only.';
COMMENT ON TABLE profile_short_links IS
  'Short IDs encoded into QR codes; resolve at /q/{shortId} → target_path.';
