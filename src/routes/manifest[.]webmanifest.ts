/**
 * /manifest.webmanifest — dynamic PWA manifest.
 *
 * On apex domain, returns the global Tabibi manifest. On a doctor subdomain
 * ({slug}.mytabibi.com), looks up the doctor and returns a per-doctor branded
 * manifest so the installed PWA on the patient's home screen shows the
 * doctor's name, color, and icon (like a private clinic app).
 */
import { createFileRoute } from "@tanstack/react-router";
import { parseHost } from "@/lib/subdomain";

interface ManifestIcon {
  src: string;
  sizes: string;
  type: string;
  purpose?: string;
}

interface Manifest {
  name: string;
  short_name: string;
  description: string;
  start_url: string;
  scope: string;
  display: "standalone" | "minimal-ui" | "fullscreen" | "browser";
  orientation: "portrait" | "landscape" | "any";
  background_color: string;
  theme_color: string;
  lang: string;
  dir: "rtl" | "ltr";
  icons: ManifestIcon[];
  categories?: string[];
}

function defaultManifest(): Manifest {
  return {
    name: "طبيبي Tabibi — احجز طبيب أونلاين",
    short_name: "طبيبي",
    description: "منصة طبيبي للحجوزات الطبية وخدمات الصحة الرقمية",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#ffffff",
    theme_color: "#1d4ed8",
    lang: "ar",
    dir: "rtl",
    categories: ["medical", "health", "lifestyle"],
    icons: [
      { src: "/icon-192.svg", sizes: "192x192", type: "image/svg+xml", purpose: "any" },
      { src: "/icon-512.svg", sizes: "512x512", type: "image/svg+xml", purpose: "any" },
      { src: "/icon-192.svg", sizes: "192x192", type: "image/svg+xml", purpose: "maskable" },
    ],
  };
}

async function fetchDoctorBySlug(supabaseUrl: string, anonKey: string, slug: string): Promise<{
  full_name: string | null;
  specialty: string | null;
  solo_brand_color: string | null;
  solo_logo_url: string | null;
  solo_clinic_name: string | null;
} | null> {
  try {
    const res = await fetch(`${supabaseUrl}/rest/v1/rpc/get_doctor_by_slug`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        apikey: anonKey,
        authorization: `Bearer ${anonKey}`,
      },
      body: JSON.stringify({ p_slug: slug }),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as Array<Record<string, unknown>> | null;
    if (!json || json.length === 0) return null;
    const row = json[0];
    return {
      full_name: (row.full_name as string | null) ?? null,
      specialty: (row.specialty as string | null) ?? null,
      solo_brand_color: (row.solo_brand_color as string | null) ?? null,
      solo_logo_url: (row.solo_logo_url as string | null) ?? null,
      solo_clinic_name: (row.solo_clinic_name as string | null) ?? null,
    };
  } catch {
    return null;
  }
}

async function buildManifest(request: Request): Promise<Manifest> {
  const url = new URL(request.url);
  const host = request.headers.get("host") ?? url.hostname;
  const info = parseHost(host);
  if (!info.isSubdomain || !info.slug) return defaultManifest();

  // Read Supabase env at request time (Cloudflare Worker)
  const supabaseUrl =
    (globalThis as { SUPABASE_URL?: string }).SUPABASE_URL ??
    process.env.SUPABASE_URL ??
    process.env.VITE_SUPABASE_URL;
  const anonKey =
    (globalThis as { SUPABASE_PUBLISHABLE_KEY?: string }).SUPABASE_PUBLISHABLE_KEY ??
    process.env.SUPABASE_PUBLISHABLE_KEY ??
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !anonKey) return defaultManifest();

  const doc = await fetchDoctorBySlug(supabaseUrl, anonKey, info.slug);
  if (!doc) return defaultManifest();

  const name = doc.solo_clinic_name || doc.full_name || "عيادة";
  const color = doc.solo_brand_color || "#1d4ed8";
  const icon = doc.solo_logo_url;

  return {
    name: `${name} — احجز موعدك`,
    short_name: name.slice(0, 24),
    description: doc.specialty ? `${name} — ${doc.specialty}` : name,
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#ffffff",
    theme_color: color,
    lang: "ar",
    dir: "rtl",
    categories: ["medical", "health"],
    icons: icon
      ? [
          { src: icon, sizes: "192x192", type: "image/png", purpose: "any maskable" },
          { src: icon, sizes: "512x512", type: "image/png", purpose: "any" },
        ]
      : defaultManifest().icons,
  };
}

export const Route = createFileRoute("/manifest.webmanifest")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const manifest = await buildManifest(request);
        return new Response(JSON.stringify(manifest, null, 2), {
          status: 200,
          headers: {
            "content-type": "application/manifest+json; charset=utf-8",
            "cache-control": "public, max-age=300, s-maxage=600",
            vary: "host",
          },
        });
      },
    },
  },
});
