-- Phase 5 fix: admin variant of submit_private_feedback
-- Reason: original submit_private_feedback uses auth.uid() which is NULL on
-- service-role calls. Server fn now passes the patient id explicitly.

CREATE OR REPLACE FUNCTION public.submit_private_feedback_admin(
  p_doctor_details_id UUID,
  p_patient_id        UUID,
  p_message           TEXT,
  p_rating            SMALLINT DEFAULT NULL,
  p_anonymous         BOOLEAN  DEFAULT FALSE
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_id  UUID;
  v_key TEXT;
BEGIN
  IF p_patient_id IS NULL THEN
    RAISE EXCEPTION 'patient_required';
  END IF;
  IF p_message IS NULL OR length(trim(p_message)) < 5 OR length(p_message) > 5000 THEN
    RAISE EXCEPTION 'message_invalid';
  END IF;
  IF p_rating IS NOT NULL AND (p_rating < 1 OR p_rating > 5) THEN
    RAISE EXCEPTION 'rating_invalid';
  END IF;

  v_key := public._feedback_key(p_doctor_details_id);

  INSERT INTO public.doctor_private_feedback (
    doctor_details_id,
    patient_profile_id,
    is_anonymous,
    ciphertext,
    rating
  ) VALUES (
    p_doctor_details_id,
    CASE WHEN p_anonymous THEN NULL ELSE p_patient_id END,
    p_anonymous,
    pgp_sym_encrypt(p_message, v_key),
    p_rating
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_private_feedback_admin(UUID, UUID, TEXT, SMALLINT, BOOLEAN) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.submit_private_feedback_admin(UUID, UUID, TEXT, SMALLINT, BOOLEAN) FROM anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.submit_private_feedback_admin(UUID, UUID, TEXT, SMALLINT, BOOLEAN) TO service_role;
