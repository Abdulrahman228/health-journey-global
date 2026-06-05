/**
 * POST /api/public/web-vitals
 *
 * Receives Core Web Vitals samples from `WebVitalsReporter` and inserts them
 * into `public.web_vitals_events`. Uses the anon client so RLS's
 * `wv_anon_insert` policy applies (validates via column CHECK constraints).
 *
 * Accepts:
 *   { metric, value, rating, delta?, navigation_type?, url, path,
 *     referrer?, user_agent?, connection?, device_type?,
 *     viewport_width?, viewport_height?, session_id? }
 *
 * Returns 204 always (best-effort; never block beacon).
 */
import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

let _supabase: ReturnType<typeof createClient<Database>> | null = null;
function getSupabase() {
  if (!_supabase) {
    const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL!;
    const key =
      process.env.SUPABASE_ANON_KEY ||
      process.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
      process.env.VITE_SUPABASE_ANON_KEY!;
    _supabase = createClient<Database>(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return _supabase;
}

const ALLOWED_METRICS = new Set(["CLS", "LCP", "INP", "FCP", "TTFB", "FID"]);
const ALLOWED_RATINGS = new Set(["good", "needs-improvement", "poor"]);

function clip(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  return v.slice(0, max);
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

export const Route = createFileRoute("/api/public/web-vitals")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
          if (!body) return new Response(null, { status: 204 });

          const metric = String(body.metric ?? "");
          const rating = String(body.rating ?? "");
          const value = num(body.value);
          if (!ALLOWED_METRICS.has(metric) || !ALLOWED_RATINGS.has(rating) || value === null) {
            return new Response(null, { status: 204 });
          }

          const path = clip(body.path, 512) ?? "/";
          const url = clip(body.url, 2048) ?? path;

          await getSupabase()
            .from("web_vitals_events")
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .insert({
              metric,
              value,
              rating,
              delta: num(body.delta),
              navigation_type: clip(body.navigation_type, 32),
              url,
              path,
              referrer: clip(body.referrer, 2048),
              user_agent: clip(body.user_agent, 512),
              connection: clip(body.connection, 16),
              device_type: clip(body.device_type, 16),
              viewport_width: num(body.viewport_width),
              viewport_height: num(body.viewport_height),
              session_id: clip(body.session_id, 64),
            } as never);
        } catch (e) {
          if (typeof console !== "undefined") console.warn("[web-vitals] insert failed", e);
        }
        return new Response(null, { status: 204 });
      },
    },
  },
});
