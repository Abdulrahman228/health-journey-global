import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { getCurrentSubdomain } from "@/lib/subdomain";

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
  const [info] = useState(() => getCurrentSubdomain());
  const [doctor, setDoctor] = useState<SoloDoctor | null>(null);
  const [loading, setLoading] = useState(info.isSubdomain);

  useEffect(() => {
    if (!info.isSubdomain || !info.slug) {
      setLoading(false);
      return;
    }
    let mounted = true;
    (async () => {
      const { data, error } = await supabase.rpc("get_doctor_by_slug", { p_slug: info.slug as string });
      if (!mounted) return;
      if (error || !data || (Array.isArray(data) && data.length === 0)) {
        setDoctor(null);
      } else {
        const row = (Array.isArray(data) ? data[0] : data) as SoloDoctor;
        setDoctor(row);
      }
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
