-- =====================================================================
-- P2: Reviews trust & verification
-- =====================================================================
-- Goals:
--   1. New columns on doctor_details: reviews_count.
--   2. CHECK rating BETWEEN 1 AND 5 (idempotent).
--   3. Partial UNIQUE on reviews(appointment_id) where appointment_id IS NOT NULL
--      (one review per appointment, but legacy NULL rows preserved).
--   4. Trigger _validate_review_eligibility BEFORE INSERT — if appointment_id is set,
--      verify appointment exists, completed, paid (or zero-fee), patient/doctor match.
--   5. Trigger _refresh_doctor_rating AFTER INSERT/UPDATE/DELETE — keeps
--      doctor_details.rating + reviews_count in sync (counts only approved).
--   6. Backfill existing approved reviews so doctor stats are accurate.
-- =====================================================================

-- 1) doctor_details.reviews_count column ------------------------------
ALTER TABLE public.doctor_details
  ADD COLUMN IF NOT EXISTS reviews_count INTEGER NOT NULL DEFAULT 0;

-- 2) reviews.rating CHECK ---------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.constraint_column_usage
    WHERE table_name = 'reviews' AND constraint_name = 'reviews_rating_check'
  ) THEN
    ALTER TABLE public.reviews
      ADD CONSTRAINT reviews_rating_check CHECK (rating BETWEEN 1 AND 5);
  END IF;
END$$;

-- 3) Partial UNIQUE index on appointment_id ---------------------------
CREATE UNIQUE INDEX IF NOT EXISTS reviews_appointment_id_unique
  ON public.reviews (appointment_id)
  WHERE appointment_id IS NOT NULL;

-- 4) Eligibility validation trigger -----------------------------------
CREATE OR REPLACE FUNCTION public._validate_review_eligibility()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_appt RECORD;
BEGIN
  -- Legacy rows without appointment_id are allowed (admin/seed only).
  IF NEW.appointment_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT id, patient_id, doctor_id, status, payment_status, fee
    INTO v_appt
    FROM public.appointments
   WHERE id = NEW.appointment_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'review.appointment_not_found'
      USING ERRCODE = 'P0002';
  END IF;

  IF v_appt.patient_id <> NEW.patient_id THEN
    RAISE EXCEPTION 'review.patient_mismatch'
      USING ERRCODE = 'P0001';
  END IF;

  IF v_appt.doctor_id <> NEW.doctor_id THEN
    RAISE EXCEPTION 'review.doctor_mismatch'
      USING ERRCODE = 'P0001';
  END IF;

  IF v_appt.status <> 'completed' THEN
    RAISE EXCEPTION 'review.appointment_not_completed'
      USING ERRCODE = 'P0001';
  END IF;

  -- Either paid (any non-pending non-failed) or fee = 0.
  IF NOT (
    COALESCE(v_appt.fee, 0) = 0
    OR v_appt.payment_status IN ('paid', 'refunded', 'partially_refunded')
  ) THEN
    RAISE EXCEPTION 'review.appointment_unpaid'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_review_eligibility ON public.reviews;
CREATE TRIGGER trg_validate_review_eligibility
BEFORE INSERT ON public.reviews
FOR EACH ROW
EXECUTE FUNCTION public._validate_review_eligibility();

-- 5) Aggregation refresh trigger --------------------------------------
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
             WHERE doctor_id = v_doctor_id AND status = 'approved'
          ), 0),
         reviews_count = COALESCE((
            SELECT COUNT(*)
              FROM public.reviews
             WHERE doctor_id = v_doctor_id AND status = 'approved'
          ), 0),
         updated_at = NOW()
   WHERE d.id = v_doctor_id;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_refresh_doctor_rating_aiud ON public.reviews;
CREATE TRIGGER trg_refresh_doctor_rating_aiud
AFTER INSERT OR UPDATE OR DELETE ON public.reviews
FOR EACH ROW
EXECUTE FUNCTION public._refresh_doctor_rating();

-- 6) Backfill: refresh aggregates for every doctor with reviews -------
DO $$
DECLARE
  d RECORD;
BEGIN
  FOR d IN SELECT DISTINCT doctor_id FROM public.reviews WHERE doctor_id IS NOT NULL LOOP
    UPDATE public.doctor_details
       SET rating = COALESCE((
              SELECT ROUND(AVG(rating)::numeric, 2)
                FROM public.reviews
               WHERE doctor_id = d.doctor_id AND status = 'approved'
            ), 0),
           reviews_count = COALESCE((
              SELECT COUNT(*)
                FROM public.reviews
               WHERE doctor_id = d.doctor_id AND status = 'approved'
            ), 0),
           updated_at = NOW()
     WHERE id = d.doctor_id;
  END LOOP;
END$$;

-- =====================================================================
