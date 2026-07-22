// -----------------------------------------------------------------------------
// WhatsApp Business Cloud API (Meta) — server-only sender.
//
// Cold outreach to numbers that never messaged us MUST use pre-approved TEMPLATE
// messages (Meta policy); free-form text is only allowed inside a 24h customer
// service window. So this only sends templates.
//
// Secrets (set as Cloudflare Worker secrets via `wrangler secret put`, never in
// code): WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID. Optional: WHATSAPP_GRAPH_VERSION.
// -----------------------------------------------------------------------------

export interface WhatsAppConfig {
  token: string;
  phoneNumberId: string;
  graphVersion: string;
}

/** Returns the config if fully set, else null (so callers can no-op cleanly). */
export function getWhatsAppConfig(): WhatsAppConfig | null {
  const token = process.env.WHATSAPP_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneNumberId) return null;
  return {
    token,
    phoneNumberId,
    graphVersion: process.env.WHATSAPP_GRAPH_VERSION || "v21.0",
  };
}

/** Digits-only E.164-ish recipient (Meta wants no '+', no spaces). */
export function toWaRecipient(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  // Egyptian local 01XXXXXXXXX -> 201XXXXXXXXX. Leave already-prefixed numbers.
  if (digits.length === 11 && digits.startsWith("01")) return `20${digits.slice(1)}`;
  return digits;
}

/**
 * Send a template message. `bodyParams` fill the template's {{1}}, {{2}}, …
 * body variables in order. Returns the provider message id.
 */
export async function sendWhatsAppTemplate(opts: {
  config: WhatsAppConfig;
  toPhone: string;
  templateName: string;
  languageCode: string; // e.g. "ar"
  bodyParams: string[];
}): Promise<{ ok: true; messageId: string } | { ok: false; error: string }> {
  const { config, toPhone, templateName, languageCode, bodyParams } = opts;
  const url = `https://graph.facebook.com/${config.graphVersion}/${config.phoneNumberId}/messages`;

  const payload = {
    messaging_product: "whatsapp",
    to: toWaRecipient(toPhone),
    type: "template",
    template: {
      name: templateName,
      language: { code: languageCode },
      components: bodyParams.length
        ? [
            {
              type: "body",
              parameters: bodyParams.map((text) => ({ type: "text", text })),
            },
          ]
        : [],
    },
  };

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
    const json = (await res.json().catch(() => ({}))) as {
      messages?: Array<{ id: string }>;
      error?: { message?: string };
    };
    if (!res.ok) {
      return { ok: false, error: json?.error?.message ?? `HTTP ${res.status}` };
    }
    const messageId = json?.messages?.[0]?.id;
    if (!messageId) return { ok: false, error: "No message id returned" };
    return { ok: true, messageId };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Verify the X-Hub-Signature-256 header on an inbound webhook against the raw
 * body using WHATSAPP_APP_SECRET (HMAC-SHA256). Returns true when no secret is
 * configured (so setup/testing isn't blocked) — set the secret in production.
 */
export async function verifyWhatsAppSignature(rawBody: string, signatureHeader: string | null): Promise<boolean> {
  const appSecret = process.env.WHATSAPP_APP_SECRET;
  if (!appSecret) {
    console.warn("[whatsapp] WHATSAPP_APP_SECRET not set — skipping signature check");
    return true;
  }
  if (!signatureHeader?.startsWith("sha256=")) return false;
  const expected = signatureHeader.slice("sha256=".length);

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(appSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sigBuf = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody));
  const actual = [...new Uint8Array(sigBuf)].map((b) => b.toString(16).padStart(2, "0")).join("");

  // Constant-time-ish compare.
  if (actual.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < actual.length; i++) diff |= actual.charCodeAt(i) ^ expected.charCodeAt(i);
  return diff === 0;
}
