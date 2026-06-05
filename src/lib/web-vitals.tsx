/**
 * Web Vitals client capture.
 *
 * Listens to CLS, LCP, INP, FCP, TTFB on the browser using `web-vitals` v5
 * and posts each sample to `/api/public/web-vitals` via `navigator.sendBeacon`
 * (falls back to `fetch keepalive`). The endpoint inserts into
 * `public.web_vitals_events` for Rank Math performance dashboards.
 *
 * Mounted once in `__root.tsx` via the `<WebVitalsReporter />` component below.
 */
import { useEffect } from "react";

type WebVitalMetric = "CLS" | "LCP" | "INP" | "FCP" | "TTFB";

const SESSION_KEY = "tabibi-rum-session";

function getSessionId(): string {
  if (typeof window === "undefined") return "";
  try {
    let id = sessionStorage.getItem(SESSION_KEY);
    if (!id) {
      id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
      sessionStorage.setItem(SESSION_KEY, id);
    }
    return id;
  } catch {
    return "";
  }
}

function getConnection(): string | null {
  if (typeof navigator === "undefined") return null;
  const c =
    (navigator as unknown as { connection?: { effectiveType?: string } }).connection;
  return c?.effectiveType ?? null;
}

function getDeviceType(ua: string): string {
  if (/tablet|ipad/i.test(ua)) return "tablet";
  if (/mobi|android|iphone/i.test(ua)) return "mobile";
  return "desktop";
}

function buildPayload(metric: WebVitalMetric, value: number, rating: string, delta: number, navigationType: string) {
  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
  return {
    metric,
    value,
    rating,
    delta,
    navigation_type: navigationType,
    url: typeof location !== "undefined" ? location.href : "",
    path: typeof location !== "undefined" ? location.pathname : "",
    referrer: typeof document !== "undefined" ? document.referrer || null : null,
    user_agent: ua,
    connection: getConnection(),
    device_type: getDeviceType(ua),
    viewport_width: typeof window !== "undefined" ? window.innerWidth : null,
    viewport_height: typeof window !== "undefined" ? window.innerHeight : null,
    session_id: getSessionId(),
  };
}

function send(body: Record<string, unknown>) {
  const url = "/api/public/web-vitals";
  const data = JSON.stringify(body);
  try {
    if (typeof navigator !== "undefined" && navigator.sendBeacon) {
      const blob = new Blob([data], { type: "application/json" });
      if (navigator.sendBeacon(url, blob)) return;
    }
  } catch {
    /* fall through */
  }
  fetch(url, {
    method: "POST",
    body: data,
    headers: { "content-type": "application/json" },
    keepalive: true,
  }).catch(() => {});
}

async function start() {
  if (typeof window === "undefined") return;
  // Avoid double-start on HMR
  const w = window as unknown as { __tabibiRumStarted?: boolean };
  if (w.__tabibiRumStarted) return;
  w.__tabibiRumStarted = true;

  try {
    const { onCLS, onLCP, onINP, onFCP, onTTFB } = await import("web-vitals");
    const report = (m: { name: string; value: number; rating: string; delta: number; navigationType: string }) => {
      send(buildPayload(m.name as WebVitalMetric, m.value, m.rating, m.delta, m.navigationType));
    };
    onCLS(report);
    onLCP(report);
    onINP(report);
    onFCP(report);
    onTTFB(report);
  } catch (e) {
    if (typeof console !== "undefined") console.warn("[web-vitals] failed to start", e);
  }
}

export function WebVitalsReporter() {
  useEffect(() => {
    // Defer until idle so we don't compete with hydration / LCP itself
    const win = window as unknown as { requestIdleCallback?: (cb: () => void) => number };
    if (typeof win.requestIdleCallback === "function") {
      win.requestIdleCallback(() => void start());
    } else {
      setTimeout(() => void start(), 1500);
    }
  }, []);
  return null;
}
