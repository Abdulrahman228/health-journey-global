-- ============================================================================
-- Admin God Mode · Phase 1 · Migration B — role helpers, super_admin seed,
-- founder lock, profiles.status, and least-privilege admin READ policies.
--
-- Prereq: Migration A (20260710000001) must already be committed.
-- Design decisions (agreed):
--   * WRITES go through audited server functions (service role), NOT client RLS.
--     => This migration adds admin/super_admin READ policies only. No write
--        policies on client-reachable tables.
--   * Clinical/financial data (medical_records, payments) = super_admin READ only.
--   * Role changes = super_admin only; the founding super_admin can never be
--     removed (belt-and-suspenders trigger).
-- All statements are idempotent (safe to re-run).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) Role helpers. Reuse the existing recursion-safe has_role() (SECURITY
--    DEFINER) so policies never re-enter user_roles' own RLS.
--    is_admin() is TRUE for admin OR super_admin (super_admin is a superset).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_super_admin(_uid uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$ SELECT public.has_role(_uid, 'super_admin'); $$;

CREATE OR REPLACE FUNCTION public.is_admin(_uid uuid DEFAULT auth.uid())
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$ SELECT public.has_role(_uid, 'admin') OR public.has_role(_uid, 'super_admin'); $$;

-- ---------------------------------------------------------------------------
-- 2) Seed the founder (mn.3limni@gmail.com) with BOTH admin + super_admin.
--    Granting 'admin' too means the account also passes every pre-existing
--    has_role(...,'admin') policy without a migration sweep. Idempotent.
-- ---------------------------------------------------------------------------
INSERT INTO public.user_roles (user_id, role)
SELECT u.id, r.role
FROM auth.users u
CROSS JOIN (VALUES ('admin'::public.app_role), ('super_admin'::public.app_role)) AS r(role)
WHERE lower(u.email) = lower('mn.3limni@gmail.com')
ON CONFLICT (user_id, role) DO NOTHING;

-- ---------------------------------------------------------------------------
-- 3) Founder lock — the founding super_admin role row can never be deleted or
--    downgraded, so you can never lose God Mode (even to another admin).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.protect_founder_role()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.role = 'super_admin'
     AND OLD.user_id = (SELECT id FROM auth.users
                        WHERE lower(email) = lower('mn.3limni@gmail.com')) THEN
    RAISE EXCEPTION 'The founding super_admin role cannot be removed or altered.';
  END IF;
  RETURN OLD;
END $$;

DROP TRIGGER IF EXISTS trg_protect_founder_role ON public.user_roles;
CREATE TRIGGER trg_protect_founder_role
BEFORE DELETE OR UPDATE ON public.user_roles
FOR EACH ROW EXECUTE FUNCTION public.protect_founder_role();

-- ---------------------------------------------------------------------------
-- 4) Only super_admins may write roles (prevents any admin self-escalation).
--    Existing "read own roles" policy stays intact (permissive = OR-combined).
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "super_admin manages roles" ON public.user_roles;
CREATE POLICY "super_admin manages roles"
ON public.user_roles
FOR ALL
TO authenticated
USING (public.is_super_admin())
WITH CHECK (public.is_super_admin());

-- ---------------------------------------------------------------------------
-- 5) profiles.status — UI/RLS mirror of the auth-layer ban (banned_until is set
--    via the Admin API in a Phase 2 server function). Default keeps everyone active.
-- ---------------------------------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profiles_status_check'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_status_check
      CHECK (status IN ('active', 'suspended', 'banned'));
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 6) Least-privilege admin READ policies (PERMISSIVE => OR-combined with the
--    existing patient/doctor policies, so nothing regular users can do changes).
--    NOTE: no write policies here by design — mutations run through audited
--    server functions using the service role.
-- ---------------------------------------------------------------------------
-- General admin read-across
DROP POLICY IF EXISTS "admin read profiles" ON public.profiles;
CREATE POLICY "admin read profiles" ON public.profiles
  FOR SELECT TO authenticated USING (public.is_admin());

DROP POLICY IF EXISTS "admin read doctor_details" ON public.doctor_details;
CREATE POLICY "admin read doctor_details" ON public.doctor_details
  FOR SELECT TO authenticated USING (public.is_admin());

DROP POLICY IF EXISTS "admin read appointments" ON public.appointments;
CREATE POLICY "admin read appointments" ON public.appointments
  FOR SELECT TO authenticated USING (public.is_admin());

DROP POLICY IF EXISTS "admin read posts" ON public.posts;
CREATE POLICY "admin read posts" ON public.posts
  FOR SELECT TO authenticated USING (public.is_admin());

DROP POLICY IF EXISTS "admin read reviews" ON public.reviews;
CREATE POLICY "admin read reviews" ON public.reviews
  FOR SELECT TO authenticated USING (public.is_admin());

-- Clinical + financial: super_admin READ only (PHI / money)
DROP POLICY IF EXISTS "super_admin read medical_records" ON public.medical_records;
CREATE POLICY "super_admin read medical_records" ON public.medical_records
  FOR SELECT TO authenticated USING (public.is_super_admin());

DROP POLICY IF EXISTS "super_admin read payments" ON public.payments;
CREATE POLICY "super_admin read payments" ON public.payments
  FOR SELECT TO authenticated USING (public.is_super_admin());

-- ============================================================================
-- End Phase 1 Migration B. Verify with the queries in the runbook, then deploy
-- the updated assertAdmin()/assertSuperAdmin() code.
-- ============================================================================
