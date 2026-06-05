import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * Phase 6 — Masked calling.
 *
 * Twilio Programmable Voice integration: when the patient initiates a masked
 * call, the Worker calls Twilio's REST API to dial the patient from
 * TWILIO_PHONE_NUMBER. When the patient answers, inline TwiML connects them
 * to the doctor's real number. Neither party sees the other's number.
 *
 * Falls back to provider='test' (no real call) if either party is missing a
 * phone number, or if Twilio env secrets are absent, or if the API call
 * fails (e.g. trial account restrictions on non-verified destinations).
 */

async function twilioCreateCall(
  to: string,
  twiml: string,
): Promise<{ sid: string; status: string } | { error: string }> {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_PHONE_NUMBER;
  if (!sid || !token || !from) return { error: "twilio_secrets_missing" };
  const auth = btoa(`${sid}:${token}`);
  const body = new URLSearchParams({ To: to, From: from, Twiml: twiml });
  try {
    const r = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${sid}/Calls.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${auth}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body,
      },
    );
    const j = (await r.json()) as { sid?: string; status?: string; message?: string; code?: number };
    if (!r.ok) return { error: `twilio_${j.code ?? r.status}: ${j.message ?? "unknown"}` };
    return { sid: j.sid ?? "", status: j.status ?? "queued" };
  } catch (e) {
    return { error: `twilio_fetch: ${(e as Error).message}` };
  }
}

export const initiateMaskedCall = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      doctorDetailsId: z.string().uuid(),
      appointmentId: z.string().uuid().optional(),
    }).parse,
  )
  .handler(async ({ data, context }) => {
    // Verify there's an active appointment between this patient and doctor
    // before allowing masked call (privacy guard).
    const { data: appt } = await supabaseAdmin
      .from("appointments")
      .select("id, status, doctor_id")
      .eq("doctor_id", data.doctorDetailsId)
      .eq("patient_id", context.userId)
      .in("status", ["confirmed", "in_progress", "completed"])
      .order("appointment_date", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!appt) {
      throw new Error("لا توجد موعد سابق أو حالي مع هذا الطبيب");
    }

    // Resolve patient + doctor phones from user_contacts.
    const { data: ddRaw } = await supabaseAdmin
      .from("doctor_details")
      .select("profile_id")
      .eq("id", data.doctorDetailsId)
      .maybeSingle();
    const dd = ddRaw as { profile_id: string | null } | null;
    const doctorProfileId = dd?.profile_id;

    const phoneIds: string[] = [context.userId];
    if (doctorProfileId) phoneIds.push(doctorProfileId);
    const { data: contactsRaw } = await supabaseAdmin
      .from("user_contacts")
      .select("user_id, phone")
      .in("user_id", phoneIds);
    const contacts = (contactsRaw ?? []) as Array<{ user_id: string; phone: string | null }>;
    const patientPhone = contacts.find((c) => c.user_id === context.userId)?.phone ?? null;
    const doctorPhone = doctorProfileId
      ? (contacts.find((c) => c.user_id === doctorProfileId)?.phone ?? null)
      : null;

    const proxyNumber = process.env.TWILIO_PHONE_NUMBER ?? "+1-555-TABIBI";
    let provider: "test" | "twilio" = "test";
    let twilioSid: string | null = null;
    let twilioError: string | null = null;

    if (patientPhone && doctorPhone && process.env.TWILIO_ACCOUNT_SID) {
      const escDoctor = doctorPhone.replace(/[^+0-9]/g, "");
      const twiml =
        `<Response><Say language="ar-SA" voice="Polly.Zeina">جارٍ توصيلك بالطبيب الآن، يرجى الانتظار</Say>` +
        `<Dial callerId="${proxyNumber}" timeout="30">${escDoctor}</Dial></Response>`;
      const result = await twilioCreateCall(patientPhone, twiml);
      if ("sid" in result) {
        provider = "twilio";
        twilioSid = result.sid;
      } else {
        twilioError = result.error;
      }
    } else if (!patientPhone || !doctorPhone) {
      twilioError = "missing_phone";
    }

    const { data: session, error } = await supabaseAdmin
      .from("masked_call_sessions")
      .insert({
        appointment_id: appt.id,
        doctor_details_id: data.doctorDetailsId,
        patient_profile_id: context.userId,
        initiated_by: context.userId,
        provider,
        proxy_number: proxyNumber,
        status: provider === "twilio" ? "ringing" : "queued",
        provider_call_sid: twilioSid,
        provider_error: twilioError,
      })
      .select("id, proxy_number, status")
      .single();
    if (error) throw new Error(error.message);
    return { ...session, provider, twilioError };
  });

export const listMyCalls = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: profRaw } = await supabaseAdmin
      .from("profiles")
      .select("role")
      .eq("id", context.userId)
      .maybeSingle();
    const prof = profRaw as { role: string | null } | null;

    let query = supabaseAdmin
      .from("masked_call_sessions")
      .select("id, status, proxy_number, started_at, ended_at, duration_seconds, created_at, doctor_details_id, patient_profile_id")
      .order("created_at", { ascending: false })
      .limit(50);

    if (prof?.role === "doctor") {
      const { data: dd } = await supabaseAdmin
        .from("doctor_details")
        .select("id")
        .eq("profile_id", context.userId)
        .maybeSingle();
      if (!dd) return [];
      query = query.eq("doctor_details_id", dd.id);
    } else {
      query = query.eq("patient_profile_id", context.userId);
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return data ?? [];
  });
