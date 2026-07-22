// ============================================================================
// Paymob payment initiation (Supabase Edge Function).
//
// The mobile app calls this to start a Gold subscription payment. It runs the
// standard Paymob "Accept" flow (auth token → order → payment key) and returns
// the hosted iframe URL, which the app opens IN-APP (Custom Tab / SafariView).
// On a successful payment, `paymob-webhook` activates the subscription.
//
// REQUIRED SECRETS (set via `supabase secrets set`, never committed):
//   PAYMOB_API_KEY         — your Paymob API key
//   PAYMOB_INTEGRATION_ID  — the card integration id
//   PAYMOB_IFRAME_ID       — the iframe id used to render checkout
// The caller must send a valid Supabase user JWT (Authorization: Bearer …).
// ============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const PAYMOB_BASE = "https://accept.paymob.com/api";

// Gold prices in EGP (mirror src/lib/plans.ts). Amount is charged in piasters.
const PLAN_AMOUNT_CENTS: Record<string, number> = {
  doctor_gold_monthly: 999_00,
  doctor_gold_yearly: 9999_00,
};

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

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

    const { planCode } = await req.json().catch(() => ({ planCode: "" }));
    const amountCents = PLAN_AMOUNT_CENTS[planCode];
    if (!amountCents) return json({ error: "Unknown plan" }, 400);

    // 1) Auth token
    const auth = await pmPost(`${PAYMOB_BASE}/auth/tokens`, { api_key: apiKey });
    const token = auth.token as string;

    // 2) Order (merchant_order_id carries who + what for the webhook).
    const merchantOrderId = `${user.id}__${planCode}__${crypto.randomUUID()}`;
    const order = await pmPost(`${PAYMOB_BASE}/ecommerce/orders`, {
      auth_token: token,
      delivery_needed: false,
      amount_cents: amountCents,
      currency: "EGP",
      merchant_order_id: merchantOrderId,
      items: [],
    });

    // 3) Payment key
    const email = user.email ?? "doctor@mytabibi.com";
    const paymentKey = await pmPost(`${PAYMOB_BASE}/acceptance/payment_keys`, {
      auth_token: token,
      amount_cents: amountCents,
      expiration: 3600,
      order_id: order.id,
      currency: "EGP",
      integration_id: Number(integrationId),
      billing_data: {
        email,
        first_name: "Tabibi",
        last_name: "Doctor",
        phone_number: "+200000000000",
        apartment: "NA", floor: "NA", street: "NA", building: "NA",
        shipping_method: "NA", postal_code: "NA", city: "NA", country: "EG", state: "NA",
      },
    });

    const url = `${PAYMOB_BASE}/acceptance/iframes/${iframeId}?payment_token=${paymentKey.token}`;
    return json({ url, merchantOrderId });
  } catch (e) {
    return json({ error: String(e?.message ?? e) }, 500);
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
