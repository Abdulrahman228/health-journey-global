import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { type StripeEnv, verifyWebhook } from "@/lib/stripe.server";
import type { Database } from "@/integrations/supabase/types";

let _supabase: ReturnType<typeof createClient<Database>> | null = null;
function getSupabase() {
  if (!_supabase) {
    _supabase = createClient<Database>(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    );
  }
  return _supabase;
}

function resolvePriceId(item: any): string | null {
  return (
    item?.price?.lookup_key ||
    item?.price?.metadata?.lovable_external_id ||
    item?.price?.id ||
    null
  );
}

// Stripe lookup key → internal plan_code. Gold is the single paid tier
// (Monthly / Yearly). Legacy keys are remapped so in-flight/renewing checkouts
// still resolve to a Gold plan code.
const PRICE_TO_PLAN: Record<string, string> = {
  doctor_gold_monthly: "doctor_gold_monthly",
  doctor_gold_yearly: "doctor_gold_yearly",
  // Legacy → Gold (keeps existing subscribers on a valid plan code).
  doctor_pro_monthly: "doctor_gold_monthly",
  doctor_pro_plus_monthly: "doctor_gold_yearly",
  doctor_premium_monthly: "doctor_gold_monthly",
};

// Every code here grants FULL Gold access. Legacy pro/pro_plus/premium are
// included so EXISTING subscribers keep all features after the consolidation.
const GOLD_PLAN_CODES = new Set<string>([
  "doctor_gold_monthly",
  "doctor_gold_yearly",
  "doctor_pro_monthly",
  "doctor_pro_plus_monthly",
  "doctor_premium_monthly",
]);

async function syncDoctorProFlags(userId: string, env: StripeEnv) {
  const sb = getSupabase();
  // Check current active sub for this user/env
  const { data: sub } = await sb
    .from("subscriptions")
    .select("plan_code,status,current_period_end")
    .eq("user_id", userId)
    .eq("environment", env)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const now = Date.now();
  const periodEnd = sub?.current_period_end ? new Date(sub.current_period_end as string).getTime() : null;
  const isActive = Boolean(
    sub &&
      ((["active", "trialing", "past_due"].includes(sub.status as string) && (!periodEnd || periodEnd > now)) ||
        (sub.status === "canceled" && periodEnd && periodEnd > now)),
  );

  const plan = isActive ? (sub?.plan_code as string | null) : null;

  // Single paid tier: any Gold code (incl. legacy pro/pro_plus/premium) grants
  // both the "pro" and "pro-plus" feature flags — so existing subscribers keep
  // every feature they had before the consolidation.
  const isGold = Boolean(isActive && plan && GOLD_PLAN_CODES.has(plan));
  const isPro = isGold;
  const isProPlus = isGold;

  // Find doctor_details for this user
  const { data: profile } = await sb
    .from("profiles")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();
  if (!profile) return;

  // LIABILITY GATE: online consultations require verified documents, even on
  // Pro Plus. A subscription must NEVER unlock telemedicine for an unverified
  // doctor — otherwise billing bypasses the whole verification flow.
  const { data: dd } = await sb
    .from("doctor_details")
    .select("id, is_verified")
    .eq("profile_id", profile.id as string)
    .maybeSingle();
  const isVerified = dd?.is_verified === true;
  const telemedicineEnabled = isProPlus && isVerified;

  await sb
    .from("doctor_details")
    .update({
      is_pro: isPro,
      pro_plus_active: isProPlus,
      telemedicine_enabled: telemedicineEnabled,
    })
    .eq("profile_id", profile.id as string);

  // Subscribed to Pro Plus but not verified → telemedicine stays OFF. Log an
  // admin-facing warning so the team can nudge the doctor to complete verification.
  if (isProPlus && !isVerified) {
    await sb.from("audit_logs").insert({
      user_id: userId,
      action: "telemedicine.subscription_pending_verification",
      resource_type: "doctor_details",
      resource_id: dd?.id ?? null,
      metadata: {
        severity: "warning",
        reason: "pro_plus_without_verification",
        note: "Pro Plus active but telemedicine withheld — doctor not verified.",
      },
    });
  }
}

async function handleSubscriptionUpsert(subscription: any, env: StripeEnv) {
  const userId = subscription.metadata?.userId;
  if (!userId) {
    console.error("No userId in subscription metadata");
    return;
  }

  const item = subscription.items?.data?.[0];
  const priceId = resolvePriceId(item);
  const productId = item?.price?.product;
  const periodStart = item?.current_period_start ?? subscription.current_period_start;
  const periodEnd = item?.current_period_end ?? subscription.current_period_end;
  const planCode = subscription.metadata?.planCode || (priceId ? PRICE_TO_PLAN[priceId] : null);

  // Cross-platform tracking: which client initiated the subscription. The
  // checkout can stamp subscription.metadata.source = "web" | "mobile"; defaults
  // to "unknown" until both platforms set it. Plan changes still happen ONLY
  // here in the webhook — never from a client button.
  const source = (subscription.metadata?.source as string | undefined) ?? "unknown";
  console.info(`[webhook] subscription upsert · source=${source} · plan=${planCode ?? "?"} · env=${env}`);

  await getSupabase()
    .from("subscriptions")
    .upsert(
      {
        user_id: userId,
        stripe_subscription_id: subscription.id,
        stripe_customer_id: subscription.customer,
        product_id: productId,
        price_id: priceId ?? "",
        plan_code: planCode,
        status: subscription.status,
        cancel_at_period_end: subscription.cancel_at_period_end || false,
        current_period_start: periodStart ? new Date(periodStart * 1000).toISOString() : null,
        current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
        environment: env,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "stripe_subscription_id" },
    );

  await syncDoctorProFlags(userId, env);
}

async function handleSubscriptionDeleted(subscription: any, env: StripeEnv) {
  await getSupabase()
    .from("subscriptions")
    .update({ status: "canceled", updated_at: new Date().toISOString() })
    .eq("stripe_subscription_id", subscription.id)
    .eq("environment", env);

  const userId = subscription.metadata?.userId;
  if (userId) await syncDoctorProFlags(userId, env);
}

async function handleInvoicePaid(invoice: any, env: StripeEnv) {
  const userId = invoice.subscription_details?.metadata?.userId || invoice.metadata?.userId;
  if (!userId) {
    console.warn("Invoice without userId metadata, skipping");
    return;
  }

  const sb = getSupabase();
  let subscriptionId: string | null = null;
  if (invoice.subscription) {
    const { data: subRow } = await sb
      .from("subscriptions")
      .select("id")
      .eq("stripe_subscription_id", invoice.subscription as string)
      .eq("environment", env)
      .maybeSingle();
    subscriptionId = (subRow?.id as string | undefined) ?? null;
  }

  const amount = invoice.amount_paid ?? invoice.amount_due ?? 0;
  const issuedAt = invoice.status_transitions?.finalized_at
    ? new Date(invoice.status_transitions.finalized_at * 1000).toISOString()
    : new Date().toISOString();
  const paidAt = invoice.status_transitions?.paid_at
    ? new Date(invoice.status_transitions.paid_at * 1000).toISOString()
    : null;

  // De-duplicate by Stripe invoice id stored in eta_payload->>'stripe_invoice_id'
  const { data: existing } = await sb
    .from("invoices")
    .select("id")
    .eq("user_id", userId)
    .eq("environment", env)
    .filter("eta_payload->>stripe_invoice_id", "eq", invoice.id)
    .maybeSingle();

  const row = {
    user_id: userId,
    subscription_id: subscriptionId,
    amount_cents: amount,
    net_cents: amount,
    currency: (invoice.currency || "egp").toUpperCase(),
    status: invoice.status === "paid" ? "paid" : (invoice.status as string),
    description: invoice.lines?.data?.[0]?.description ?? "Subscription invoice",
    customer_name: invoice.customer_name ?? null,
    issued_at: issuedAt,
    paid_at: paidAt,
    pdf_url: invoice.invoice_pdf ?? invoice.hosted_invoice_url ?? null,
    eta_payload: { stripe_invoice_id: invoice.id } as any,
    environment: env,
    updated_at: new Date().toISOString(),
  };

  if (existing?.id) {
    await sb.from("invoices").update(row).eq("id", existing.id as string);
  } else {
    await sb.from("invoices").insert(row);
  }
}

// =============================================================
// PaymentIntent flow (appointments / one-off charges)
// =============================================================
//
// When a patient pays for an appointment we receive a series of events.
// We use `payment_intent.succeeded` as the single source of truth because
// it fires for every successful capture (Cards, Apple Pay, etc.) and
// includes the PI id (pi_…) we stored on the appointment row.
//
// Steps:
//   1. Insert a row into `payments` (idempotent on provider_payment_id+env)
//   2. Locate the appointment (by metadata.appointment_id → fallback by pi id)
//   3. Update appointment: payment_status='paid', status='confirmed', paid_at
//
// The `trg_appt_completion_tx` trigger then creates the
// `doctor_transactions` row automatically when the doctor later marks
// the appointment as 'completed'.

async function upsertPayment(args: {
  env: StripeEnv;
  userId: string | null;
  appointmentId: string | null;
  providerPaymentId: string;
  providerSessionId: string | null;
  amountCents: number;
  currency: string;
  status: "succeeded" | "failed" | "cancelled";
  raw: unknown;
}) {
  const sb = getSupabase();
  const { data: existing } = await sb
    .from("payments")
    .select("id")
    .eq("provider_payment_id", args.providerPaymentId)
    .eq("environment", args.env)
    .maybeSingle();

  const row = {
    provider: "stripe",
    provider_payment_id: args.providerPaymentId,
    provider_session_id: args.providerSessionId,
    user_id: args.userId,
    appointment_id: args.appointmentId,
    amount_cents: args.amountCents,
    currency: args.currency.toUpperCase(),
    status: args.status,
    raw_payload: args.raw as never,
    environment: args.env,
    updated_at: new Date().toISOString(),
  } as never;

  if (existing?.id) {
    await sb.from("payments").update(row).eq("id", existing.id as string);
  } else {
    await sb.from("payments").insert(row);
  }
}

async function findAppointmentForPI(pi: {
  id: string;
  metadata?: Record<string, string> | null;
}): Promise<{ id: string; status: string; payment_status: string } | null> {
  const sb = getSupabase();
  const appointmentId = pi.metadata?.appointment_id;

  if (appointmentId) {
    const { data } = await sb
      .from("appointments")
      .select("id,status,payment_status")
      .eq("id", appointmentId)
      .maybeSingle();
    if (data) return data as never;
  }

  const { data: byPi } = await sb
    .from("appointments")
    .select("id,status,payment_status")
    .eq("payment_intent_id", pi.id)
    .maybeSingle();
  return (byPi as never) ?? null;
}

async function handlePaymentIntentSucceeded(pi: any, env: StripeEnv) {
  const userId = pi.metadata?.userId || pi.metadata?.user_id || null;
  const amount = pi.amount_received ?? pi.amount ?? 0;
  const currency = (pi.currency || "egp") as string;

  const appt = await findAppointmentForPI(pi);

  await upsertPayment({
    env,
    userId,
    appointmentId: appt?.id ?? null,
    providerPaymentId: pi.id,
    providerSessionId: pi.metadata?.checkout_session_id ?? null,
    amountCents: amount,
    currency,
    status: "succeeded",
    raw: pi,
  });

  if (!appt) {
    console.warn("payment_intent.succeeded without matching appointment", pi.id);
    return;
  }

  const sb = getSupabase();
  const update: Record<string, unknown> = {
    payment_status: "paid",
    payment_intent_id: pi.id,
    payment_environment: env,
    paid_at: new Date().toISOString(),
    currency: currency.toUpperCase(),
    updated_at: new Date().toISOString(),
  };
  // Auto-confirm pending appointments once payment lands
  if (appt.status === "pending") update.status = "confirmed";

  await sb.from("appointments").update(update as never).eq("id", appt.id);

  // Record coupon redemption if this appointment had one applied at
  // checkout. The SQL fn is idempotent (UNIQUE on coupon_id+appointment_id),
  // so it is safe to call on every retry of the webhook.
  try {
    await sb.rpc("record_coupon_redemption" as never, {
      p_appointment_id: appt.id,
    } as never);
  } catch (e) {
    console.warn("record_coupon_redemption failed", appt.id, e);
  }

  // If this appointment was created from a consultation request, mark it paid.
  const consultationRequestId = pi.metadata?.consultation_request_id;
  if (consultationRequestId) {
    await sb
      .from("consultation_requests")
      .update({
        status: "paid",
        paid_at: new Date().toISOString(),
        payment_intent_id: pi.id,
      } as never)
      .eq("id", consultationRequestId);
  } else {
    // Fallback: locate by appointment_id link.
    await sb
      .from("consultation_requests")
      .update({
        status: "paid",
        paid_at: new Date().toISOString(),
        payment_intent_id: pi.id,
      } as never)
      .eq("appointment_id", appt.id)
      .eq("status", "accepted");
  }
}

async function handlePaymentIntentFailed(pi: any, env: StripeEnv) {
  const userId = pi.metadata?.userId || pi.metadata?.user_id || null;
  const appt = await findAppointmentForPI(pi);

  await upsertPayment({
    env,
    userId,
    appointmentId: appt?.id ?? null,
    providerPaymentId: pi.id,
    providerSessionId: pi.metadata?.checkout_session_id ?? null,
    amountCents: pi.amount ?? 0,
    currency: (pi.currency as string) || "egp",
    status: "failed",
    raw: pi,
  });

  if (appt) {
    await getSupabase()
      .from("appointments")
      .update({
        payment_status: "failed",
        payment_intent_id: pi.id,
        payment_environment: env,
        updated_at: new Date().toISOString(),
      } as never)
      .eq("id", appt.id);
  }
}

async function handleChargeRefunded(charge: any, env: StripeEnv) {
  const piId: string | null = charge.payment_intent ?? null;
  if (!piId) return;

  const sb = getSupabase();
  const { data: appt } = await sb
    .from("appointments")
    .select("id,fee")
    .eq("payment_intent_id", piId)
    .maybeSingle();

  const refundedAmount = charge.amount_refunded ?? 0;
  const totalAmount = charge.amount ?? 0;
  const fullyRefunded = totalAmount > 0 && refundedAmount >= totalAmount;

  await upsertPayment({
    env,
    userId: charge.metadata?.userId || null,
    appointmentId: (appt as { id?: string } | null)?.id ?? null,
    providerPaymentId: piId,
    providerSessionId: charge.metadata?.checkout_session_id ?? null,
    amountCents: refundedAmount,
    currency: (charge.currency as string) || "egp",
    status: fullyRefunded ? "cancelled" : "succeeded",
    raw: charge,
  });

  if (appt) {
    // Convert refundedAmount (Stripe = smallest unit, e.g. piastres) to major
    // currency units to match appointments.fee + appointments.refunded_amount.
    const refundedMajor = Math.round(refundedAmount) / 100;

    await sb
      .from("appointments")
      .update({
        payment_status: fullyRefunded ? "refunded" : "partially_refunded",
        refunded_at: new Date().toISOString(),
        refunded_amount: refundedMajor,
        updated_at: new Date().toISOString(),
        ...(fullyRefunded ? { status: "cancelled" } : {}),
      } as never)
      .eq("id", (appt as { id: string }).id);
    // The trg_appt_refund_tx trigger will auto-insert an offsetting
    // doctor_transactions row to keep the doctor balance correct.
  }
}

async function handleWebhook(req: Request, env: StripeEnv) {  const event = await verifyWebhook(req, env);

  switch (event.type) {    case "customer.subscription.updated":
      await handleSubscriptionUpsert(event.data.object, env);
      break;
    case "customer.subscription.deleted":
      await handleSubscriptionDeleted(event.data.object, env);
      break;
    case "invoice.paid":
    case "invoice.payment_succeeded":
      await handleInvoicePaid(event.data.object, env);
      break;
    case "payment_intent.succeeded":
      await handlePaymentIntentSucceeded(event.data.object, env);
      break;
    case "payment_intent.payment_failed":
      await handlePaymentIntentFailed(event.data.object, env);
      break;
    case "charge.refunded":
      await handleChargeRefunded(event.data.object, env);
      break;
    default:
      console.log("Unhandled event:", event.type);
  }
}

export const Route = createFileRoute("/api/public/payments/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const rawEnv = new URL(request.url).searchParams.get("env");
        if (rawEnv !== "sandbox" && rawEnv !== "live") {
          console.error("Webhook invalid env:", rawEnv);
          return Response.json({ received: true, ignored: "invalid env" });
        }
        try {
          await handleWebhook(request, rawEnv);
          return Response.json({ received: true });
        } catch (e) {
          console.error("Webhook error:", e);
          return new Response("Webhook error", { status: 400 });
        }
      },
    },
  },
});
