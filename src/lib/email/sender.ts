/**
 * Resend REST API email sender.
 *
 * Uses `fetch` directly so it works on Cloudflare Workers without a Node SDK.
 * Gracefully no-ops when `RESEND_API_KEY` is missing — never throws on prod
 * configs that haven't enabled email yet.
 *
 * Setup (one-time, on macOS/Linux/Windows with Wrangler):
 *   wrangler secret put RESEND_API_KEY
 *   wrangler secret put EMAIL_FROM   # optional, defaults to noreply@mytabibi.com
 *
 * DNS for mytabibi.com (Resend dashboard generates exact records):
 *   MX, SPF (TXT), DKIM (CNAME × 3) — required for deliverability.
 */

export type EmailMessage = {
  to: string;
  subject: string;
  html: string;
  /** Optional plain-text fallback (auto-derived from HTML if omitted). */
  text?: string;
  /** Override Reply-To (default: support@mytabibi.com). */
  replyTo?: string;
  /** Tags for analytics in the Resend dashboard. */
  tags?: Array<{ name: string; value: string }>;
};

export type SendResult =
  | { ok: true; id: string }
  | { ok: false; skipped: true; reason: string } // soft fail — config missing
  | { ok: false; skipped: false; error: string }; // hard fail — recipient or API error

const RESEND_ENDPOINT = "https://api.resend.com/emails";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Strip HTML tags for a quick text fallback. */
function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|tr|h\d)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function sendEmail(msg: EmailMessage): Promise<SendResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM ?? "Tabibi <noreply@mytabibi.com>";

  if (!apiKey) {
    return { ok: false, skipped: true, reason: "RESEND_API_KEY not set" };
  }
  if (!EMAIL_REGEX.test(msg.to)) {
    return { ok: false, skipped: false, error: "Invalid recipient address" };
  }

  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [msg.to],
        subject: msg.subject,
        html: msg.html,
        text: msg.text ?? htmlToText(msg.html),
        reply_to: msg.replyTo ?? "support@mytabibi.com",
        ...(msg.tags && msg.tags.length > 0 && { tags: msg.tags }),
      }),
    });

    if (!res.ok) {
      const errorText = await res.text();
      return {
        ok: false,
        skipped: false,
        error: `Resend ${res.status}: ${errorText.slice(0, 200)}`,
      };
    }

    const json = (await res.json()) as { id?: string };
    if (!json.id) {
      return { ok: false, skipped: false, error: "Resend response missing id" };
    }
    return { ok: true, id: json.id };
  } catch (err) {
    return {
      ok: false,
      skipped: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/** Returns true when email sending is configured and ready. */
export function isEmailEnabled(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}
