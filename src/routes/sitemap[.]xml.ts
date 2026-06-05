/**
 * /sitemap.xml — Sitemap *index* listing per-cluster sub-sitemaps.
 * Replaces the legacy single-file sitemap (split per Rank Math course
 * module 5: better recrawl signals, scales past 50K URLs cleanly).
 */
import { createFileRoute } from "@tanstack/react-router";
import { siteConfig } from "@/lib/seo";
import { buildSitemapIndex, XML_HEADERS } from "@/lib/sitemap";

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async () => {
        const today = new Date().toISOString().slice(0, 10);
        const xml = buildSitemapIndex([
          { loc: `${siteConfig.url}/sitemap-static.xml`, lastmod: today },
          { loc: `${siteConfig.url}/sitemap-specialties.xml`, lastmod: today },
          { loc: `${siteConfig.url}/sitemap-doctors.xml`, lastmod: today },
          { loc: `${siteConfig.url}/sitemap-articles.xml`, lastmod: today },
        ]);
        return new Response(xml, { status: 200, headers: XML_HEADERS });
      },
    },
  },
});
