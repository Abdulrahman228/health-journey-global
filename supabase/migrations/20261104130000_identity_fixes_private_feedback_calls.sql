-- ============================================================================
-- Identity fixes in the database (2026-11-04)
--
-- profiles.id is a random uuid; it equals auth.uid() only for the original seed
-- accounts. Found on the Android emulator with a newly registered doctor:
-- "ملاحظات المرضى الخاصة" failed with "Doctor profile not found".
-- Every place below compared profiles.id / profile_id with auth.uid():
--   * read_my_private_feedback   doctor could never read his private notes
--   * reply_private_feedback     doctor could never reply
--   * submit_private_feedback    stored the patient's AUTH id as patient_profile_id
--                                (reply notifications then found no profile)
--   * masked_call_sessions RLS   doctor / patient could not see their call sessions
-- All now resolve auth user -> profiles.user_id. Bodies are the live ones with
-- only the identity lines changed.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.read_my_private_feedback(p_limit integer DEFAULT 50)
 RETURNS TABLE(id uuid, is_anonymous boolean, patient_profile_id uuid, message text, rating smallint, created_at timestamp with time zone, doctor_reply text, doctor_replied_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
  v_uid UUID := auth.uid();
  v_doctor_id UUID;
  v_key TEXT;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  SELECT dd.id INTO v_doctor_id
    FROM public.doctor_details dd
    JOIN public.profiles p ON p.id = dd.profile_id
   WHERE p.user_id = v_uid
   LIMIT 1;
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
$function$;

CREATE OR REPLACE FUNCTION public.reply_private_feedback(p_feedback_id uuid, p_reply text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_row public.doctor_private_feedback;
  v_uid UUID;
BEGIN
  SELECT f.* INTO v_row
    FROM public.doctor_private_feedback f
    JOIN public.doctor_details dd ON dd.id = f.doctor_details_id
    JOIN public.profiles p ON p.id = dd.profile_id
   WHERE f.id = p_feedback_id AND p.user_id = auth.uid();
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

  -- patient_profile_id is a profiles.id (older rows stored the auth id, which
  -- equals profiles.id only for seed accounts) - accept either.
  SELECT user_id INTO v_uid FROM public.profiles
   WHERE id = v_row.patient_profile_id OR user_id = v_row.patient_profile_id
   LIMIT 1;
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
$function$;

CREATE OR REPLACE FUNCTION public.submit_private_feedback(p_doctor_details_id uuid, p_message text, p_rating smallint DEFAULT NULL::smallint, p_anonymous boolean DEFAULT false)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
DECLARE
  v_uid UUID := auth.uid();
  v_profile_id UUID;
  v_id UUID;
  v_key TEXT;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;
  IF p_message IS NULL OR length(trim(p_message)) < 5 THEN
    RAISE EXCEPTION 'Message too short';
  END IF;
  IF length(p_message) > 5000 THEN
    RAISE EXCEPTION 'Message too long (max 5000 chars)';
  END IF;
  SELECT id INTO v_profile_id FROM public.profiles WHERE user_id = v_uid LIMIT 1;

  v_key := public._feedback_key(p_doctor_details_id);

  INSERT INTO public.doctor_private_feedback
    (doctor_details_id, patient_profile_id, is_anonymous, ciphertext, rating)
  VALUES (
    p_doctor_details_id,
    CASE WHEN p_anonymous THEN NULL ELSE v_profile_id END,
    p_anonymous,
    pgp_sym_encrypt(p_message, v_key),
    p_rating
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END
$function$;

-- masked_call_sessions: resolve the caller through profiles.user_id
DROP POLICY IF EXISTS mcs_doctor_select ON public.masked_call_sessions;
CREATE POLICY mcs_doctor_select ON public.masked_call_sessions
  FOR SELECT TO authenticated
  USING (doctor_details_id IN (
    SELECT dd.id FROM public.doctor_details dd
      JOIN public.profiles p ON p.id = dd.profile_id
     WHERE p.user_id = auth.uid()
  ));

DROP POLICY IF EXISTS mcs_patient_select ON public.masked_call_sessions;
CREATE POLICY mcs_patient_select ON public.masked_call_sessions
  FOR SELECT TO authenticated
  USING (patient_profile_id IN (
    SELECT p.id FROM public.profiles p WHERE p.user_id = auth.uid()
  ));

NOTIFY pgrst, 'reload schema';
