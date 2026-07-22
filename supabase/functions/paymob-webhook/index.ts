// ============================================================================
// Paymob transaction webhook (Supabase Edge Function).
//
// Paymob calls this after a payment. We verify the HMAC signature, and on a
// successful card transaction we activate the doctor's Gold subscription in
// `public.subscriptions` (service role) — which flips doctor_active_tier() to
// 'gold' everywhere (web + mobile), exactly like the Stripe path.
//
// REQUIRED SECRETS:
//   PAYMOB_HMAC                — the HMAC secret from your Paymob dashboard
//   SUPABASE_SERVICE_ROLE_KEY  — to write subscriptions past RLS
//
// Configure this function's URL as the Paymob "Transaction processed callback".
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

Deno.serve(async (req) => {
  try {
    const hmacSecret = Deno.env.get("PAYMOB_HMAC");
    if (!hmacSecret) return new Response("not configured", { status: 503 });

    const url = new URL(req.url);
    const providedHmac = url.searchParams.get("hmac") ?? "";
    const payload = await req.json();
    const obj = payload.obj ?? payload;

    // 1) Verify HMAC
    const concatenated = HMAC_FIELDS.map((f) => getPath(obj, f) ?? "").join("");
    const expected = await hmacSha512(hmacSecret, concatenated);
    if (expected !== providedHmac.toLowerCase()) {
      return new Response("invalid hmac", { status: 401 });
    }

    // 2) Only act on a successful, non-refunded, non-voided card payment.
    if (obj.success !== true || obj.is_refunded === true || obj.is_voided === true) {
      return new Response("ignored", { status: 200 });
    }

    // 3) Recover who + what from merchant_order_id ("{user_id}__{plan}__{uuid}").
    const merchant = obj.order?.merchant_order_id as string | undefined;
    const [userId, planCode] = (merchant ?? "").split("__");
    const periodDays = planCode ? PLAN_PERIOD_DAYS[planCode] : undefined;
    if (!userId || !planCode || !periodDays) {
      return new Response("unmapped order", { status: 200 });
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const now = new Date();
    const end = new Date(now.getTime() + periodDays * 86_400_000);
    const txnId = String(obj.id);

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
    return new Response(String(e?.message ?? e), { status: 500 });
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
