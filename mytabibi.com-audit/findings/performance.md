# mytabibi.com performance (2026-11-08)

Method: PSI public API returned 429 (daily quota), so I ran local Lighthouse 13.6.0 (simulated slow 4G / Moto G-class for mobile, desktop preset), one run per cell. These are lab numbers and carry run-to-run variance. No CrUX field data was pulled. INP cannot be measured in the lab, so TBT is the proxy.

## Metrics
| Page | Device | Perf | FCP | LCP | TBT | CLS | Speed Index | TTFB (doc) |
|---|---|---|---|---|---|---|---|---|
| Home | Mobile | 93 | 2.6s | 2.6s | 50ms | 0 | 3.2s | ~90-215ms |
| Home | Desktop | 96 | 0.9s | 0.9s | 0 | 0.019 | 1.5s | ~110ms |
| /doctors | Mobile | 100 | 1.2s | 1.2s | 90ms | 0.023 | 2.2s | ~90-215ms |
| /doctors | Desktop | 100 | 0.4s | 0.4s | 0 | 0.014 | 0.7s | ~90ms |

curl TTFB for the home page was 0.22s (Cloudflare edge, 54KB uncompressed HTML).

## LCP element
- Home mobile: `<p class="mt-5 max-w-xl text-lg ...">` (hero subtitle, "في العيادة أو بالفيديو..."), a text node. LCP breakdown: TTFB 214ms + element render delay 1004ms. The LCP is not image- or network-bound. It is held back by render delay.
- /doctors mobile: `h1.text-3xl` ("ابحث عن طبيبك"). TTFB 215ms + render delay 616ms.

## Weight (home mobile, 40 requests, ~910KB transferred)
- JS: 270KB over 18 requests. Main chunk `index-BYXoD4Qc.js` is 241KB, 57% unused (~136KB savings).
- CSS: 27KB (`styles-CCf2YkB8.css` 25KB, render-blocking, ~170ms mobile) plus the Google Fonts CSS.
- Fonts: 193KB over 8 woff2 files, all from fonts.gstatic.com. IBM Plex Sans Arabic is split into 4 files of 33-35KB each. Cairo is also requested (css2 `Cairo:wght@400;600;700` plus IBM Plex Sans Arabic, 400+). Inter was not seen in the requests.
- Images: 1 request, 344KB. `/logo-mark.png` is 352KB (PNG) and is displayed at 48x48 in the footer. It has a `<link rel=preload as=image>` in the head. `icon-192.png` is 51KB. Lighthouse estimates 343KB of image savings.
- Cache: `/logo-mark.png` and `/assets/*.js` are served with `Cache-Control: public, max-age=0, must-revalidate`. Hashed assets are not immutable, so repeat visits pay revalidation.
- Compression: JS is served with brotli.

## Render-blocking
- `/assets/styles-CCf2YkB8.css` (~170ms mobile, ~10-70ms desktop).
- The Google Fonts stylesheet (fonts.googleapis.com/css2) is requested at ~600ms in the mobile trace. This makes text paint wait on a cross-origin chain: CSS, then woff2. This matches the 0.6-1.0s element render delay.
- 17 modulepreloads (one per icon chunk, e.g. arrow-left, sparkles, brain) are injected into the head.

## Third parties and client fetches
- fonts.googleapis.com and fonts.gstatic.com.
- static.cloudflareinsights.com beacon (10KB), which then calls /cdn-cgi/rum.
- ipapi.co/json on /doctors (client-side geo lookup, an external dependency and privacy concern).
- Supabase REST calls fired client-side after hydration:
  - Home: specialties and doctor_details.
  - /doctors: exchange_rates, sponsored_slots, specialties, doctor_details, rpc/list_seeded_doctors. Each has a CORS preflight, so about 2x the round trips. All start at ~1.1-1.4s in the trace.
- CLS is low (0 to 0.023), so no layout-shift problem. The post-fetch doctor list on /doctors is the likeliest shift source (0.023).

## Prioritized fixes
1. Self-host fonts, using only the subsets and weights actually used. Drop the Google CSS request. Preload the one or two critical woff2 files with `font-display: swap` and `size-adjust` fallback metrics. Remove Cairo if IBM Plex Sans Arabic is the real body font (or the reverse). Expected: LCP -0.6 to -1.0s on mobile home (2.6s to about 1.6-1.9s). This is the biggest win.
2. Recompress `logo-mark.png` (352KB to under 10KB as SVG or WebP/AVIF at 96px). Also shrink `icon-192.png` (51KB). Remove the preload from the head (it competes with CSS/fonts at high priority for a 48px footer image). Expected: -343KB transfer, with less bandwidth contention on slow 4G.
3. Split the 241KB main chunk. 57% is unused. Find what is in `index-BYXoD4Qc.js` (likely router, Supabase client, and shared components). Lazy-load below-the-fold sections and keep Leaflet confined to the map route. Expected: -100KB or more JS, with lower TBT on /doctors (90ms) and a faster hydrate.
4. Inline critical CSS or reduce the 25KB Tailwind CSS render-blocking cost. Expected: -100 to -170ms FCP on mobile. Also drop the redundant per-icon modulepreloads (bundle icons together) to cut head noise and early request contention.
5. Put the `/doctors` data fetches into the SSR loader (or cache them at the edge) instead of 5+ client calls with preflights after hydration. Replace ipapi.co with `request.cf.country` from the Workers request. Cache exchange_rates/specialties. Expected: faster content-complete state, no third-party geo latency or privacy exposure, and less CLS.
6. Set `Cache-Control: public, max-age=31536000, immutable` on `/assets/*` (hashed filenames) via a Workers `_headers` rule. Expected: better repeat-visit load.
7. Optional: delay or remove the Cloudflare Web Analytics beacon if the Cloudflare auto-injection is not needed (10KB plus the rum call).

## Not verified
- Field CWV (CrUX/INP) and the Leaflet map page were not measured. This run covered the home page and /doctors only.
- Inter font loading was not observed in the requests.
