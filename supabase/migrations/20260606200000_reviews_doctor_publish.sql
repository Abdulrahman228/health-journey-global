-- =====================================================================
-- Reviews: doctor-curated public publishing
-- =====================================================================
-- Goal: give the doctor a second moderation gate on top of admin
-- approval. A review only appears on the public profile when:
--      status = 'approved'              (admin/auto safety gate)
--   AND is_published_by_doctor = true   (doctor curation gate)
--
-- Why: protects doctors from coordinated negative campaigns and lets
-- them choose which constructive feedback to surface publicly. Negative
-- but legitimate feedback stays visible to the doctor (private) so they
-- can act on it, but does not pollute their public profile or rating.
-- =====================================================================

ALTER TABLE public.reviews
  ADD COLUMN IF NOT EXISTS is_published_by_doctor BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS doctor_decided_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS doctor_response TEXT;

CREATE INDEX IF NOT EXISTS idx_reviews_doctor_published
  ON public.reviews (doctor_id, is_published_by_doctor, status, created_at DESC);

-- ---------------------------------------------------------------------
-- RLS: tighten public SELECT to require BOTH gates
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS reviews_public_read_approved ON public.reviews;
CREATE POLICY reviews_public_read_approved
  ON public.reviews FOR SELECT
  USING (
    (status = 'approved' AND is_published_by_doctor = TRUE)
    OR has_role(auth.uid(), 'admin')
  );

-- The legacy "Reviews viewable by everyone" policy (status-agnostic)
-- predates moderation; drop it to enforce the curated gate uniformly.
DROP POLICY IF EXISTS "Reviews viewable by everyone" ON public.reviews;

-- Owner read (patient + doctor sees their own) is preserved from the
-- prior moderation migration. Make sure it still exists in case the
-- earlier migration was rolled back.
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

-- ---------------------------------------------------------------------
-- RLS: doctor can UPDATE only the publish flag + response on their
-- own reviews. Admins keep full update via the existing policy.
-- ---------------------------------------------------------------------
DROP POLICY IF EXISTS reviews_doctor_update_publish ON public.reviews;
CREATE POLICY reviews_doctor_update_publish
  ON public.reviews FOR UPDATE
  USING (
    doctor_id IN (
      SELECT dd.id FROM public.doctor_details dd
      JOIN public.profiles p ON p.id = dd.profile_id
      WHERE p.user_id = auth.uid()
    )
  )
  WITH CHECK (
    doctor_id IN (
      SELECT dd.id FROM public.doctor_details dd
      JOIN public.profiles p ON p.id = dd.profile_id
      WHERE p.user_id = auth.uid()
    )
  );

-- Column-level guard: prevent doctor from tampering with rating,
-- comment, status, or moderation fields. Trigger short-circuits any
-- non-publish UPDATE attempted by the doctor (admins bypass).
CREATE OR REPLACE FUNCTION public._guard_review_doctor_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_admin BOOLEAN := has_role(auth.uid(), 'admin');
  v_is_doctor_owner BOOLEAN := EXISTS (
    SELECT 1
      FROM public.doctor_details dd
      JOIN public.profiles p ON p.id = dd.profile_id
     WHERE dd.id = OLD.doctor_id AND p.user_id = auth.uid()
  );
BEGIN
  IF v_is_admin THEN
    RETURN NEW;
  END IF;

  IF v_is_doctor_owner THEN
    -- Doctor may only flip publish + write a response. Everything else
    -- is restored to OLD value to prevent privilege escalation.
    NEW.rating              := OLD.rating;
    NEW.comment             := OLD.comment;
    NEW.status              := OLD.status;
    NEW.moderated_at        := OLD.moderated_at;
    NEW.moderated_by        := OLD.moderated_by;
    NEW.moderation_notes    := OLD.moderation_notes;
    NEW.patient_id          := OLD.patient_id;
    NEW.doctor_id           := OLD.doctor_id;
    NEW.appointment_id      := OLD.appointment_id;
    NEW.created_at          := OLD.created_at;

    IF NEW.is_published_by_doctor IS DISTINCT FROM OLD.is_published_by_doctor THEN
      NEW.doctor_decided_at := NOW();
    END IF;

    RETURN NEW;
  END IF;

  -- Patient owner update is also limited (covered by separate trigger
  -- in the original schema, but defensive here): cannot touch publish.
  NEW.is_published_by_doctor := OLD.is_published_by_doctor;
  NEW.doctor_response        := OLD.doctor_response;
  NEW.doctor_decided_at      := OLD.doctor_decided_at;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_review_doctor_update ON public.reviews;
CREATE TRIGGER trg_guard_review_doctor_update
BEFORE UPDATE ON public.reviews
FOR EACH ROW
EXECUTE FUNCTION public._guard_review_doctor_update();

-- ---------------------------------------------------------------------
-- Aggregation: count only PUBLISHED + approved reviews in
-- doctor_details.rating + reviews_count. Unpublished negative reviews
-- stay private to the doctor and do not drag down the public score.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._refresh_doctor_rating()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_doctor_id UUID;
BEGIN
  v_doctor_id := COALESCE(NEW.doctor_id, OLD.doctor_id);
  IF v_doctor_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  UPDATE public.doctor_details d
     SET rating = COALESCE((
            SELECT ROUND(AVG(rating)::numeric, 2)
              FROM public.reviews
             WHERE doctor_id = v_doctor_id
               AND status = 'approved'
               AND is_published_by_doctor = TRUE
          ), 0),
         reviews_count = COALESCE((
            SELECT COUNT(*)
              FROM public.reviews
             WHERE doctor_id = v_doctor_id
               AND status = 'approved'
               AND is_published_by_doctor = TRUE
          ), 0),
         updated_at = NOW()
   WHERE d.id = v_doctor_id;

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Backfill: existing approved reviews remain UNPUBLISHED by default
-- (doctor must opt-in). Re-run aggregation so public stats reset to
-- only-published counts.
DO $$
DECLARE
  d RECORD;
BEGIN
  FOR d IN SELECT DISTINCT doctor_id FROM public.reviews WHERE doctor_id IS NOT NULL LOOP
    UPDATE public.doctor_details
       SET rating = COALESCE((
              SELECT ROUND(AVG(rating)::numeric, 2)
                FROM public.reviews
               WHERE doctor_id = d.doctor_id
                 AND status = 'approved'
                 AND is_published_by_doctor = TRUE
            ), 0),
           reviews_count = COALESCE((
              SELECT COUNT(*)
                FROM public.reviews
               WHERE doctor_id = d.doctor_id
                 AND status = 'approved'
                 AND is_published_by_doctor = TRUE
            ), 0),
           updated_at = NOW()
     WHERE id = d.doctor_id;
  END LOOP;
END$$;
