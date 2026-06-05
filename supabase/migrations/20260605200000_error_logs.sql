-- Error logging table for centralized telemetry.
-- Reads restricted to admins; inserts allowed for anyone (including anon).

CREATE TABLE IF NOT EXISTS error_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  source text NOT NULL CHECK (source IN ('client','server','sw')),
  level text NOT NULL DEFAULT 'error' CHECK (level IN ('debug','info','warn','error','fatal')),
  message text NOT NULL,
  stack text,
  url text,
  user_agent text,
  user_id uuid,
  context jsonb DEFAULT '{}'::jsonb,
  fingerprint text
);

CREATE INDEX IF NOT EXISTS idx_error_logs_created_at ON error_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_error_logs_fingerprint ON error_logs (fingerprint, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_error_logs_level ON error_logs (level, created_at DESC);

ALTER TABLE error_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS error_logs_admin_select ON error_logs;
CREATE POLICY error_logs_admin_select ON error_logs FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_roles.user_id = auth.uid() AND user_roles.role = 'admin'
  ));

DROP POLICY IF EXISTS error_logs_anon_insert ON error_logs;
-- Grant INSERT to TO public so it works with both legacy anon JWTs and the new
-- sb_publishable_ prefixed keys (which PostgREST does not map to the 'anon' role).
CREATE POLICY error_logs_anon_insert ON error_logs FOR INSERT TO public
  WITH CHECK (true);
