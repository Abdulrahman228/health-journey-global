import { useEffect, useMemo, useState } from "react";
import { useLocation } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { getCurrentSubdomain, type SubdomainInfo } from "@/lib/subdomain";

export interface SoloDoctor {
  doctor_id: string;
  profile_id: string;
  full_name: string | null;
  avatar_url: string | null;
  specialty: string | null;
  bio: string | null;
  is_verified: boolean | null;
  solo_mode_enabled: boolean | null;
  solo_brand_color: string | null;
  solo_logo_url: string | null;
  solo_clinic_name: string | null;
}

export interface SoloContext {
  isSolo: boolean;
  isSubdomain: boolean;
  slug: string | null;
  doctor: SoloDoctor | null;
  loading: boolean;
}

/**
 * Returns context for the current subdomain. If we're on a doctor's L3
 * subdomain AND that doctor has solo_mode_enabled, isSolo=true and the host
 * page should hide global marketplace navigation.
 */
export function useSoloMode(): SoloContext {
  // Host never changes for the life of the page (SSR-safe: nulls on the server).
  const [host] = useState<SubdomainInfo>(() => getCurrentSubdomain());
  // The path DOES change on client-side navigation and this hook lives in the
  // root layout (never remounts), so derive path mode from the router: /d/{slug}
  // is branded when reached via a <Link>, and leaving it removes the branding.
  const { pathname } = useLocation();
  const info = useMemo<SubdomainInfo>(() => {
    // 1) White-label subdomain: {slug}.mytabibi.com (needs wildcard DNS).
    if (host.isSubdomain && host.slug) return host;
    // 2) Apex path /d/{slug} — the SAME white-label page with zero DNS setup,
    //    so it works instantly for every doctor. Slug rules match the DB.
    const m = pathname.match(/^\/d\/([a-z0-9][a-z0-9-]{1,79})(?=\/|$)/i);
    if (m) return { isSubdomain: true, slug: m[1].toLowerCase(), apex: null };
    return host;
  }, [host, pathname]);
  const [doctor, setDoctor] = useState<SoloDoctor | null>(null);
  const [loading, setLoading] = useState(info.isSubdomain);

  useEffect(() => {
    // Drop the previous doctor's branding as soon as the slug changes.
    setDoctor(null);
    const slug = info.isSubdomain ? info.slug : null;
    if (!slug) {
      setLoading(false);
      return;
    }
    setLoading(true);
    let mounted = true;
    (async () => {
      // Returns 0 or 1 row: verified doctors with a public/unlisted profile.
      const { data, error } = await supabase.rpc("get_doctor_by_slug", { p_slug: slug });
      if (!mounted) return;
      setDoctor(error ? null : (data?.[0] ?? null));
      setLoading(false);
    })();
    return () => {
      mounted = false;
    };
  }, [info.isSubdomain, info.slug]);

  const isSolo = info.isSubdomain && !!doctor && doctor.solo_mode_enabled === true;

  return {
    isSolo,
    isSubdomain: info.isSubdomain,
    slug: info.slug,
    doctor,
    loading,
  };
}
