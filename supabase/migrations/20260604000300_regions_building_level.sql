-- ============================================================================
-- Phase 5 — Add 'building' level to regions hierarchy
--
-- The current regions tree is Country → Governorate → City → District (4
-- levels, max level=3). For doctors that operate inside large medical
-- complexes / hospitals (e.g. "Cleopatra Hospital", "King Faisal Specialist")
-- it's useful to add a 5th level so patients can pick the building directly.
--
-- Changes:
--   * Drop the old `type` CHECK constraint (text-based; can't ALTER in place)
--     and re-create it with the extra value.
--   * Drop the old `level BETWEEN 0 AND 3` CHECK and re-create it with 4.
--   * Index parent_id for performant building lookups.
-- ============================================================================

ALTER TABLE public.regions
  DROP CONSTRAINT IF EXISTS regions_type_check;
ALTER TABLE public.regions
  ADD CONSTRAINT regions_type_check
  CHECK (type IN ('country','governorate','city','district','building'));

ALTER TABLE public.regions
  DROP CONSTRAINT IF EXISTS regions_level_check;
ALTER TABLE public.regions
  ADD CONSTRAINT regions_level_check
  CHECK (level BETWEEN 0 AND 4);

-- Optional: add a building_id column on clinics so doctors can pin their
-- clinic to a specific building from the regions tree.
ALTER TABLE public.clinics
  ADD COLUMN IF NOT EXISTS building_id UUID
    REFERENCES public.regions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_clinics_building_id ON public.clinics(building_id);

COMMENT ON CONSTRAINT regions_type_check ON public.regions IS
  'country=0, governorate=1, city=2, district=3, building=4';
