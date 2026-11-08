// ============================================================================
// Paymob payment initiation (Supabase Edge Function).
//
// Runs the standard Paymob "Accept" flow (auth token → order → payment key)
// and returns the hosted checkout URL (cards + Vodafone Cash/wallets + Fawry
// depending on the integration ids). On success Paymob calls paymob-webhook,
// which activates the subscription or marks the appointment paid.
//
// Body (JSON):
//   { planCode: "doctor_gold_monthly" | "doctor_gold_yearly" }   – Gold subscription (mobile + web)
//   { kind: "appointment", appointmentId: "<uuid>" }             – consultation fee (patient)
//
// merchant_order_id encodes who/what for the webhook:
//   subscription → "{user_id}__{planCode}__{uuid}"
//   appointment  → "appt__{appointment_id}__{uuid}"
//
// REQUIRED SECRETS (set via `supabase secrets set`, never committed):
//   PAYMOB_API_KEY, PAYMOB_INTEGRATION_ID (card), PAYMOB_IFRAME_ID
// OPTIONAL: PAYMOB_WALLET_INTEGRATION_ID (mobile wallets), SITE_URL
// The caller must send a valid Supabase user JWT (Authorization: Bearer …).
// ============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const PAYMOB_BASE = "https://accept.paymob.com/api";

// Gold prices in EGP (mirror src/lib/plans.ts). Amount is charged in piasters.
const PLAN_AMOUNT_CENTS: Record<string, number> = {
  doctor_gold_monthly: 999_00,
  doctor_gold_yearly: 9999_00,
  doctor_gold_lifetime: 19999_00,
};

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const apiKey = Deno.env.get("PAYMOB_API_KEY");
    const integrationId = Deno.env.get("PAYMOB_INTEGRATION_ID");
    const iframeId = Deno.env.get("PAYMOB_IFRAME_ID");
    if (!apiKey || !integrationId || !iframeId) {
      return json({ error: "Paymob is not configured yet." }, 503);
    }

    // Identify the caller from their Supabase JWT.
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: req.headers.get("Authorization") ?? "" } } },
    );
    const { data: userData } = await supabase.auth.getUser();
    const user = userData.user;
    if (!user) return json({ error: "Unauthorized" }, 401);

    const body = (await req.json().catch(() => ({}))) as {
      planCode?: string;
      kind?: string;
      appointmentId?: string;
    };

    let amountCents: number;
    let merchantOrderId: string;
    let description: string;

    if (body.kind === "appointment") {
      // ---- Consultation fee: server-authoritative amount from the appointment
      const appointmentId = String(body.appointmentId ?? "");
      if (!UUID_RE.test(appointmentId)) return json({ error: "Invalid appointmentId" }, 400);

      // RLS: the patient can only read their own appointment.
      const { data: appt, error: apptErr } = await supabase
        .from("appointments")
        .select("id, patient_id, status, payment_status, fee, consultation_fee_cents, currency")
        .eq("id", appointmentId)
        .maybeSingle();
      if (apptErr || !appt) return json({ error: "Appointment not found" }, 404);
      if (appt.payment_status === "paid") return json({ error: "Already paid" }, 409);
      if (["cancelled", "no_show", "completed"].includes(String(appt.status))) {
        return json({ error: "Appointment is not payable" }, 409);
      }
      if (appt.currency && String(appt.currency).toUpperCase() !== "EGP") {
        return json({ error: "Only EGP appointments can be paid through Paymob" }, 400);
      }
      // appointments.fee is authoritative (applyCoupon rewrites it; the legacy
      // Stripe-only consultation_fee_cents is not). paymob-webhook mirrors this.
      const cents = appt.fee != null
        ? Math.round(Number(appt.fee) * 100)
        : (appt.consultation_fee_cents ?? 0);
      if (!Number.isInteger(cents) || cents < 100) return json({ error: "Appointment has no payable fee" }, 400);

      amountCents = cents;
      merchantOrderId = `appt__${appointmentId}__${crypto.randomUUID()}`;
      description = `Tebana appointment ${appointmentId}`;
    } else {
      // ---- Gold subscription (existing flow)
      const planCode = String(body.planCode ?? "");
      const planAmount = PLAN_AMOUNT_CENTS[planCode];
      if (!planAmount) return json({ error: "Unknown plan" }, 400);
      amountCents = planAmount;
      merchantOrderId = `${user.id}__${planCode}__${crypto.randomUUID()}`;
      description = `Tebana ${planCode}`;
    }

    // Billing data: Paymob requires every field; use the real phone when we have it.
    const phone = user.phone ? `+${user.phone.replace(/^\+/, "")}` : "+200000000000";
    const email = user.email ?? `${user.id}@users.mytabibi.com`;
    const fullName = String(user.user_metadata?.full_name ?? "Tebana User").trim();
    const [firstName, ...restName] = fullName.split(/\s+/);
    const lastName = restName.join(" ") || "User";

    // 1) Auth token
    const auth = await pmPost(`${PAYMOB_BASE}/auth/tokens`, { api_key: apiKey });
    const token = auth.token as string;

    // 2) Order (merchant_order_id carries who + what for the webhook).
    const order = await pmPost(`${PAYMOB_BASE}/ecommerce/orders`, {
      auth_token: token,
      delivery_needed: false,
      amount_cents: amountCents,
      currency: "EGP",
      merchant_order_id: merchantOrderId,
      items: [{ name: description, amount_cents: amountCents, quantity: 1, description }],
    });

    // 3) Payment key
    const paymentKey = await pmPost(`${PAYMOB_BASE}/acceptance/payment_keys`, {
      auth_token: token,
      amount_cents: amountCents,
      expiration: 3600,
      order_id: order.id,
      currency: "EGP",
      integration_id: Number(integrationId),
      billing_data: {
        email,
        first_name: firstName || "Tebana",
        last_name: lastName,
        phone_number: phone,
        apartment: "NA", floor: "NA", street: "NA", building: "NA",
        shipping_method: "NA", postal_code: "NA", city: "NA", country: "EG", state: "NA",
      },
    });

    const url = `${PAYMOB_BASE}/acceptance/iframes/${iframeId}?payment_token=${paymentKey.token}`;
    return json({ url, merchantOrderId, amountCents });
  } catch (e) {
    return json({ error: String((e as Error)?.message ?? e) }, 500);
  }
});

async function pmPost(url: string, body: unknown) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Paymob ${url} → ${res.status}`);
  return res.json();
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}
