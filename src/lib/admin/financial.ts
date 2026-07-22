import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { createStripeClient, type StripeEnv } from "@/lib/stripe.server";
import type { Database } from "@/integrations/supabase/types";
import { resolveAdmin, runAdminAction } from "./_kit";
import {
  AdminGrantSubscriptionSchema,
  AdminProcessRefundSchema,
  AdminReviewManualSubscriptionSchema,
} from "./_schemas";

type Json = Database["public"]["Tables"]["payments"]["Update"]["raw_payload"];

// Stripe only accepts these three reasons; "other" is recorded in our audit but
// not forwarded to the Stripe API.
const STRIPE_REASONS = new Set(["duplicate", "fraudulent", "requested_by_customer"]);

/**
 * Refund a payment (level: super_admin — money is high-risk).
 *
 * Issues a real Stripe refund (full or partial) via the server-side Stripe
 * client, then marks the payment `refunded` and records the detail in
 * raw_payload. Non-Stripe providers just record. Idempotent. Server logic stays
 * inside the inline handler so it is stripped from the client bundle.
 */
export const adminProcessRefund = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => AdminProcessRefundSchema.parse(raw))
  .handler(async ({ data, context }) => {
    const admin = await resolveAdmin(context.userId, "super_admin");
    return runAdminAction({
      admin,
      action: "payment.refund",
      resourceType: "payment",
      mutate: async () => {
        const { data: payment, error: payErr } = await supabaseAdmin
          .from("payments")
          .select(
            "id, provider, provider_payment_id, environment, amount_cents, currency, status, raw_payload",
          )
          .eq("id", data.paymentId)
          .maybeSingle();
        if (payErr) throw new Error(payErr.message);
        if (!payment) throw new Error("Payment not found.");
        if (payment.status === "refunded") throw new Error("Payment is already refunded.");

        let refundId: string | null = null;

        if (payment.provider === "stripe" && payment.provider_payment_id) {
          const stripe = createStripeClient(payment.environment as StripeEnv);
          // provider_payment_id is a PaymentIntent (pi_) or a Charge (ch_).
          const target = payment.provider_payment_id.startsWith("ch_")
            ? { charge: payment.provider_payment_id }
            : { payment_intent: payment.provider_payment_id };
          const refund = await stripe.refunds.create({
            ...target,
            ...(data.amountMinor ? { amount: data.amountMinor } : {}),
            ...(STRIPE_REASONS.has(data.reason)
              ? { reason: data.reason as "duplicate" | "fraudulent" | "requested_by_customer" }
              : {}),
          });
          refundId = refund.id;
        }

        const priorPayload =
          payment.raw_payload &&
          typeof payment.raw_payload === "object" &&
          !Array.isArray(payment.raw_payload)
            ? (payment.raw_payload as Record<string, unknown>)
            : {};
        const newPayload = {
          ...priorPayload,
          refund: {
            refundId,
            amountMinor: data.amountMinor ?? payment.amount_cents,
            currency: payment.currency,
            reason: data.reason,
            note: data.note ?? null,
            at: new Date().toISOString(),
          },
        };

        const { error: updErr } = await supabaseAdmin
          .from("payments")
          .update({ status: "refunded", raw_payload: newPayload as unknown as Json })
          .eq("id", data.paymentId);
        if (updErr) throw new Error(updErr.message);

        return {
          resourceId: data.paymentId,
          summary: `refund ${data.reason}${data.amountMinor ? ` (${data.amountMinor})` : " (full)"}`,
          metadata: {
            refundId,
            amountMinor: data.amountMinor ?? payment.amount_cents,
            provider: payment.provider,
          },
          result: { ok: true, refundId, status: "refunded" },
        };
      },
    });
  });

/**
 * Review a manual (receipt-based) subscription request (level: admin).
 *
 * approve -> access_status='verified' (permanent Gold until period end).
 * reject  -> access_status='rejected' + status='canceled' (doctor_active_tier
 *            stops counting it, so Gold is revoked) + notify the doctor.
 *
 * Server logic stays inside the inline handler so it is stripped from the
 * client bundle.
 */
export const adminReviewManualSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => AdminReviewManualSubscriptionSchema.parse(raw))
  .handler(async ({ data, context }) => {
    const admin = await resolveAdmin(context.userId, "admin");
    return runAdminAction({
      admin,
      action: `subscription.${data.decision}`,
      resourceType: "subscription",
      mutate: async () => {
        const { data: sub, error: subErr } = await supabaseAdmin
          .from("subscriptions")
          .select("id, user_id, plan_code, access_status, is_manual")
          .eq("id", data.subscriptionId)
          .maybeSingle();
        if (subErr) throw new Error(subErr.message);
        if (!sub) throw new Error("Subscription not found.");
        if (!sub.is_manual) throw new Error("Not a manual subscription request.");
        if (sub.access_status !== "pending") {
          throw new Error(`Request already ${sub.access_status}.`);
        }

        const nowIso = new Date().toISOString();
        if (data.decision === "approve") {
          const { error: updErr } = await supabaseAdmin
            .from("subscriptions")
            .update({ access_status: "verified", access_granted_at: nowIso, updated_at: nowIso })
            .eq("id", sub.id);
          if (updErr) throw new Error(updErr.message);
        } else {
          const { error: updErr } = await supabaseAdmin
            .from("subscriptions")
            .update({ access_status: "rejected", status: "canceled", updated_at: nowIso })
            .eq("id", sub.id);
          if (updErr) throw new Error(updErr.message);

          // Notify the doctor that verification failed (access revoked).
          await supabaseAdmin.from("notifications").insert({
            user_id: sub.user_id,
            kind: "subscription_rejected",
            title: "تعذّر التحقق من الدفع",
            body: "عذراً، لم نتمكن من التحقق من إيصال الدفع، يرجى إعادة المحاولة أو التواصل مع الدعم",
            link: "/pricing",
            metadata: { subscription_id: sub.id, plan_code: sub.plan_code },
          });
        }

        return {
          resourceId: sub.id,
          summary: `manual subscription ${data.decision}`,
          metadata: { plan_code: sub.plan_code, note: data.note ?? null },
          result: { ok: true, decision: data.decision, subscriptionId: sub.id },
        };
      },
    });
  });

/**
 * Grant a complimentary (gift) subscription to a doctor (level: admin).
 *
 * Used to comp a colleague N months of Gold — or lifetime (`months = null` →
 * no expiry, since doctor_active_tier() treats a NULL current_period_end as
 * "never expires"). Upserts a stable `comp_<user_id>` row so re-granting simply
 * extends/replaces it. access_status='verified' → Gold turns on immediately,
 * everywhere the tier is read (web + mobile).
 */
export const adminGrantSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => AdminGrantSubscriptionSchema.parse(raw))
  .handler(async ({ data, context }) => {
    const admin = await resolveAdmin(context.userId, "admin");
    return runAdminAction({
      admin,
      action: "subscription.grant",
      resourceType: "subscription",
      mutate: async () => {
        // Resolve the doctor's auth user_id from their profile.
        const { data: profile, error: profErr } = await supabaseAdmin
          .from("profiles")
          .select("id, user_id, full_name")
          .eq("id", data.profileId)
          .maybeSingle();
        if (profErr) throw new Error(profErr.message);
        if (!profile?.user_id) throw new Error("Doctor profile / user not found.");

        const nowIso = new Date().toISOString();
        const periodEnd =
          data.months == null
            ? null // lifetime
            : new Date(Date.now() + data.months * 30 * 24 * 60 * 60 * 1000).toISOString();

        const { error: upErr } = await supabaseAdmin
          .from("subscriptions")
          .upsert(
            {
              user_id: profile.user_id,
              stripe_subscription_id: `comp_${profile.user_id}`,
              stripe_customer_id: "comp",
              price_id: "comp",
              plan_code: data.planCode,
              status: "active",
              current_period_start: nowIso,
              current_period_end: periodEnd,
              environment: "live",
              access_status: "verified",
              access_granted_at: nowIso,
              is_manual: true,
              updated_at: nowIso,
            },
            { onConflict: "stripe_subscription_id" },
          );
        if (upErr) throw new Error(upErr.message);

        // Tell the doctor the good news.
        await supabaseAdmin.from("notifications").insert({
          user_id: profile.user_id,
          kind: "subscription_granted",
          title: "تم تفعيل باقة Gold لك 🎉",
          body:
            data.months == null
              ? "تم منحك اشتراك Gold مدى الحياة من إدارة طبيبي."
              : `تم منحك اشتراك Gold مجانًا لمدة ${data.months} شهر من إدارة طبيبي.`,
          link: "/dashboard",
          metadata: { plan_code: data.planCode, months: data.months },
        });

        return {
          resourceId: profile.user_id,
          summary: `granted ${data.planCode} (${data.months == null ? "lifetime" : `${data.months}m`}) to ${profile.full_name ?? profile.user_id}`,
          metadata: { plan_code: data.planCode, months: data.months, current_period_end: periodEnd },
          result: { ok: true, current_period_end: periodEnd },
        };
      },
    });
  });
