-- Security: restrict user_roles SELECT.
-- Previously: any authenticated user could read ALL role assignments
-- (leaking who has admin role -> useful intel for targeted attacks).
-- After:      caller sees only their own roles; admins still see all.
-- is_admin() is SECURITY DEFINER so no RLS recursion.

DROP POLICY IF EXISTS "user_roles viewable by authenticated" ON public.user_roles;

CREATE POLICY "users read own roles" ON public.user_roles
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR public.is_admin());
