/**
 * Shared sitemap helpers.
 *
 * Splitting sitemaps by content type (static / specialties / doctors /
 * articles) follows the Rank Math course recommendation: lets Google
 * track lastmod per cluster, recrawl high-priority groups (doctors)
 * more aggressively, and stays well under the 50,000 URLs / 50 MB
 * per-sitemap protocol limits as we scale.
 */
import { createClient } from "@supabase/supabase-js";
import { siteConfig } from "@/lib/seo";

export interface SitemapEntry {
  loc: string;
  lastmod?: string;
  changefreq?: "always" | "hourly" | "daily" | "weekly" | "monthly" | "yearly" | "never";
  priority?: number;
}

export function escapeXml(str: string): string {
  return str.replace(/[<>&'"]/g, (c) => {
    switch (c) {
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case "&":
        return "&amp;";
      case "'":
        return "&apos;";
      case '"':
        return "&quot;";
      default:
        return c;
    }
  });
}

function renderEntry(e: SitemapEntry): string {
  const lastmod = e.lastmod ? `    <lastmod>${e.lastmod}</lastmod>\n` : "";
  const changefreq = e.changefreq ? `    <changefreq>${e.changefreq}</changefreq>\n` : "";
  const priority =
    typeof e.priority === "number"
      ? `    <priority>${e.priority.toFixed(1)}</priority>\n`
      : "";
  const loc = e.loc.startsWith("http")
    ? e.loc
    : `${siteConfig.url}${e.loc === "/" ? "" : e.loc}`;
  return `  <url>\n    <loc>${escapeXml(loc)}</loc>\n${lastmod}${changefreq}${priority}  </url>`;
}

export function buildUrlset(entries: SitemapEntry[]): string {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...entries.map(renderEntry),
    "</urlset>",
    "",
  ].join("\n");
}

export function buildSitemapIndex(
  children: Array<{ loc: string; lastmod?: string }>,
): string {
  const items = children
    .map(
      (c) =>
        `  <sitemap>\n    <loc>${escapeXml(c.loc)}</loc>\n${
          c.lastmod ? `    <lastmod>${c.lastmod}</lastmod>\n` : ""
        }  </sitemap>`,
    )
    .join("\n");
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    items,
    "</sitemapindex>",
    "",
  ].join("\n");
}

export const STATIC_ENTRIES: SitemapEntry[] = [
  { loc: "/", changefreq: "daily", priority: 1.0 },
  { loc: "/doctors", changefreq: "daily", priority: 0.9 },
  { loc: "/about", changefreq: "monthly", priority: 0.7 },
  { loc: "/how-it-works", changefreq: "monthly", priority: 0.7 },
  { loc: "/pricing", changefreq: "weekly", priority: 0.8 },
  { loc: "/contact", changefreq: "monthly", priority: 0.6 },
  { loc: "/join-doctor", changefreq: "monthly", priority: 0.8 },
  { loc: "/pharmacy/register", changefreq: "monthly", priority: 0.7 },
  { loc: "/missing-drugs", changefreq: "weekly", priority: 0.6 },
  { loc: "/feed", changefreq: "daily", priority: 0.6 },
  { loc: "/articles", changefreq: "daily", priority: 0.8 },
  { loc: "/privacy", changefreq: "yearly", priority: 0.3 },
  { loc: "/terms", changefreq: "yearly", priority: 0.3 },
];

function getSb() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key);
}

export async function fetchDoctorEntries(): Promise<SitemapEntry[]> {
  const sb = getSb();
  if (!sb) return [];
  try {
    // Join doctor_details with profiles so we can emit /d/{slug} when
    // a public slug exists (preferred) or fall back to /doctor/{id}.
    const { data, error } = await sb
      .from("doctor_details")
      .select("id, updated_at, is_verified, profile_id, profiles!inner(slug, profile_visibility)")
      .eq("is_verified", true)
      .limit(5000);
    if (error || !data) return [];
    return (
      data as unknown as Array<{
        id: string;
        updated_at: string | null;
        profiles: { slug: string | null; profile_visibility: string | null } | null;
      }>
    )
      .filter((d) => d.profiles?.profile_visibility !== "private")
      .map((d) => {
        const slug = d.profiles?.slug;
        return {
          loc: slug ? `/d/${slug}` : `/doctor/${d.id}`,
          lastmod: d.updated_at ? new Date(d.updated_at).toISOString().slice(0, 10) : undefined,
          changefreq: "weekly" as const,
          priority: 0.8,
        };
      });
  } catch (err) {
    console.error("[sitemap] doctor fetch failed:", err);
    return [];
  }
}

export async function fetchSpecialtyEntries(): Promise<SitemapEntry[]> {
  const sb = getSb();
  if (!sb) return [];
  try {
    const { data, error } = await sb.from("specialties").select("slug").limit(500);
    if (error || !data) return [];
    return (data as Array<{ slug: string }>).map((s) => ({
      loc: `/specialty/${s.slug}`,
      changefreq: "weekly" as const,
      priority: 0.85,
    }));
  } catch (err) {
    console.error("[sitemap] specialty fetch failed:", err);
    return [];
  }
}

/**
 * Generate /specialty/$slug/$city combo URLs — ONLY for combos that
 * actually have at least one verified doctor (avoid thin content).
 */
export async function fetchSpecialtyCityEntries(): Promise<SitemapEntry[]> {
  const sb = getSb();
  if (!sb) return [];
  try {
    const { CITIES, cityMatchTerms } = await import("@/lib/cities");
    const [specsRes, doctorsRes, profilesRes] = await Promise.all([
      sb.from("specialties").select("slug, name_ar, name_en"),
      sb.from("doctor_details").select("profile_id, specialty").eq("is_verified", true).limit(5000),
      sb.from("profiles").select("id, city").limit(10000),
    ]);
    if (!specsRes.data || !doctorsRes.data || !profilesRes.data) return [];
    const cityByProfile = new Map(
      (profilesRes.data as Array<{ id: string; city: string | null }>).map((p) => [
        p.id,
        (p.city ?? "").trim(),
      ]),
    );
    const cityTermsToSlug = new Map<string, string>();
    for (const c of CITIES) {
      for (const term of cityMatchTerms(c)) cityTermsToSlug.set(term, c.slug);
    }
    const seen = new Set<string>();
    for (const d of doctorsRes.data as Array<{ profile_id: string; specialty: string | null }>) {
      const docCity = cityByProfile.get(d.profile_id);
      if (!docCity || !d.specialty) continue;
      const citySlug = cityTermsToSlug.get(docCity);
      if (!citySlug) continue;
      for (const spec of specsRes.data as Array<{ slug: string; name_ar: string; name_en: string }>) {
        if (d.specialty === spec.name_ar || d.specialty === spec.name_en) {
          seen.add(`${spec.slug}|${citySlug}`);
        }
      }
    }
    return [...seen].map((k) => {
      const [slug, city] = k.split("|");
      return {
        loc: `/specialty/${slug}/${city}`,
        changefreq: "weekly" as const,
        priority: 0.9,
      };
    });
  } catch (err) {
    console.error("[sitemap] specialty×city fetch failed:", err);
    return [];
  }
}

export async function fetchArticleEntries(): Promise<SitemapEntry[]> {
  const sb = getSb();
  if (!sb) return [];
  try {
    const { data } = await sb
      .from("articles")
      .select("slug, updated_at")
      .eq("is_published", true)
      .limit(5000);
    if (!data) return [];
    return (data as Array<{ slug: string; updated_at: string | null }>).map((a) => ({
      loc: `/articles/${a.slug}`,
      lastmod: a.updated_at ? new Date(a.updated_at).toISOString().slice(0, 10) : undefined,
      changefreq: "monthly" as const,
      priority: 0.7,
    }));
  } catch (err) {
    console.error("[sitemap] article fetch failed:", err);
    return [];
  }
}

export const XML_HEADERS = {
  "content-type": "application/xml; charset=utf-8",
  "cache-control": "public, max-age=3600, s-maxage=86400",
};
