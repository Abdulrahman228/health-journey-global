-- Relax review eligibility: a patient may review after any COMPLETED visit,
-- regardless of payment status. Clinic visits are usually paid in cash (not
-- through the app), so the previous "must be paid" gate blocked most legitimate
-- reviews. The completed-visit gate stays, so reviews still reflect real visits.

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

  SELECT id, patient_id, doctor_id, status
    INTO v_appt
    FROM public.appointments
   WHERE id = NEW.appointment_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'review.appointment_not_found' USING ERRCODE = 'P0002';
  END IF;

  IF v_appt.patient_id <> NEW.patient_id THEN
    RAISE EXCEPTION 'review.patient_mismatch' USING ERRCODE = 'P0001';
  END IF;

  IF v_appt.doctor_id <> NEW.doctor_id THEN
    RAISE EXCEPTION 'review.doctor_mismatch' USING ERRCODE = 'P0001';
  END IF;

  IF v_appt.status <> 'completed' THEN
    RAISE EXCEPTION 'review.appointment_not_completed' USING ERRCODE = 'P0001';
  END IF;

  -- Payment is no longer required (cash/clinic visits are paid off-app).

  RETURN NEW;
END;
$$;

-- Trigger trg_validate_review_eligibility already references this function.
