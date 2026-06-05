-- Phase 5 helper: admin-callable decrypt (server function verifies ownership).
-- The base read_my_private_feedback() uses auth.uid(), but our TanStack server
-- functions run with the service-role client which has no JWT. This variant
-- takes doctor_details_id directly; the calling server fn MUST verify the
-- caller owns that doctor record before invoking.

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
SET search_path = public, pg_temp
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

-- Restrict: only service_role may call (server fn verifies ownership first).
REVOKE ALL ON FUNCTION public.read_my_private_feedback_admin(UUID, INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.read_my_private_feedback_admin(UUID, INT) TO service_role;
