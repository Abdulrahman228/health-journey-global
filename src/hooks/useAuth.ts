import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User } from "@supabase/supabase-js";

type UserRole = "admin" | "doctor" | "patient" | "pharmacy";

interface ProfileLite {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  city: string | null;
  country: string | null;
}

interface AuthState {
  user: User | null;
  role: UserRole | null;
  profile: ProfileLite | null;
  isLoading: boolean;
  isAuthenticated: boolean;
}

async function fetchRole(userId: string): Promise<UserRole | null> {
  try {
    const { data, error } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    if (error || !data || data.length === 0) return null;
    const roles = data.map((r) => r.role as UserRole);
    // Priority: admin > doctor > pharmacy > patient
    const priority: UserRole[] = ["admin", "doctor", "pharmacy", "patient"];
    for (const p of priority) {
      if (roles.includes(p)) return p;
    }
    return roles[0] ?? null;
  } catch {
    return null;
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
    return data as ProfileLite;
  } catch {
    return null;
  }
}

export function useAuth() {
  const [state, setState] = useState<AuthState>({
    user: null,
    role: null,
    profile: null,
    isLoading: true,
    isAuthenticated: false,
  });

  useEffect(() => {
    let mounted = true;

    const hydrate = async (user: User | null) => {
      if (!mounted) return;
      if (!user) {
        setState({ user: null, role: null, profile: null, isLoading: false, isAuthenticated: false });
        return;
      }
      const [role, profile] = await Promise.all([fetchRole(user.id), fetchProfile(user.id)]);
      if (!mounted) return;
      setState({ user, role, profile, isLoading: false, isAuthenticated: true });
    };

    supabase.auth.getSession().then(({ data: { session } }) => hydrate(session?.user ?? null));

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      hydrate(session?.user ?? null);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setState({ user: null, role: null, profile: null, isLoading: false, isAuthenticated: false });
  }, []);

  return { ...state, signOut };
}
