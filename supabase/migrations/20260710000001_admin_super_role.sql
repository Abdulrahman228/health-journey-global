-- ============================================================================
-- Admin God Mode · Phase 1 · Migration A — add the super_admin role value
--
-- MUST be applied on its own (Postgres cannot ADD a new enum value and then
-- USE it inside the same transaction). Run this first, let it commit, THEN run
-- Migration B (20260710000002_admin_rls_phase1.sql).
-- Idempotent: safe to re-run.
-- ============================================================================

ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'super_admin';
