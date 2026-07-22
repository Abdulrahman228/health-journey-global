import { useAuth } from "./useAuth";

export function useIsAdmin() {
  const { role, isLoading } = useAuth();
  // super_admin is a superset of admin — both may access the admin UI.
  return { isAdmin: role === "admin" || role === "super_admin", isLoading };
}
