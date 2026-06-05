-- Phase 5 hardening: read encryption pepper from supabase_vault instead of
-- a hard-coded fallback or app.feedback_pepper GUC (which requires
-- superuser on Supabase managed Postgres).
--
-- The pepper is seeded once via:
--   SELECT vault.create_secret('<value>', 'feedback_pepper', '...');
-- and read here via vault.decrypted_secrets.
--
-- Existing ciphertext continues to decrypt as long as the underlying secret
-- value is unchanged.

CREATE OR REPLACE FUNCTION public._feedback_key(p_doctor_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public, extensions, vault
AS $$
DECLARE
  v_pepper TEXT;
BEGIN
  SELECT decrypted_secret INTO v_pepper
  FROM vault.decrypted_secrets
  WHERE name = 'feedback_pepper'
  LIMIT 1;

  IF v_pepper IS NULL OR length(v_pepper) < 16 THEN
    RAISE EXCEPTION 'feedback_pepper missing or too short (seed via vault.create_secret)';
  END IF;

  RETURN encode(
    extensions.digest(v_pepper || '::' || p_doctor_id::text, 'sha256'),
    'hex'
  );
END;
$$;

REVOKE ALL ON FUNCTION public._feedback_key(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public._feedback_key(UUID) FROM anon, authenticated;
GRANT  EXECUTE ON FUNCTION public._feedback_key(UUID) TO service_role;
