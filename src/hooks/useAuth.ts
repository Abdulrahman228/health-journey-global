import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export type UserRole = Database["public"]["Enums"]["app_role"];

interface ProfileLite {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  city: string | null;
  country: string | null;
}

interface AuthState {
  user: User | null;
  /** Primary role (see ROLE_PRIORITY) — what most pages gate on. */
  role: UserRole | null;
  /** EVERY role the user holds (user_roles is one row per role). */
  roles: UserRole[];
  profile: ProfileLite | null;
  isLoading: boolean;
  isAuthenticated: boolean;
}

/**
 * Primary-role priority. A user can hold several roles (e.g. doctor + admin):
 * `doctor` wins over `admin` so the doctor app (/dashboard, /doctor/*) keeps
 * working for a doctor who is also an admin; admin access is decided from
 * `roles` (useIsAdmin / useAdminGuard), never from the primary role alone.
 */
const ROLE_PRIORITY: UserRole[] = ["doctor", "super_admin", "admin", "lab", "pharmacy", "patient"];

function primaryRole(roles: UserRole[]): UserRole | null {
  for (const p of ROLE_PRIORITY) if (roles.includes(p)) return p;
  return roles[0] ?? null;
}

export function hasAdminRole(roles: readonly string[]): boolean {
  return roles.includes("admin") || roles.includes("super_admin");
}

/** Where a signed-in user lands when no explicit redirect was requested. */
export function homePathForRoles(
  roles: readonly string[],
): "/admin" | "/dashboard" | "/lab/dashboard" | "/pharmacy/dashboard" | "/" {
  if (hasAdminRole(roles)) return "/admin";
  if (roles.includes("doctor")) return "/dashboard";
  if (roles.includes("lab")) return "/lab/dashboard";
  if (roles.includes("pharmacy")) return "/pharmacy/dashboard";
  return "/";
}

async function fetchRoles(userId: string): Promise<UserRole[]> {
  try {
    const { data, error } = await supabase.from("user_roles").select("role").eq("user_id", userId);
    if (error || !data) return [];
    return data.map((r) => r.role);
  } catch {
    return [];
  }
}

async function fetchProfile(userId: string): Promise<ProfileLite | null> {
  try {
    const { data, error } = await supabase
      .from("profiles")
      .select("id, full_name, avatar_url, city, country")
      .eq("user_id", userId)
      .maybeSingle();
    if (error || !data) return null;
    return data;
  } catch {
    return null;
  }
}

const SIGNED_OUT: AuthState = {
  user: null,
  role: null,
  roles: [],
  profile: null,
  isLoading: false,
  isAuthenticated: false,
};

export function useAuth() {
  const [state, setState] = useState<AuthState>({ ...SIGNED_OUT, isLoading: true });

  useEffect(() => {
    let mounted = true;

    const hydrate = async (user: User | null) => {
      if (!mounted) return;
      if (!user) {
        setState(SIGNED_OUT);
        return;
      }
      const [roles, profile] = await Promise.all([fetchRoles(user.id), fetchProfile(user.id)]);
      if (!mounted) return;
      setState({
        user,
        role: primaryRole(roles),
        roles,
        profile,
        isLoading: false,
        isAuthenticated: true,
      });
    };

    supabase.auth.getSession().then(({ data: { session } }) => hydrate(session?.user ?? null));

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      hydrate(session?.user ?? null);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    // Belt-and-suspenders: wipe any lingering Supabase auth token so a later
    // login can never inherit the previous account's session. Only auth keys —
    // language / theme / referral preferences stay.
    if (typeof window !== "undefined") {
      try {
        const keys: string[] = [];
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && (k.startsWith("sb-") || k === "tabibi-oauth-role")) keys.push(k);
        }
        keys.forEach((k) => localStorage.removeItem(k));
      } catch {
        /* storage unavailable */
      }
    }
    setState(SIGNED_OUT);
  }, []);

  return { ...state, signOut };
}
