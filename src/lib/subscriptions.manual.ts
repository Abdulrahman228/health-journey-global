import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { MANUAL_GOLD_PLAN_CODES } from "@/lib/subscriptions.access";

const SubmitManualSchema = z.object({
  planCode: z.enum(MANUAL_GOLD_PLAN_CODES),
  /** URL of the uploaded receipt (Supabase Storage or similar). */
  // Storage object path inside the private `receipts` bucket (legacy rows may
  // still hold a full public URL; the admin page handles both).
  receiptUrl: z.string().trim().min(3).max(2000),
});

/**
 * Submit a manual-payment receipt for a Gold plan.
 *
 * Trust-but-Verify: this GRANTS Gold immediately by writing an active
 * `subscriptions` row (which doctor_active_tier reads), but flags it
 * access_status='pending'. The row confers access for 24h; an admin must verify
 * the receipt within that window (see doctor_active_tier + hasValidAccess).
 *
 * Also raises a high-priority notification to every admin so the receipt lands
 * in the "Subscription Requests" queue. All server logic stays inside the inline
 * handler so it is stripped from the client bundle.
 */
export const submitManualSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => SubmitManualSchema.parse(raw))
  .handler(async ({ data, context }) => {
    // Caller must be a doctor (the tier only resolves through doctor_details).
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!profile) throw new Error("لم يتم العثور على الملف الشخصي.");

    const { data: doctor } = await supabaseAdmin
      .from("doctor_details")
      .select("id")
      .eq("profile_id", profile.id)
      .maybeSingle();
    if (!doctor) throw new Error("رفع إيصال الاشتراك متاح للأطباء فقط.");

    // The plan must exist and actually be a Gold plan.
    const { data: plan } = await supabaseAdmin
      .from("subscription_plans")
      .select("code, tier")
      .eq("code", data.planCode)
      .maybeSingle();
    if (!plan || plan.tier !== "gold") {
      throw new Error("الخطة غير صالحة.");
    }

    // Idempotency: if a pending manual request already exists, don't stack.
    // (limit(1): with 2+ pending rows maybeSingle() errored → data null → a
    // further duplicate row was inserted.)
    const { data: existing } = await supabaseAdmin
      .from("subscriptions")
      .select("id")
      .eq("user_id", context.userId)
      .eq("is_manual", true)
      .eq("access_status", "pending")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (existing) {
      return {
        ok: true as const,
        subscriptionId: existing.id,
        accessStatus: "pending" as const,
        duplicate: true,
      };
    }

    const now = new Date();
    const grantedAt = now.toISOString();
    const isYearly = data.planCode.includes("yearly");
    const periodEnd = new Date(now.getTime() + (isYearly ? 365 : 30) * 86_400_000).toISOString();

    // Synthetic identifiers for the NOT-NULL Stripe columns; the `manual_`
    // prefix guarantees they never collide with real Stripe webhook rows.
    const syntheticSubId = `manual_${crypto.randomUUID()}`;

    const { data: inserted, error: insErr } = await supabaseAdmin
      .from("subscriptions")
      .insert({
        user_id: context.userId,
        plan_code: data.planCode,
        status: "active",
        is_manual: true,
        access_status: "pending",
        access_granted_at: grantedAt,
        receipt_url: data.receiptUrl,
        current_period_start: grantedAt,
        current_period_end: periodEnd,
        // Must be "live" (same as admin Grant Gold + paymob-webhook): the web
        // useSubscription filters environment = getStripeEnvironment() ("live"
        // in production). "production" matched nothing, so a doctor who had
        // just paid saw "no active subscription" on /billing and /pricing.
        environment: "live",
        stripe_customer_id: `manual_${context.userId}`,
        stripe_subscription_id: syntheticSubId,
        price_id: `manual_${data.planCode}`,
      })
      .select("id")
      .single();
    if (insErr) throw new Error("تعذّر تسجيل طلب الاشتراك: " + insErr.message);

    // Notify all admins so the receipt surfaces in the review queue.
    const { data: admins } = await supabaseAdmin
      .from("user_roles")
      .select("user_id")
      .in("role", ["admin", "super_admin"]);
    const adminIds = Array.from(new Set((admins ?? []).map((a) => a.user_id))).filter(Boolean);
    if (adminIds.length) {
      const docName = (profile.full_name ?? "").trim() || "طبيب";
      await supabaseAdmin.from("notifications").insert(
        adminIds.map((uid) => ({
          user_id: uid,
          kind: "subscription_request",
          title: "طلب اشتراك جديد بانتظار المراجعة",
          body: `قام الدكتور ${docName} برفع إيصال دفع لخطة Gold. يرجى مراجعة الطلب خلال 24 ساعة.`,
          link: "/admin/subscription-requests",
          metadata: { priority: "high", subscription_id: inserted.id, plan_code: data.planCode },
        })),
      );
    }

    return {
      ok: true as const,
      subscriptionId: inserted.id,
      accessStatus: "pending" as const,
      duplicate: false,
    };
  });
