// send-outbox — drains public.outbox_messages through WhatsApp / Twilio.
//
// Callers (all server-side, never the browser):
//   • pg_cron job "outbox-drain" every minute   → header x-outbox-secret
//   • web server functions right after enqueue  → Authorization: Bearer <service role>
//   • other edge functions (send-claim-sms)      → direct import of drainOutbox()
//
// Deployed with verify_jwt = false (supabase/config.toml) because pg_net sends
// no user JWT; authentication is the shared secret / service-role key below.
//
// Secrets: OUTBOX_WORKER_SECRET (+ provider secrets, see _shared/messaging.ts)

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { drainOutbox, providersConfigured } from "../_shared/messaging.ts";

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function authorized(req: Request): boolean {
  const secret = Deno.env.get("OUTBOX_WORKER_SECRET") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const hdr = req.headers.get("x-outbox-secret") ?? "";
  if (secret && hdr && timingSafeEqual(hdr, secret)) return true;
  const bearer = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (serviceKey && bearer && timingSafeEqual(bearer, serviceKey)) return true;
  return false;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  if (!authorized(req)) return json({ error: "unauthorized" }, 401);

  const body = (await req.json().catch(() => ({}))) as { limit?: number };
  const limit = Math.max(1, Math.min(Number(body.limit ?? 25) || 25, 100));

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  try {
    const result = await drainOutbox(admin, limit);
    return json({ ok: true, providers: providersConfigured(), ...result });
  } catch (e) {
    return json({ ok: false, error: e instanceof Error ? e.message : String(e) }, 500);
  }
});
