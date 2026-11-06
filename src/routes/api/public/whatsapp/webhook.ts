import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { verifyWhatsAppSignature } from "@/lib/whatsapp.server";
import { normalizeArabicText } from "@/lib/arabic";

// Opt-out keywords (normalized): English + Arabic variants of stop/cancel/no.
const STOP_KEYWORDS = new Set(
  ["stop", "unsubscribe", "cancel", "الغاء", "الغي", "لا", "توقف", "ايقاف"].map((w) =>
    normalizeArabicText(w),
  ),
);

function isStopKeyword(text: string): boolean {
  const norm = normalizeArabicText(text ?? "");
  if (!norm) return false;
  if (STOP_KEYWORDS.has(norm)) return true;
  const first = norm.split(/\s+/)[0];
  return STOP_KEYWORDS.has(first);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function handleEvent(body: any): Promise<void> {
  for (const entry of body?.entry ?? []) {
    for (const change of entry?.changes ?? []) {
      const value = change?.value ?? {};

      // 1) Inbound messages → STOP/إلغاء handling (immediate opt-out).
      for (const msg of value?.messages ?? []) {
        const from: string | undefined = msg?.from;
        const text: string = msg?.text?.body ?? "";
        if (from && isStopKeyword(text)) {
          // Patients / any recipient of the outbox queue (welcome, reminders…).
          const { error: optErr } = await supabaseAdmin.rpc("outbox_opt_out", {
            p_phone: from,
            p_channel: "all",
            p_reason: "inbound_reply",
          });
          if (optErr) console.error("[whatsapp webhook] outbox_opt_out failed", optErr.message);

          // Seeded-doctor outreach list. opt_out_scraped_by_phone RETURNS void
          // (it matches RIGHT(phone, 10)), so resolve the affected rows first —
          // previously `affected` was always null and no 'stopped' row was logged.
          const last10 = from.replace(/\D/g, "").slice(-10);
          const { data: affected } =
            last10.length === 10
              ? await supabaseAdmin
                  .from("scraped_doctors")
                  .select("id")
                  .like("phone", `%${last10}`)
                  .eq("opted_out", false)
              : { data: [] as { id: string }[] };
          const { error: scrapedErr } = await supabaseAdmin.rpc("opt_out_scraped_by_phone", {
            p_phone: from,
          });
          if (scrapedErr) {
            console.error("[whatsapp webhook] opt_out_scraped_by_phone failed", scrapedErr.message);
          }
          for (const a of affected ?? []) {
            await supabaseAdmin.from("doctor_outreach").insert({
              scraped_doctor_id: a.id,
              channel: "whatsapp",
              template: "opt_out",
              status: "stopped",
            });
          }
        }
      }

      // 2) Delivery status updates → reflect on the outreach log.
      for (const st of value?.statuses ?? []) {
        const id: string | undefined = st?.id;
        const status: string | undefined = st?.status; // sent | delivered | read | failed
        if (id && status && ["delivered", "read", "failed"].includes(status)) {
          await supabaseAdmin
            .from("doctor_outreach")
            .update({ status })
            .eq("provider_message_id", id);
          await supabaseAdmin.rpc("outbox_delivery_update", {
            p_provider_message_id: id,
            p_provider_status: status,
          });
        }
      }
    }
  }
}

export const Route = createFileRoute("/api/public/whatsapp/webhook")({
  server: {
    handlers: {
      // Meta webhook verification handshake.
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const mode = url.searchParams.get("hub.mode");
        const token = url.searchParams.get("hub.verify_token");
        const challenge = url.searchParams.get("hub.challenge");
        if (mode === "subscribe" && token && token === process.env.WHATSAPP_VERIFY_TOKEN) {
          return new Response(challenge ?? "", {
            status: 200,
            headers: { "content-type": "text/plain" },
          });
        }
        return new Response("forbidden", { status: 403 });
      },

      // Inbound events (messages + statuses).
      POST: async ({ request }) => {
        const raw = await request.text();
        const sigOk = await verifyWhatsAppSignature(
          raw,
          request.headers.get("x-hub-signature-256"),
        );
        if (!sigOk) return new Response("invalid signature", { status: 401 });

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let body: any;
        try {
          body = JSON.parse(raw);
        } catch {
          return Response.json({ received: true });
        }

        try {
          await handleEvent(body);
        } catch (e) {
          // Always 200 so Meta doesn't storm retries; log for diagnostics.
          console.error("[whatsapp webhook] error:", e);
        }
        return Response.json({ received: true });
      },
    },
  },
});
