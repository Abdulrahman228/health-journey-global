// ============================================================================
// Paymob transaction webhook (Supabase Edge Function).
//
// Paymob calls this after a payment ("Transaction processed callback"). We
// verify the HMAC signature and, on a successful transaction:
//   • subscription orders  ("{user_id}__{plan}__{uuid}") → activate Gold in
//     public.subscriptions (flips doctor_active_tier() to 'gold' everywhere);
//   • appointment orders   ("appt__{appointment_id}__{uuid}") → record the
//     payment in public.payments and mark the appointment paid/confirmed —
//     the same state the Stripe webhook produces, so receipts, the doctor
//     ledger and the queue all behave identically.
//
// Deployed with verify_jwt = false (supabase/config.toml) — Paymob sends no
// JWT; the HMAC is the authentication.
//
// REQUIRED SECRETS: PAYMOB_HMAC, SUPABASE_SERVICE_ROLE_KEY (auto-injected)
// ============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// The exact ordered fields Paymob concatenates to compute the HMAC.
const HMAC_FIELDS = [
  "amount_cents", "created_at", "currency", "error_occured", "has_parent_transaction",
  "id", "integration_id", "is_3d_secure", "is_auth", "is_capture", "is_refunded",
  "is_standalone_payment", "is_voided", "order.id", "owner", "pending",
  "source_data.pan", "source_data.sub_type", "source_data.type", "success",
];

const PLAN_PERIOD_DAYS: Record<string, number> = {
  doctor_gold_monthly: 30,
  doctor_gold_yearly: 365,
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  try {
    if (req.method !== "POST") return new Response("method not allowed", { status: 405 });
    const hmacSecret = Deno.env.get("PAYMOB_HMAC");
    if (!hmacSecret) return new Response("not configured", { status: 503 });

    const url = new URL(req.url);
    const providedHmac = (url.searchParams.get("hmac") ?? "").toLowerCase();
    const payload = await req.json();
    // TOKEN (card tokenisation) / DELIVERY_STATUS callbacks use another HMAC
    // field set — not ours to handle; acknowledge so Paymob stops retrying.
    if (payload?.type && payload.type !== "TRANSACTION") return new Response("ignored", { status: 200 });
    const obj = payload.obj ?? payload;

    // 1) Verify HMAC (constant-time compare)
    const concatenated = HMAC_FIELDS.map((f) => {
      const v = getPath(obj, f);
      return v == null ? "" : String(v);
    }).join("");
    const expected = await hmacSha512(hmacSecret, concatenated);
    if (!timingSafeEqual(expected, providedHmac)) {
      return new Response("invalid hmac", { status: 401 });
    }

    // 2) Only act on a successful, captured, non-refunded, non-voided payment.
    if (obj.success !== true || obj.is_refunded === true || obj.is_voided === true || obj.pending === true) {
      return new Response("ignored", { status: 200 });
    }
    if (obj.is_auth === true && obj.is_capture !== true) {
      return new Response("ignored (auth only)", { status: 200 });
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const merchant = String(obj.order?.merchant_order_id ?? "");
    const txnId = String(obj.id);
    const amountCents = Number(obj.amount_cents ?? 0);
    const currency = String(obj.currency ?? "EGP").toUpperCase();
    const nowIso = new Date().toISOString();

    // 3a) Appointment payment: "appt__{appointment_id}__{uuid}"
    if (merchant.startsWith("appt__")) {
      const appointmentId = merchant.split("__")[1] ?? "";
      if (!UUID_RE.test(appointmentId)) return new Response("unmapped order", { status: 200 });

      const { data: appt } = await admin
        .from("appointments")
        .select("id, patient_id, doctor_id, status, payment_status, invoice_id, fee, consultation_fee_cents, currency")
        .eq("id", appointmentId)
        .maybeSingle();
      if (!appt) return new Response("appointment not found", { status: 200 });

      // The HMAC proves the callback is ours; the AMOUNT must still match what
      // the appointment costs — never trust the callback's number blindly.
      const expectedCents = appt.consultation_fee_cents ?? (appt.fee != null ? Math.round(Number(appt.fee) * 100) : 0);
      if (currency !== "EGP" || !Number.isInteger(amountCents) || amountCents < expectedCents) {
        console.error("[paymob-webhook] amount mismatch", { appointmentId, amountCents, expectedCents, currency });
        return new Response("amount mismatch", { status: 200 });
      }

      // payments.user_id is NOT NULL → auth.users. A doctor-managed (unclaimed)
      // patient has no user; record the payment under the doctor's user instead
      // of silently dropping it.
      const { data: patientProfile } = await admin
        .from("profiles").select("user_id").eq("id", appt.patient_id).maybeSingle();
      let payerUserId = (patientProfile?.user_id as string | null) ?? null;
      let payerKind = "patient";
      if (!payerUserId && appt.doctor_id) {
        const { data: dd } = await admin
          .from("doctor_details").select("profile_id").eq("id", appt.doctor_id).maybeSingle();
        if (dd?.profile_id) {
          const { data: docProfile } = await admin
            .from("profiles").select("user_id").eq("id", dd.profile_id).maybeSingle();
          payerUserId = (docProfile?.user_id as string | null) ?? null;
          payerKind = "managed_patient_via_doctor";
        }
      }
      if (!payerUserId) {
        console.error("[paymob-webhook] no user to attach payment to", { appointmentId, txnId });
        return new Response("no payer user", { status: 200 });
      }

      // Idempotent payment row: unique (provider, provider_payment_id).
      const { error: payErr } = await admin.from("payments").upsert(
        {
          user_id: payerUserId,
          invoice_id: appt.invoice_id ?? null,
          provider: "paymob",
          provider_payment_id: txnId,
          provider_session_id: merchant,
          amount_cents: amountCents,
          currency,
          status: "succeeded",
          paid_at: nowIso,
          environment: "live",
          raw_payload: {
            order: obj.order?.id, source: obj.source_data?.type, sub_type: obj.source_data?.sub_type,
            integration_id: obj.integration_id, payer: payerKind,
          },
        },
        { onConflict: "provider,provider_payment_id", ignoreDuplicates: true },
      );
      if (payErr) return new Response(`db error: ${payErr.message}`, { status: 500 });

      if (appt.payment_status !== "paid") {
        const update: Record<string, unknown> = {
          payment_status: "paid",
          paid_at: nowIso,
          payment_intent_id: `paymob_${txnId}`,
          payment_environment: "live",
        };
        if (appt.status === "pending") update.status = "confirmed";
        const { error: upErr } = await admin.from("appointments").update(update).eq("id", appointmentId);
        if (upErr) return new Response(`db error: ${upErr.message}`, { status: 500 });
      }
      return new Response("ok", { status: 200 });
    }

    // 3b) Gold subscription: "{user_id}__{plan}__{uuid}"
    const [userId, planCode] = merchant.split("__");
    const periodDays = planCode ? PLAN_PERIOD_DAYS[planCode] : undefined;
    if (!userId || !UUID_RE.test(userId) || !planCode || !periodDays) {
      return new Response("unmapped order", { status: 200 });
    }

    const expectedPlanCents: Record<string, number> = { doctor_gold_monthly: 999_00, doctor_gold_yearly: 9999_00 };
    if (currency !== "EGP" || amountCents < (expectedPlanCents[planCode] ?? Number.MAX_SAFE_INTEGER)) {
      console.error("[paymob-webhook] plan amount mismatch", { userId, planCode, amountCents, currency });
      return new Response("amount mismatch", { status: 200 });
    }

    const now = new Date();
    const end = new Date(now.getTime() + periodDays * 86_400_000);

    // Activate Gold. stripe_* columns are NOT NULL (built for Stripe) → synthetic.
    const { error } = await admin.from("subscriptions").upsert(
      {
        user_id: userId,
        stripe_subscription_id: `paymob_${txnId}`,
        stripe_customer_id: "paymob",
        price_id: planCode,
        plan_code: planCode,
        status: "active",
        current_period_start: now.toISOString(),
        current_period_end: end.toISOString(),
        environment: "live",
        access_status: "verified",
        is_manual: false,
      },
      { onConflict: "stripe_subscription_id" },
    );
    if (error) return new Response(`db error: ${error.message}`, { status: 500 });

    return new Response("ok", { status: 200 });
  } catch (e) {
    return new Response(String((e as Error)?.message ?? e), { status: 500 });
  }
});

function getPath(obj: unknown, path: string): unknown {
  return path.split(".").reduce<unknown>((acc, k) => (acc == null ? acc : (acc as Record<string, unknown>)[k]), obj);
}

async function hmacSha512(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-512" }, false, ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
