-- Private reply to a patient's private feedback (registered patients only).
--
-- The doctor can write ONE private reply per feedback note. It is delivered to
-- the patient as an in-app notification. Anonymous feedback cannot be replied to
-- (no patient to reach). All access stays behind SECURITY DEFINER functions.

ALTER TABLE public.doctor_private_feedback
  ADD COLUMN IF NOT EXISTS doctor_reply      text,
  ADD COLUMN IF NOT EXISTS doctor_replied_at timestamptz;

-- Recreate the decrypt reader to also surface the reply (and keep the fixed
-- search_path so pgp_sym_decrypt resolves from the extensions schema).
-- The return type gains two columns, so the old function must be dropped first
-- (Postgres forbids changing a function's return type via CREATE OR REPLACE).
DROP FUNCTION IF EXISTS public.read_my_private_feedback_admin(uuid, integer);
CREATE OR REPLACE FUNCTION public.read_my_private_feedback_admin(
  p_doctor_details_id UUID,
  p_limit INT DEFAULT 50
)
RETURNS TABLE (
  id UUID,
  is_anonymous BOOLEAN,
  patient_profile_id UUID,
  message TEXT,
  rating SMALLINT,
  created_at TIMESTAMPTZ,
  doctor_reply TEXT,
  doctor_replied_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_key TEXT := public._feedback_key(p_doctor_details_id);
BEGIN
  RETURN QUERY
  SELECT
    f.id,
    f.is_anonymous,
    f.patient_profile_id,
    pgp_sym_decrypt(f.ciphertext, v_key)::TEXT,
    f.rating,
    f.created_at,
    f.doctor_reply,
    f.doctor_replied_at
  FROM public.doctor_private_feedback f
  WHERE f.doctor_details_id = p_doctor_details_id
  ORDER BY f.created_at DESC
  LIMIT GREATEST(1, LEAST(200, p_limit));
END
$$;

REVOKE ALL ON FUNCTION public.read_my_private_feedback_admin(UUID, INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.read_my_private_feedback_admin(UUID, INT) TO service_role;

-- Save the reply + notify the patient. Ownership is re-checked here; the server
-- function must already have verified the caller owns p_doctor_details_id.
CREATE OR REPLACE FUNCTION public.reply_private_feedback_admin(
  p_feedback_id       UUID,
  p_doctor_details_id UUID,
  p_reply             TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_row   public.doctor_private_feedback;
  v_uid   UUID;
BEGIN
  SELECT * INTO v_row
    FROM public.doctor_private_feedback
   WHERE id = p_feedback_id AND doctor_details_id = p_doctor_details_id;

  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'feedback_not_found';
  END IF;
  IF v_row.is_anonymous OR v_row.patient_profile_id IS NULL THEN
    RAISE EXCEPTION 'cannot_reply_anonymous';
  END IF;
  IF length(coalesce(trim(p_reply), '')) < 1 THEN
    RAISE EXCEPTION 'empty_reply';
  END IF;

  UPDATE public.doctor_private_feedback
     SET doctor_reply = trim(p_reply), doctor_replied_at = now()
   WHERE id = p_feedback_id;

  -- Notify the (registered) patient, if their profile is linked to an account.
  SELECT user_id INTO v_uid FROM public.profiles WHERE id = v_row.patient_profile_id;
  IF v_uid IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, kind, title, body, link, metadata)
    VALUES (
      v_uid, 'feedback_reply', 'ردّ من طبيبك على ملاحظتك',
      left(trim(p_reply), 500), '/notifications',
      jsonb_build_object('feedback_id', p_feedback_id)
    );
  END IF;

  RETURN TRUE;
END
$$;

REVOKE ALL ON FUNCTION public.reply_private_feedback_admin(UUID, UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reply_private_feedback_admin(UUID, UUID, TEXT) TO service_role;
