// auth-send-sms — Supabase Auth "Send SMS" hook.
//
// Supabase Auth calls this (instead of its built-in Twilio integration) every
// time it needs to deliver a phone OTP (sign-up / sign-in / phone change).
// We route the code through WhatsApp (authentication template) and fall back
// to SMS, using the same provider layer as every other message.
//
// Enable: Dashboard → Authentication → Hooks → "Send SMS" → HTTP →
//   URI    https://<ref>.supabase.co/functions/v1/auth-send-sms
//   Secret generate → copy it into the edge-function secret SEND_SMS_HOOK_SECRET
// Deployed with verify_jwt = false (Auth signs the request with the secret,
// Standard Webhooks spec) — see supabase/config.toml.

import { Webhook } from "https://esm.sh/standardwebhooks@1.0.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { normalizePhone, renderTemplate, sendMessage } from "../_shared/messaging.ts";

type HookPayload = {
  user?: { id?: string; phone?: string };
  sms?: { otp?: string };
};

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: { http_code: 405, message: "method_not_allowed" } }, 405);

  const hookSecret = Deno.env.get("SEND_SMS_HOOK_SECRET");
  if (!hookSecret) return json({ error: { http_code: 503, message: "hook_not_configured" } }, 503);

  const raw = await req.text();
  let payload: HookPayload;
  try {
    // Secret format from the dashboard: "v1,whsec_<base64>" (may hold several, "|"-separated).
    const secrets = hookSecret.split("|").map((s) => s.trim().replace(/^v1,whsec_/, "")).filter(Boolean);
    const headers = Object.fromEntries(req.headers);
    let verified: unknown = null;
    let lastErr: unknown = null;
    for (const s of secrets) {
      try {
        verified = new Webhook(s).verify(raw, headers);
        break;
      } catch (e) {
        lastErr = e;
      }
    }
    if (!verified) throw lastErr ?? new Error("signature_invalid");
    payload = verified as HookPayload;
  } catch (e) {
    return json({ error: { http_code: 401, message: `invalid_signature: ${e instanceof Error ? e.message : String(e)}` } }, 401);
  }

  const otp = payload.sms?.otp ?? "";
  const phone = normalizePhone(payload.user?.phone ? (payload.user.phone.startsWith("+") ? payload.user.phone : "+" + payload.user.phone) : "");
  if (!otp || !phone) return json({ error: { http_code: 400, message: "bad_payload" } }, 400);

  // Supabase Auth gives the whole hook ~5 s: keep each provider attempt short.
  const rendered = renderTemplate("otp", { code: otp });
  const out = await sendMessage("auto", phone, rendered, { timeoutMs: 2500 });

  // Audit row, written already TERMINAL (never 'queued' — the cron drain must
  // never pick it up and re-send a template with an empty code). Never stores
  // the code. Best effort, after the decision is made.
  const audit = async () => {
    try {
      const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      await admin.from("outbox_messages").insert({
        to_phone: phone,
        template_key: "otp",
        params: {},
        channel: "auto",
        consent_basis: "transactional",
        status: out.ok ? "sent" : "skipped",
        attempts: 1,
        provider: out.provider,
        provider_message_id: out.providerMessageId ?? null,
        error: out.error ?? null,
        sent_at: out.ok ? new Date().toISOString() : null,
      });
    } catch (e) {
      console.warn("[auth-send-sms] audit failed:", e instanceof Error ? e.message : e);
    }
  };
  // deno-lint-ignore no-explicit-any
  const rt = (globalThis as any).EdgeRuntime;
  if (rt?.waitUntil) rt.waitUntil(audit()); else await audit();

  if (!out.ok) {
    // Provider details go to the logs, not to the end user's error message.
    console.error("[auth-send-sms] send failed:", out.error);
    const msg = out.notConfigured ? "sms_provider_not_configured" : "sms_send_failed";
    return json({ error: { http_code: 500, message: msg } }, 500);
  }
  return json({}, 200);
});
