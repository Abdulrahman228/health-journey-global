/**
 * /robots.txt — generated server route.
 *
 * Allows all bots, points to the dynamic sitemap, disallows
 * private user-state pages (dashboard, billing, checkout, admin).
 */
import { createFileRoute } from "@tanstack/react-router";
import { siteConfig } from "@/lib/seo";

function buildRobots(): string {
  return [
    "User-agent: *",
    "Allow: /",
    "",
    "# Private user-state pages — exclude from index",
    "Disallow: /dashboard",
    "Disallow: /profile",
    "Disallow: /billing",
    "Disallow: /checkout",
    "Disallow: /consultation/",
    "Disallow: /admin/",
    "Disallow: /doctor/verification",
    "Disallow: /pharmacy/dashboard",
    "Disallow: /feed/new",
    "Disallow: /api/",
    "",
    "# Common AI crawlers — explicit allow (we want LLM citations)",
    "User-agent: GPTBot",
    "Allow: /",
    "",
    "User-agent: Google-Extended",
    "Allow: /",
    "",
    "User-agent: PerplexityBot",
    "Allow: /",
    "",
    "User-agent: ClaudeBot",
    "Allow: /",
    "",
    `Sitemap: ${siteConfig.url}/sitemap.xml`,
    "",
  ].join("\n");
}

export const Route = createFileRoute("/robots.txt")({
  server: {
    handlers: {
      GET: () =>
        new Response(buildRobots(), {
          status: 200,
          headers: {
            "content-type": "text/plain; charset=utf-8",
            "cache-control": "public, max-age=3600, s-maxage=86400",
          },
        }),
    },
  },
});
