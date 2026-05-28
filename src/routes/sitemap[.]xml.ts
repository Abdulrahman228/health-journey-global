/**
 * /sitemap.xml — generated server route.
 *
 * Combines static public pages with dynamic doctor profiles from Supabase.
 * Falls back gracefully to static-only if Supabase is unreachable.
 */
import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { siteConfig } from "@/lib/seo";

interface SitemapEntry {
  loc: string;
  lastmod?: string;
  changefreq?: "always" | "hourly" | "daily" | "weekly" | "monthly" | "yearly" | "never";
  priority?: number;
}

const STATIC_ENTRIES: SitemapEntry[] = [
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
  { loc: "/privacy", changefreq: "yearly", priority: 0.3 },
  { loc: "/terms", changefreq: "yearly", priority: 0.3 },
];

function escapeXml(str: string): string {
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

async function fetchDoctorEntries(): Promise<SitemapEntry[]> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return [];

  try {
    const sb = createClient(url, key);
    const { data, error } = await sb
      .from("doctor_details")
      .select("id, updated_at, is_verified")
      .eq("is_verified", true)
      .limit(5000);
    if (error || !data) return [];
    return data.map((d: { id: string; updated_at: string | null }) => ({
      loc: `/doctor/${d.id}`,
      lastmod: d.updated_at ? new Date(d.updated_at).toISOString().slice(0, 10) : undefined,
      changefreq: "weekly" as const,
      priority: 0.8,
    }));
  } catch (err) {
    console.error("[sitemap] doctor fetch failed:", err);
    return [];
  }
}

function buildSitemap(entries: SitemapEntry[]): string {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...entries.map(renderEntry),
    "</urlset>",
    "",
  ].join("\n");
}

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async () => {
        const today = new Date().toISOString().slice(0, 10);
        const staticWithDate = STATIC_ENTRIES.map((e) => ({ lastmod: today, ...e }));
        const doctorEntries = await fetchDoctorEntries();
        const xml = buildSitemap([...staticWithDate, ...doctorEntries]);
        return new Response(xml, {
          status: 200,
          headers: {
            "content-type": "application/xml; charset=utf-8",
            "cache-control": "public, max-age=3600, s-maxage=86400",
          },
        });
      },
    },
  },
});
