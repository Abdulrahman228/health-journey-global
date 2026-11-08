# Technical SEO audit - https://mytabibi.com (2026-11-08)
Method: curl against live site (claude-seo toolkit not used). 9 pages + 6 sitemap/robots fetches. Score: 52/100.

## CRITICAL
1. Duplicate/conflicting canonical + hreflang on every sub-page.
   Evidence: view-source of /doctors, /nearby, /specialty/internal, /articles, /about, /specialty/internal/cairo each contains TWO rel=canonical: first `https://mytabibi.com` (homepage, from root layout), second the real URL. Same for the full hreflang block (first block -> homepage). Google ignores conflicting canonicals and may consolidate all pages into the homepage.
   /pricing and /join-doctor have ONLY the homepage canonical (no self canonical at all) and /pricing og:url is also the homepage -> these two will be treated as duplicates of "/".
   Fix: remove canonical/hreflang/og:url from the root route head; emit them only per-route (via route `head()` merge keyed by rel so child overrides parent). Add self canonical to /pricing and /join-doctor. Verify exactly one canonical per page.
2. Doctor and article sitemaps are empty.
   Evidence: /sitemap-doctors.xml and /sitemap-articles.xml return 200 with an empty `<urlset>` (110 bytes, 0 `<loc>`). Doctor profile pages and articles (the long-tail traffic) are not submitted. Index lists them with lastmod 2026-11-08.
   Fix: check the sitemap generator query (likely RLS/anon key or Worker env missing -> empty result); fail loudly / don't serve empty sitemaps. Also /specialty/internal/doctors links found in HTML were 0 on /specialty/internal - confirm doctor list is SSR-rendered.

## HIGH
3. No security headers at all (home and all pages): no Strict-Transport-Security, Content-Security-Policy, X-Content-Type-Options, X-Frame-Options/frame-ancestors, Referrer-Policy, Permissions-Policy.
   Fix: add via Worker response wrapper or Cloudflare Transform Rules; enable HSTS (max-age 31536000, includeSubDomains after testing), nosniff, Referrer-Policy strict-origin-when-cross-origin, frame-ancestors 'self', Permissions-Policy (geolocation=(self) for /nearby).
4. HTTP is not redirected to HTTPS: `curl -I http://mytabibi.com/` and `/doctors` return 200 (no 301). Duplicate http version + downgrade.
   Fix: Cloudflare SSL/TLS -> Edge Certificates -> "Always Use HTTPS" on, then HSTS.
5. /specialty/internal/cairo is live (200) but `<meta name="robots" content="noindex, nofollow">` and canonical conflict (3 canonicals: home, /specialty/internal, itself). Not in sitemap. Result: city landing pages cannot rank; nofollow also blocks link flow.
   Fix: decide intent. If the page has unique doctor content, make it index,follow with self canonical and add to sitemap; if thin, keep noindex but drop nofollow and 404/redirect when there are no doctors.
6. Hreflang misuse: every page lists ar, ar-EG, ar-SA, ar-AE, ar-QA, ar-KW, ar-BH, ar-OM, ar-JO, x-default all pointing to the same URL. Single-language site gains nothing; invalid-looking noise doubled by item 1.
   Fix: remove the alternate block entirely (or keep one self-referential `ar` + x-default). Use `og:locale` ar_EG (currently `ar_AR`, not a valid locale code).

## MEDIUM
7. 404 handling: unknown URL returns real 404 status (good) but the document keeps homepage `<title>`, `robots: index, follow` and homepage canonical (from item 1). Fix: set noindex and a "page not found" title on the 404 route.
8. Case variant /Doctors returns 200 (duplicate content; canonical = /doctors so tolerated). /index.html is 404, /doctors/ -> 307 /doctors (use 301). Fix: lowercase 301 redirect, 301 instead of 307 for trailing slash.
9. Homepage canonical/og:url has no trailing slash and no path ("https://mytabibi.com") - fine technically but inconsistent with sitemap `https://mytabibi.com` (ok). Keep consistent.
10. /nearby is indexable (title/desc ok) but missing from sitemap-static.xml; /how-it-works, /contact, /feed are in it. Add /nearby if it should rank. Sitemap has no hreflang (fine) and no priority/lastmod per URL in child sitemaps (static: 13 URLs, specialties: 67).
11. robots.txt: conflicting groups. Cloudflare-managed block Disallows GPTBot, ClaudeBot, Google-Extended, anthropic-ai etc., then the site's own later block Allows the same agents ("we want LLM citations"). Crawlers merge same-UA groups; the outcome is parser-dependent. Content-Signal says ai-train=no, search=yes, use=reference. Fix: decide policy; turn off Cloudflare managed robots.txt OR remove the contradicting Allow groups. Note Google-Extended/GPTBot Allow does not conflict with search ranking (Googlebot is unaffected). Googlebot/Bingbot are allowed; sitemap declared and valid (index 200 with 4 children).
12. /specialty/internal and home are large: HTML 54 KB (home), 36 KB, 40 KB (cairo), 59 KB (/join-doctor) uncompressed in `-s` fetch; ~10 KB compressed on home - acceptable. Home has 18 modulepreload tags for tiny icon chunks (lucide icons split into separate chunks) - consolidate to reduce request fan-out.
13. /pricing: title "خطة جولد للأطباء - طبانا" is short on keywords; doctor-facing page while /join-doctor targets the same audience (possible overlap).

## LOW / PASS
- Pass: lang="ar" dir="rtl" on all pages; single h1 per page; meta descriptions present; viewport OK; JSON-LD on all pages (WebSite+SearchAction, FAQPage, ContactPoint); SSR HTML returns full content (no CSR shell); www -> apex 301 (https://www.mytabibi.com/ -> https://mytabibi.com/); robots private paths disallowed (/dashboard, /admin, /api/, ...); sitemap-static has 13 valid URLs.
- Render-blocking: one blocking stylesheet /assets/styles-CCf2YkB8.css (expected). Google Fonts (Cairo, IBM Plex Sans Arabic, Inter) is loaded non-blocking via media=print swap trick (good), with preconnect. Only the module script is async. Three font families is heavy: drop Inter or Cairo to cut LCP/CLS risk (font-display=swap present, size-adjust fallback not checked).
- Service worker registered at /sw.js with scope "/" - make sure it doesn't serve stale HTML to bots/users after deploys.
- Homepage has FAQPage schema: Google restricts FAQ rich results to gov/health authority sites, so no SERP gain expected.
- Home TTFB ~0.45 s, other pages 0.22-0.68 s from this location: fine. Cache headers on HTML not present (no cache-control) - acceptable for SSR, consider s-maxage for anonymous pages.

## Not tested
CWV field data (CrUX/Lighthouse), Playwright rendering diff, per-doctor pages, /articles/{slug} templates, structured-data validation in Rich Results Test, mobile touch targets, IndexNow, full crawl, claude-seo toolkit (not run).
