-- Auth-callable private-feedback RPCs so the MOBILE apps (which use the user's
-- JWT, not the service role) get the same private-notes feature as the web.
--
-- 1) submit_private_feedback (patient) — add `extensions` to search_path so
--    pgp_sym_encrypt resolves (it was public,pg_temp → encryption failed).
-- 2) read_my_private_feedback (doctor) — also return the doctor's reply.
-- 3) reply_private_feedback (doctor) — NEW auth variant (the existing reply is
--    service-role only); authorizes via auth.uid() → doctor_details ownership.

ALTER FUNCTION public.submit_private_feedback(uuid, text, smallint, boolean)
  SET search_path = public, extensions, pg_temp;

-- Return type gains two columns → must drop first.
DROP FUNCTION IF EXISTS public.read_my_private_feedback(int);
CREATE OR REPLACE FUNCTION public.read_my_private_feedback(p_limit INT DEFAULT 50)
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
  v_uid UUID := auth.uid();
  v_doctor_id UUID;
  v_key TEXT;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  SELECT dd.id INTO v_doctor_id FROM public.doctor_details dd WHERE dd.profile_id = v_uid;
  IF v_doctor_id IS NULL THEN
    RAISE EXCEPTION 'Doctor profile not found';
  END IF;
  v_key := public._feedback_key(v_doctor_id);

  RETURN QUERY
  SELECT
    f.id, f.is_anonymous, f.patient_profile_id,
    pgp_sym_decrypt(f.ciphertext, v_key)::TEXT,
    f.rating, f.created_at, f.doctor_reply, f.doctor_replied_at
  FROM public.doctor_private_feedback f
  WHERE f.doctor_details_id = v_doctor_id
  ORDER BY f.created_at DESC
  LIMIT GREATEST(1, LEAST(200, p_limit));
END
$$;
GRANT EXECUTE ON FUNCTION public.read_my_private_feedback(int) TO authenticated;

CREATE OR REPLACE FUNCTION public.reply_private_feedback(p_feedback_id UUID, p_reply TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_row public.doctor_private_feedback;
  v_uid UUID;
BEGIN
  SELECT f.* INTO v_row
    FROM public.doctor_private_feedback f
    JOIN public.doctor_details dd ON dd.id = f.doctor_details_id
   WHERE f.id = p_feedback_id AND dd.profile_id = auth.uid();
  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
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
GRANT EXECUTE ON FUNCTION public.reply_private_feedback(UUID, TEXT) TO authenticated;
