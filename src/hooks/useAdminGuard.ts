import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useAuth } from "./useAuth";

/**
 * Centralized RBAC guard for /admin/* routes.
 *
 * Redirect matrix:
 *   unauthenticated  → /login
 *   role: doctor     → /dashboard
 *   role: pharmacy   → /pharmacy/dashboard
 *   role: patient    → /
 *   role: admin / super_admin → allowed (ready: true)
 */
export function useAdminGuard() {
  const { user, role, isLoading } = useAuth();
  const navigate = useNavigate();

  const isAdmin = role === "admin" || role === "super_admin";

  useEffect(() => {
    if (isLoading) return;

    if (!user) {
      void navigate({ to: "/login" });
      return;
    }

    switch (role) {
      case "doctor":
        void navigate({ to: "/dashboard" });
        break;
      case "pharmacy":
        void navigate({ to: "/pharmacy/dashboard" });
        break;
      case "patient":
        void navigate({ to: "/" });
        break;
      default:
        if (!isAdmin) void navigate({ to: "/" });
    }
  }, [isLoading, user, role, isAdmin, navigate]);

  return {
    isLoading,
    isAdmin,
    /** true only when auth resolved AND user is admin — safe to render protected content */
    ready: !isLoading && isAdmin,
  };
}
