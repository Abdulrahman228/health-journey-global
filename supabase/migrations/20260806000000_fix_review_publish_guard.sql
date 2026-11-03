-- Fix: doctor "publish to profile" (and public response) silently reverts.
--
-- _guard_review_doctor_update() blocks a doctor from tampering with rating/
-- status/moderation via a direct client UPDATE. But the app publishes via a
-- server function using the service-role key, where auth.uid() is NULL — so the
-- trigger treated it as "not admin, not the owning doctor" and restored
-- is_published_by_doctor / doctor_response to their OLD values. The publish
-- looked successful but never persisted, so the review never appeared publicly.
--
-- Fix: let service-role / server-side writes (no JWT → auth.uid() IS NULL) pass
-- through unchanged — those callers already authorize themselves.

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
  -- Server functions run with the service-role key (no JWT). They enforce their
  -- own ownership checks, so let their writes through untouched.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  IF v_is_admin THEN
    RETURN NEW;
  END IF;

  IF v_is_doctor_owner THEN
    -- Doctor may only flip publish + write a response; restore everything else.
    NEW.rating           := OLD.rating;
    NEW.comment          := OLD.comment;
    NEW.status           := OLD.status;
    NEW.moderated_at     := OLD.moderated_at;
    NEW.moderated_by     := OLD.moderated_by;
    NEW.moderation_notes := OLD.moderation_notes;
    NEW.patient_id       := OLD.patient_id;
    NEW.doctor_id        := OLD.doctor_id;
    NEW.appointment_id   := OLD.appointment_id;
    NEW.created_at       := OLD.created_at;

    IF NEW.is_published_by_doctor IS DISTINCT FROM OLD.is_published_by_doctor THEN
      NEW.doctor_decided_at := NOW();
    END IF;

    RETURN NEW;
  END IF;

  -- Patient owner (or anyone else): cannot touch publish / response.
  NEW.is_published_by_doctor := OLD.is_published_by_doctor;
  NEW.doctor_response        := OLD.doctor_response;
  NEW.doctor_decided_at      := OLD.doctor_decided_at;
  RETURN NEW;
END;
$$;
