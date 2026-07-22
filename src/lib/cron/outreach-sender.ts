import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getWhatsAppConfig, sendWhatsAppTemplate } from "@/lib/whatsapp.server";

// --- Throttle & schedule ------------------------------------------------------
const DAILY_CAP = 50; // max WhatsApp outreach messages per day (reputation guard)
const SEND_HOUR_UTC = 9; // ~11:00 in Egypt (UTC+2) — daytime, higher answer rate

// The Meta-approved template the doctor must have registered. Body variables:
//   {{1}} = doctor full name,  {{2}} = claim link
// Suggested Arabic body (register this in WhatsApp Manager):
//   "د. {{1}}، أنشأنا لك ملفاً مجانياً على طبيبي لإدارة طابور عيادتك وحجوزاتك.
//    فعّل ملفك خلال دقيقتين: {{2}}
//    لإلغاء الاشتراك وحذف بياناتك، رد بكلمة: إلغاء"
const OUTREACH_TEMPLATE = "claim_profile_intro";
const OUTREACH_LANG = "ar";

/**
 * Daily WhatsApp outreach to seeded (unclaimed) doctors.
 *
 * Pulls at most DAILY_CAP candidates via get_outreach_candidates (RLS-locked,
 * service-role only), sends each a template message with their tokenized claim
 * link, logs the attempt to doctor_outreach, and flips the listing to
 * 'contacted' on success so no doctor is ever messaged twice. No-ops cleanly if
 * WhatsApp isn't configured yet.
 *
 * Cadence: the Worker cron fires hourly; this self-gates to one run/day.
 */
export async function runOutreachSender(opts: {
  scheduledTime: number;
}): Promise<{ ran: boolean; sent: number; failed: number; errors: string[] }> {
  const result = { ran: false, sent: 0, failed: 0, errors: [] as string[] };

  // Once per day.
  if (new Date(opts.scheduledTime).getUTCHours() !== SEND_HOUR_UTC) return result;

  const config = getWhatsAppConfig();
  if (!config) {
    result.errors.push("whatsapp_not_configured");
    return result;
  }
  result.ran = true;

  const { data: candidates, error } = await supabaseAdmin.rpc("get_outreach_candidates", {
    p_limit: DAILY_CAP,
  });
  if (error) {
    result.errors.push(`candidates_failed: ${error.message}`);
    return result;
  }

  const rows = candidates ?? [];
  const siteUrl = process.env.SITE_URL || "https://mytabibi.com";
  const nowIso = new Date().toISOString();

  for (const r of rows) {
    const claimUrl = `${siteUrl}/claim/${r.claim_token}`;
    const name = (r.full_name ?? "").trim() || "دكتور";

    const send = await sendWhatsAppTemplate({
      config,
      toPhone: r.phone,
      templateName: OUTREACH_TEMPLATE,
      languageCode: OUTREACH_LANG,
      bodyParams: [name, claimUrl],
    });

    if (send.ok) {
      await supabaseAdmin.from("doctor_outreach").insert({
        scraped_doctor_id: r.id,
        channel: "whatsapp",
        template: OUTREACH_TEMPLATE,
        status: "sent",
        provider_message_id: send.messageId,
        attempt: 1,
        sent_at: nowIso,
      });
      // One message per doctor: remove from the candidate pool permanently.
      await supabaseAdmin
        .from("scraped_doctors")
        .update({ listing_status: "contacted" })
        .eq("id", r.id);
      result.sent += 1;
    } else {
      await supabaseAdmin.from("doctor_outreach").insert({
        scraped_doctor_id: r.id,
        channel: "whatsapp",
        template: OUTREACH_TEMPLATE,
        status: "failed",
        error: send.error,
        attempt: 1,
      });
      result.failed += 1;
      result.errors.push(`${r.id}: ${send.error}`);
    }
  }

  return result;
}
