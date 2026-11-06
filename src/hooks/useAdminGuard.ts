import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { hasAdminRole, homePathForRoles, useAuth } from "./useAuth";

/**
 * Centralized RBAC guard for /admin/* routes.
 *
 * Redirect matrix (decided from ALL of the user's roles — multi-role users exist):
 *   unauthenticated                       → /login
 *   holds admin / super_admin (any combo) → allowed (ready: true)
 *   otherwise → their own home (doctor → /dashboard, lab → /lab/dashboard,
 *               pharmacy → /pharmacy/dashboard, patient → /)
 */
export function useAdminGuard() {
  const { user, roles, isLoading } = useAuth();
  const navigate = useNavigate();

  const isAdmin = hasAdminRole(roles);

  useEffect(() => {
    if (isLoading) return;

    if (!user) {
      void navigate({ to: "/login" });
      return;
    }

    if (!isAdmin) void navigate({ to: homePathForRoles(roles) });
  }, [isLoading, user, roles, isAdmin, navigate]);

  return {
    isLoading,
    isAdmin,
    /** true only when auth resolved AND user is admin — safe to render protected content */
    ready: !isLoading && isAdmin,
  };
}
