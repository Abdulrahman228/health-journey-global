// ============================================================================
// Shared outbound messaging for Supabase Edge Functions (Deno).
//
// ONE place that knows how to talk to the providers:
//   • WhatsApp Business Cloud API (Meta)  — preferred in Egypt (cheap, read rate)
//   • Twilio SMS                          — fallback / SMS-only numbers
//
// Used by: send-outbox (queue drain), auth-send-sms (OTP hook),
//          send-claim-sms (manual invite from the doctor's app).
//
// Secrets (Dashboard → Edge Functions → Secrets; never in code):
//   WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID, [WHATSAPP_GRAPH_VERSION=v21.0]
//   WHATSAPP_TEMPLATE_WELCOME (default patient_welcome), WHATSAPP_TEMPLATE_OTP (default otp_code)
//   TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_FROM | TWILIO_MESSAGING_SERVICE_SID
//   SITE_URL (default https://mytabibi.com)
// ============================================================================

export type Channel = "auto" | "whatsapp" | "sms";

export interface OutboxRow {
  id: string;
  channel: Channel;
  to_phone: string;
  template_key: string;
  params: Record<string, unknown>;
  locale: string;
  attempts: number;
  max_attempts: number;
}

export interface SendOutcome {
  ok: boolean;
  provider: "whatsapp" | "twilio" | null;
  providerMessageId?: string;
  error?: string;
  /** true when no provider is configured at all (leave queued, don't burn attempts) */
  notConfigured?: boolean;
  /** WhatsApp said the number cannot receive WhatsApp → SMS may be tried */
  fallback?: boolean;
}

// --- Phone helpers -----------------------------------------------------------
const AR_DIGITS = "٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹";
export function normalizePhone(raw: string | null | undefined): string | null {
  if (!raw) return null;
  let v = "";
  for (const ch of String(raw)) {
    const i = AR_DIGITS.indexOf(ch);
    v += i >= 0 ? String(i % 10) : ch;
  }
  v = v.replace(/[^0-9+]/g, "");
  v = v.startsWith("+") ? "+" + v.slice(1).replace(/\+/g, "") : v.replace(/\+/g, "");
  if (!v || v === "+") return null;
  if (v.startsWith("00")) v = "+" + v.slice(2);
  else if (v.startsWith("+")) { /* keep */ }
  else if (/^0(10|11|12|15)\d{8}$/.test(v)) v = "+20" + v.slice(1);
  else if (/^(10|11|12|15)\d{8}$/.test(v)) v = "+20" + v;
  else if (/^20(10|11|12|15)\d{8}$/.test(v)) v = "+" + v;
  else if (/^[1-9]\d{7,14}$/.test(v)) v = "+" + v;
  else return null;
  return /^\+[1-9]\d{7,14}$/.test(v) ? v : null;
}

export function siteUrl(): string {
  return (Deno.env.get("SITE_URL") ?? "https://mytabibi.com").replace(/\/+$/, "");
}

// --- Templates ---------------------------------------------------------------
// SMS bodies are rendered here. WhatsApp uses pre-approved templates registered
// in Meta WhatsApp Manager with the SAME variable order (see docs/messaging.md).
export interface Rendered {
  smsBody: string;
  whatsapp: { template: string; lang: string; bodyParams: string[]; authCode?: string } | null;
}

function str(v: unknown): string {
  return v == null ? "" : String(v);
}

export function renderTemplate(key: string, params: Record<string, unknown>): Rendered {
  const site = siteUrl();
  switch (key) {
    case "patient_welcome": {
      const doctor = str(params.doctor_name) || "طبيبك";
      const link = params.claim_token ? `${site}/claim/${str(params.claim_token)}` : `${site}/signup`;
      return {
        smsBody:
          `طبانا Tebana: تم تسجيلك لدى د. ${doctor}. ` +
          `حمّل التطبيق وسجّل بنفس رقمك لاستلام ملفك الطبي ومتابعة مواعيدك: ${link} ` +
          `— للإلغاء أرسل: إلغاء`,
        whatsapp: {
          template: Deno.env.get("WHATSAPP_TEMPLATE_WELCOME") ?? "patient_welcome",
          lang: "ar",
          bodyParams: [doctor, link],
        },
      };
    }
    case "otp": {
      const code = str(params.code);
      return {
        smsBody: `رمز الدخول لطبانا: ${code}\nصالح لمدة 10 دقائق. لا تشاركه مع أحد.`,
        whatsapp: {
          template: Deno.env.get("WHATSAPP_TEMPLATE_OTP") ?? "otp_code",
          lang: "ar",
          bodyParams: [code],
          authCode: code,
        },
      };
    }
    case "appointment_reminder": {
      const doctor = str(params.doctor_name) || "طبيبك";
      const when = str(params.when);
      return {
        smsBody: `طبانا: تذكير بموعدك مع د. ${doctor} ${when}. لإدارة الموعد: ${site}/appointments`,
        whatsapp: {
          template: Deno.env.get("WHATSAPP_TEMPLATE_REMINDER") ?? "appointment_reminder",
          lang: "ar",
          bodyParams: [doctor, when],
        },
      };
    }
    default:
      return { smsBody: str(params.text), whatsapp: null };
  }
}

// --- WhatsApp Cloud API ------------------------------------------------------
function waConfig() {
  const token = Deno.env.get("WHATSAPP_TOKEN");
  const phoneNumberId = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID");
  if (!token || !phoneNumberId) return null;
  return { token, phoneNumberId, graph: Deno.env.get("WHATSAPP_GRAPH_VERSION") ?? "v21.0" };
}

// Meta error codes that mean "this number cannot receive WhatsApp" → fall back to SMS.
const WA_NOT_WHATSAPP = new Set([131026, 131030, 131047, 131051, 131053, 1013, 470]);

async function sendWhatsApp(toE164: string, r: Rendered, timeoutMs: number): Promise<SendOutcome> {
  const cfg = waConfig();
  if (!cfg || !r.whatsapp) return { ok: false, provider: null, notConfigured: true, error: "whatsapp_not_configured" };

  const components: unknown[] = [];
  if (r.whatsapp.bodyParams.length) {
    components.push({
      type: "body",
      parameters: r.whatsapp.bodyParams.map((text) => ({ type: "text", text })),
    });
  }
  // Authentication templates carry the code in a copy-code button too.
  if (r.whatsapp.authCode) {
    components.push({
      type: "button",
      sub_type: "url",
      index: "0",
      parameters: [{ type: "text", text: r.whatsapp.authCode }],
    });
  }

  const res = await fetch(`https://graph.facebook.com/${cfg.graph}/${cfg.phoneNumberId}/messages`, {
    method: "POST",
    signal: AbortSignal.timeout(timeoutMs),
    headers: { Authorization: `Bearer ${cfg.token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: toE164.replace(/^\+/, ""),
      type: "template",
      template: { name: r.whatsapp.template, language: { code: r.whatsapp.lang }, components },
    }),
  });
  const json = (await res.json().catch(() => ({}))) as {
    messages?: Array<{ id: string }>;
    error?: { message?: string; code?: number };
  };
  if (!res.ok) {
    const code = json?.error?.code;
    const msg = json?.error?.message ?? `HTTP ${res.status}`;
    return {
      ok: false,
      provider: "whatsapp",
      error: `whatsapp:${code ?? ""}:${msg}`,
      notConfigured: false,
      // "not a WhatsApp user" → the caller may try SMS without retrying WhatsApp
      fallback: Boolean(code && WA_NOT_WHATSAPP.has(code)),
    };
  }
  const id = json?.messages?.[0]?.id;
  return id ? { ok: true, provider: "whatsapp", providerMessageId: id } : { ok: false, provider: "whatsapp", error: "whatsapp:no_message_id" };
}

// --- Twilio SMS --------------------------------------------------------------
function twilioConfig() {
  const sid = Deno.env.get("TWILIO_ACCOUNT_SID");
  const token = Deno.env.get("TWILIO_AUTH_TOKEN");
  const from = Deno.env.get("TWILIO_FROM");
  const mss = Deno.env.get("TWILIO_MESSAGING_SERVICE_SID");
  if (!sid || !token || (!from && !mss)) return null;
  return { sid, token, from, mss };
}

async function sendTwilioSms(toE164: string, body: string, timeoutMs: number): Promise<SendOutcome> {
  const cfg = twilioConfig();
  if (!cfg) return { ok: false, provider: null, notConfigured: true, error: "twilio_not_configured" };
  const params = new URLSearchParams({ To: toE164, Body: body });
  if (cfg.mss) params.set("MessagingServiceSid", cfg.mss);
  else params.set("From", cfg.from!);
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${cfg.sid}/Messages.json`, {
    method: "POST",
    signal: AbortSignal.timeout(timeoutMs),
    headers: {
      Authorization: `Basic ${btoa(`${cfg.sid}:${cfg.token}`)}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });
  const json = (await res.json().catch(() => ({}))) as { sid?: string; message?: string; code?: number };
  if (!res.ok) return { ok: false, provider: "twilio", error: `twilio:${json?.code ?? res.status}:${json?.message ?? ""}` };
  return { ok: true, provider: "twilio", providerMessageId: json.sid };
}

// --- Routing -----------------------------------------------------------------
/**
 * Send one rendered message over the requested channel.
 *  auto      → WhatsApp first (if configured), SMS when WhatsApp is not
 *              configured or the number is not on WhatsApp.
 *  whatsapp  → WhatsApp only.   sms → Twilio only.
 */
export async function sendMessage(
  channel: Channel,
  toPhone: string,
  r: Rendered,
  opts: { timeoutMs?: number } = {},
): Promise<SendOutcome> {
  const to = normalizePhone(toPhone);
  if (!to) return { ok: false, provider: null, error: "invalid_phone" };
  const timeoutMs = opts.timeoutMs ?? 8000;

  try {
    if (channel === "sms") return await sendTwilioSms(to, r.smsBody, timeoutMs);
    if (channel === "whatsapp") return await sendWhatsApp(to, r, timeoutMs);

    const wa = await sendWhatsApp(to, r, timeoutMs);
    if (wa.ok) return wa;
    const shouldFallback = wa.notConfigured || wa.fallback;
    if (!shouldFallback) return wa; // a real WhatsApp error (auth, template…) → retry later, don't double-send
    const sms = await sendTwilioSms(to, r.smsBody, timeoutMs);
    if (sms.ok) return sms;
    return {
      ok: false,
      provider: sms.provider ?? wa.provider,
      notConfigured: Boolean(wa.notConfigured && sms.notConfigured),
      error: [wa.error, sms.error].filter(Boolean).join(" | "),
    };
  } catch (e) {
    // Network/timeout failures never escape: the caller marks the row and moves on.
    return { ok: false, provider: null, error: `exception:${e instanceof Error ? e.message : String(e)}` };
  }
}

export function providersConfigured(): { whatsapp: boolean; twilio: boolean } {
  return { whatsapp: Boolean(waConfig()), twilio: Boolean(twilioConfig()) };
}

// --- Queue drain -------------------------------------------------------------
// Minimal shape of a supabase-js client (rpc returns a thenable builder).
type AdminClient = {
  // deno-lint-ignore no-explicit-any
  rpc: (fn: string, args?: Record<string, unknown>) => PromiseLike<{ data: any; error: { message: string } | null }>;
};

export async function drainOutbox(admin: AdminClient, limit = 25): Promise<{ picked: number; sent: number; failed: number; skipped: number; errors: string[] }> {
  const result = { picked: 0, sent: 0, failed: 0, skipped: 0, errors: [] as string[] };
  const configured = providersConfigured();
  if (!configured.whatsapp && !configured.twilio) {
    result.errors.push("no_provider_configured");
    return result; // leave everything queued; nothing is consumed
  }

  const { data, error } = await admin.rpc("outbox_claim_batch", { p_limit: limit });
  if (error) {
    result.errors.push(`claim_batch: ${error.message}`);
    return result;
  }
  const rows = (data ?? []) as OutboxRow[];
  result.picked = rows.length;

  // supabase-js rpc() reports failures in { error } (it does not throw) — throw
  // so the catch below records it instead of silently leaving the row 'sending'.
  const mark = async (args: Record<string, unknown>) => {
    const { error: markErr } = await admin.rpc("outbox_mark", args);
    if (markErr) throw new Error(markErr.message);
  };

  for (const row of rows) {
    const rendered = renderTemplate(row.template_key, row.params ?? {});
    if (!rendered.smsBody && !rendered.whatsapp) {
      await mark({ p_id: row.id, p_status: "skipped", p_error: "unknown_template" }).catch((e) =>
        result.errors.push(`${row.id}: mark_failed ${e instanceof Error ? e.message : String(e)}`),
      );
      result.skipped++;
      continue;
    }
    let out: SendOutcome;
    try {
      out = await sendMessage(row.channel, row.to_phone, rendered);
    } catch (e) {
      out = { ok: false, provider: null, error: `exception:${e instanceof Error ? e.message : String(e)}` };
    }
    try {
      if (out.ok) {
        await mark({
          p_id: row.id, p_status: "sent", p_provider: out.provider, p_provider_message_id: out.providerMessageId ?? null,
        });
        result.sent++;
      } else if (out.notConfigured) {
        // The channel this row insists on has no provider yet: park it without burning attempts.
        await mark({ p_id: row.id, p_status: "requeue", p_error: out.error ?? "provider_not_configured" });
        result.skipped++;
      } else {
        await mark({ p_id: row.id, p_status: "failed", p_provider: out.provider, p_error: out.error ?? "send_failed" });
        result.failed++;
        if (out.error) result.errors.push(`${row.id}: ${out.error}`);
      }
    } catch (e) {
      // outbox_mark itself failed (DB hiccup): the stale-'sending' sweeper in
      // outbox_claim_batch returns the row to the queue after 10 minutes.
      result.errors.push(`${row.id}: mark_failed ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return result;
}
