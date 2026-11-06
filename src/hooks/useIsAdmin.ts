import { hasAdminRole, useAuth } from "./useAuth";

export function useIsAdmin() {
  const { roles, isLoading } = useAuth();
  // super_admin is a superset of admin — both may access the admin UI. Checked
  // against ALL roles: a doctor who is also an admin has primary role "doctor".
  return { isAdmin: hasAdminRole(roles), isLoading };
}
