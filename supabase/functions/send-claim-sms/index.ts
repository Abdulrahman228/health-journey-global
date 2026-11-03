// send-claim-sms — the doctor re-sends the "complete your registration" invite
// to one of their unclaimed (managed) patients.
//
// Called by the doctor's app (web + mobile):
//   supabase.functions.invoke("send-claim-sms", { body: { patientProfileId } })
//
// Flow: as the doctor (their JWT, RLS) → request_patient_invite() validates the
// link, creates/reuses the claim token and queues ONE outbox row per day; then
// the queue is drained immediately so the patient gets the WhatsApp/SMS now.
// Automatic welcome messages (on patient creation/import) use the same queue
// via DB triggers — this function is only the manual "send again" button.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { drainOutbox, providersConfigured } from "../_shared/messaging.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" },
  });
}

// Business errors return 200 + {ok:false,error} so the caller reads them cleanly.
const fail = (error: string) => json({ ok: false, error });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader) return fail("missing_authorization");

    const { patientProfileId } = await req.json().catch(() => ({}));
    if (!patientProfileId) return fail("patientProfileId required");

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const asDoctor = createClient(SUPABASE_URL, ANON, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await asDoctor.rpc("request_patient_invite", {
      p_patient_profile_id: patientProfileId,
    });
    if (error) return fail(error.message);
    const res = (data ?? {}) as { ok?: boolean; error?: string; outbox_id?: string };
    if (!res.ok) return fail(res.error ?? "enqueue_failed");

    const providers = providersConfigured();
    if (!providers.whatsapp && !providers.twilio) {
      // Queued; it will go out as soon as a provider is configured.
      return json({ ok: true, queued: true, sent: false, outbox_id: res.outbox_id, warning: "no_provider_configured" });
    }

    const admin = createClient(SUPABASE_URL, SERVICE, { auth: { persistSession: false, autoRefreshToken: false } });
    const drained = await drainOutbox(admin, 10);
    return json({ ok: true, queued: true, sent: drained.sent > 0, outbox_id: res.outbox_id, providers });
  } catch (e) {
    return json({ ok: false, error: String(e instanceof Error ? e.message : e) }, 500);
  }
});
