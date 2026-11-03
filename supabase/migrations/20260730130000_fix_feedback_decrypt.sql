-- Fix private feedback showing "[encrypted — install read fn]".
--
-- Root cause: the decrypt RPCs run with SET search_path = public, pg_temp, but
-- pgp_sym_decrypt (pgcrypto) lives in the `extensions` schema on Supabase. With
-- `extensions` absent from the search_path the call errors, and the server
-- function falls back to the encrypted placeholder. (submit_private_feedback_admin
-- already sets `public, extensions`, which is why notes ENCRYPT and store fine.)
--
-- Fix: add `extensions` to the read functions' search_path so pgp_sym_decrypt
-- resolves. read_my_private_feedback_admin is recreated (also covers the case
-- where it was never installed); the auth.uid() variant is patched in place.

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
  created_at TIMESTAMPTZ
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
    f.created_at
  FROM public.doctor_private_feedback f
  WHERE f.doctor_details_id = p_doctor_details_id
  ORDER BY f.created_at DESC
  LIMIT GREATEST(1, LEAST(200, p_limit));
END
$$;

REVOKE ALL ON FUNCTION public.read_my_private_feedback_admin(UUID, INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.read_my_private_feedback_admin(UUID, INT) TO service_role;

-- Patch the auth.uid() variant's search_path too (no-op if not installed).
DO $$
BEGIN
  ALTER FUNCTION public.read_my_private_feedback(INT)
    SET search_path = public, extensions, pg_temp;
EXCEPTION WHEN undefined_function THEN
  NULL;
END$$;
