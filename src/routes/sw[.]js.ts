/**
 * /sw.js — Tabibi service worker (network-first w/ offline fallback).
 *
 * Served as a same-origin JS asset so it works under any subdomain
 * (apex or doctor-{slug}.mytabibi.com). The actual SW logic lives inline
 * in the response body — no separate bundling required.
 *
 * Strategy:
 *   • Pre-cache app shell on install.
 *   • Network-first for HTML / API; fall back to cached shell on offline.
 *   • Cache-first for static assets in /assets/* with a stale-while-revalidate.
 */
import { createFileRoute } from "@tanstack/react-router";

const SW_VERSION = "tabibi-sw-3";
const SW_BODY = `
const CACHE = "${SW_VERSION}";
const APP_SHELL = ["/", "/manifest.webmanifest"];

// Paths that must NEVER be cached (always go to network) — dynamic data.
const NEVER_CACHE = [
  "/_serverFn/",   // TanStack server function RPCs
  "/api/",         // Any future REST endpoints
  "/_build/",      // Vite/TanStack internal
  "/sw.js",        // The SW itself
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(APP_SHELL)).catch(() => {})
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") {
    self.skipWaiting();
  }
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Bypass dynamic data endpoints — always network, never cached.
  if (NEVER_CACHE.some((prefix) => url.pathname.startsWith(prefix))) {
    return; // Let the browser handle it natively (no respondWith).
  }

  // Static assets: cache-first w/ background revalidation.
  if (url.pathname.startsWith("/assets/") || /\\.(svg|png|jpg|jpeg|webp|woff2?)$/.test(url.pathname)) {
    event.respondWith(
      caches.match(req).then((cached) => {
        const fetcher = fetch(req)
          .then((res) => {
            if (res && res.status === 200) {
              const copy = res.clone();
              caches.open(CACHE).then((c) => c.put(req, copy));
            }
            return res;
          })
          .catch(() => cached);
        return cached || fetcher;
      })
    );
    return;
  }

  // HTML / API: network-first, fallback to cached shell.
  event.respondWith(
    fetch(req)
      .then((res) => {
        if (res && res.status === 200 && (req.headers.get("accept") || "").includes("text/html")) {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy));
        }
        return res;
      })
      .catch(async () => {
        const cached = await caches.match(req);
        if (cached) return cached;
        const fallback = await caches.match("/");
        if (fallback) return fallback;
        return new Response("Offline", { status: 503, statusText: "Offline" });
      })
  );
});
`;

export const Route = createFileRoute("/sw.js")({
  server: {
    handlers: {
      GET: () =>
        new Response(SW_BODY, {
          status: 200,
          headers: {
            "content-type": "application/javascript; charset=utf-8",
            "cache-control": "public, max-age=0, must-revalidate",
            "service-worker-allowed": "/",
          },
        }),
    },
  },
});
