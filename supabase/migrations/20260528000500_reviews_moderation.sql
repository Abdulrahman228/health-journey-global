-- ============================================================================
-- Reviews moderation (UGC quality control for SEO + safety)
-- Adds status column + audit fields. Existing rows are grandfathered to
-- 'approved' to avoid hiding history. New patient reviews default to
-- 'pending' so admins can vet content before it goes public.
-- ============================================================================

ALTER TABLE public.reviews
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'approved'
    CHECK (status IN ('pending','approved','rejected')),
  ADD COLUMN IF NOT EXISTS moderated_at timestamptz,
  ADD COLUMN IF NOT EXISTS moderated_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS moderation_notes text;

-- Grandfather existing rows to approved
UPDATE public.reviews SET status = 'approved' WHERE status IS NULL;

-- Going forward, new patient submissions should land in pending
ALTER TABLE public.reviews
  ALTER COLUMN status SET DEFAULT 'pending';

CREATE INDEX IF NOT EXISTS idx_reviews_status_doctor
  ON public.reviews (doctor_id, status, created_at DESC);

-- ============================================================================
-- RLS adjustments
-- Public should only see approved reviews. Admins see everything.
-- The original SELECT policy may already exist; we add a defensive one
-- scoped to approved status. Adjust if a wider policy exists.
-- ============================================================================

ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS reviews_public_read_approved ON public.reviews;
CREATE POLICY reviews_public_read_approved
  ON public.reviews FOR SELECT
  USING (status = 'approved' OR has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS reviews_admin_update ON public.reviews;
CREATE POLICY reviews_admin_update
  ON public.reviews FOR UPDATE
  USING (has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS reviews_owner_read ON public.reviews;
CREATE POLICY reviews_owner_read
  ON public.reviews FOR SELECT
  USING (
    patient_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid())
    OR doctor_id IN (
      SELECT dd.id FROM public.doctor_details dd
      JOIN public.profiles p ON p.id = dd.profile_id
      WHERE p.user_id = auth.uid()
    )
  );
