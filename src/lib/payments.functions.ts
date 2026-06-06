import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { assertSelf } from "./_authz";
import { type StripeEnv, createStripeClient } from "@/lib/stripe.server";

async function resolveOrCreateCustomer(
  stripe: ReturnType<typeof createStripeClient>,
  options: { email?: string; userId?: string },
): Promise<string> {
  if (options.userId && !/^[a-zA-Z0-9_-]+$/.test(options.userId)) {
    throw new Error("Invalid userId");
  }
  if (options.userId) {
    const found = await stripe.customers.search({
      query: `metadata['userId']:'${options.userId}'`,
      limit: 1,
    });
    if (found.data.length) return found.data[0].id;
  }
  if (options.email) {
    const existing = await stripe.customers.list({ email: options.email, limit: 1 });
    if (existing.data.length) {
      const customer = existing.data[0];
      if (options.userId && customer.metadata?.userId !== options.userId) {
        await stripe.customers.update(customer.id, {
          metadata: { ...customer.metadata, userId: options.userId },
        });
      }
      return customer.id;
    }
  }
  const created = await stripe.customers.create({
    ...(options.email && { email: options.email }),
    ...(options.userId && { metadata: { userId: options.userId } }),
  });
  return created.id;
}

export const createCheckoutSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: {
    priceId: string;
    planCode?: string;
    customerEmail?: string;
    userId?: string;
    returnUrl: string;
    environment: StripeEnv;
  }) => {
    if (!/^[a-zA-Z0-9_-]+$/.test(data.priceId)) throw new Error("Invalid priceId");
    return data;
  })
  .handler(async ({ data, context }) => {
    // Always bind checkout to the authenticated user, never trust input.
    const userId = context.userId;
    if (data.userId && data.userId !== userId) {
      throw new Error("Unauthorized");
    }
    const stripe = createStripeClient(data.environment);

    const prices = await stripe.prices.list({ lookup_keys: [data.priceId] });
    if (!prices.data.length) throw new Error("Price not found");
    const stripePrice = prices.data[0];
    const isRecurring = stripePrice.type === "recurring";

    const customerId = (data.customerEmail || userId)
      ? await resolveOrCreateCustomer(stripe, {
          email: data.customerEmail,
          userId,
        })
      : undefined;

    let productDescription: string | undefined;
    if (!isRecurring) {
      const productId = typeof stripePrice.product === "string"
        ? stripePrice.product
        : stripePrice.product.id;
      const product = await stripe.products.retrieve(productId);
      productDescription = product.name;
    }

    const session = await stripe.checkout.sessions.create({
      line_items: [{ price: stripePrice.id, quantity: 1 }],
      mode: isRecurring ? "subscription" : "payment",
      ui_mode: "embedded_page",
      return_url: data.returnUrl,
      ...(customerId && { customer: customerId }),
      ...(!isRecurring && { payment_intent_data: { description: productDescription } }),
      ...(userId && {
        metadata: { userId, ...(data.planCode && { planCode: data.planCode }) },
        ...(isRecurring && {
          subscription_data: {
            metadata: { userId, ...(data.planCode && { planCode: data.planCode }) },
          },
        }),
      }),
    });

    return session.client_secret;
  });

export const createPortalSession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { returnUrl?: string; environment: StripeEnv }) => data)
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { data: sub, error: subError } = await supabase
      .from("subscriptions")
      .select("stripe_customer_id")
      .eq("user_id", userId)
      .eq("environment", data.environment)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (subError || !sub?.stripe_customer_id) throw new Error("No subscription found");

    const stripe = createStripeClient(data.environment);
    const portal = await stripe.billingPortal.sessions.create({
      customer: sub.stripe_customer_id as string,
      ...(data.returnUrl && { return_url: data.returnUrl }),
    });
    return portal.url;
  });

// =============================================================================
// One-off appointment checkout (hosted redirect, ad-hoc price)
// =============================================================================
import { getStripeEnvironment } from "@/lib/stripe";
import { applyCouponToAppointment } from "@/lib/coupons.functions";

export const createAppointmentCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: {
    appointmentId: string;
    amount: number; // in smallest currency unit (e.g. cents / piastres)
    currency: string; // ISO lowercase (egp, usd, sar…)
    doctorName: string;
    returnUrl: string;
    cancelUrl: string;
    customerEmail?: string;
    userId?: string;
    couponCode?: string;
    appointmentType?: "in_person" | "video" | "telehealth";
    doctorId?: string;
  }) => {
    if (!/^[a-zA-Z0-9-]+$/.test(data.appointmentId)) throw new Error("Invalid appointmentId");
    if (!Number.isInteger(data.amount) || data.amount < 50) {
      throw new Error("Invalid amount");
    }
    if (!/^[a-z]{3}$/.test(data.currency)) throw new Error("Invalid currency");
    if (data.userId && !/^[a-zA-Z0-9_-]+$/.test(data.userId)) {
      throw new Error("Invalid userId");
    }
    if (data.couponCode && data.couponCode.length > 64) {
      throw new Error("Invalid couponCode");
    }
    return data;
  })
  .handler(async ({ data, context }) => {
    // Bind checkout to authenticated user; reject any mismatched input userId.
    const userId = context.userId;
    if (data.userId && data.userId !== userId) {
      throw new Error("Unauthorized");
    }
    const env: StripeEnv = getStripeEnvironment();
    const stripe = createStripeClient(env);

    // Apply coupon (if supplied) BEFORE creating the Stripe session so the
    // checkout reflects the discounted price. Falls back silently if the
    // coupon is invalid — the patient sees the original price and a
    // toast on the client.
    let amountMinor = data.amount;
    let appliedCoupon: { code: string; discount: number } | null = null;
    if (data.couponCode) {
      const amountMajor = data.amount / 100;
      const result = await applyCouponToAppointment({
        appointmentId: data.appointmentId,
        code: data.couponCode,
        amount: amountMajor,
        currency: data.currency,
        appointmentType: data.appointmentType,
        doctorId: data.doctorId ?? null,
        userId,
      });
      if (result.valid && result.code) {
        amountMinor = Math.round(result.finalAmount * 100);
        appliedCoupon = { code: result.code, discount: result.discountAmount };
      }
    }

    // Stripe rejects amounts below 50 in many currencies; if a coupon
    // brings the bill to (or near) zero, refuse the checkout. The
    // appointment row already carries the discounted fee.
    if (amountMinor < 50) {
      throw new Error("بعد خصم الكود أصبح المبلغ صغيراً جداً. تواصل مع الدعم.");
    }

    const customerId = (data.customerEmail || userId)
      ? await resolveOrCreateCustomer(stripe, {
          email: data.customerEmail,
          userId,
        })
      : undefined;

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      success_url: data.returnUrl,
      cancel_url: data.cancelUrl,
      ...(customerId && { customer: customerId }),
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency: data.currency,
            unit_amount: amountMinor,
            product_data: {
              name: `كشف د. ${data.doctorName}`,
              description: `Tabibi appointment ${data.appointmentId}`,
            },
          },
        },
      ],
      payment_intent_data: {
        description: `Tabibi appointment ${data.appointmentId}`,
        metadata: {
          appointment_id: data.appointmentId,
          ...(userId && { userId }),
          ...(appliedCoupon && {
            coupon_code: appliedCoupon.code,
            coupon_discount: appliedCoupon.discount.toFixed(2),
          }),
        },
      },
      metadata: {
        appointment_id: data.appointmentId,
        ...(userId && { userId }),
        ...(appliedCoupon && {
          coupon_code: appliedCoupon.code,
          coupon_discount: appliedCoupon.discount.toFixed(2),
        }),
      },
    });

    return session.url;
  });

// =============================================================================
// Patient receipt — printable proof of payment for a paid appointment.
//
// Caller must be the patient on the appointment, the doctor on it, or admin.
// Returns null if not authorized or not yet paid.
// =============================================================================
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export interface AppointmentReceipt {
  receiptNumber: string;        // R-{YYYYMMDD}-{shortId}
  appointmentId: string;
  status: "paid" | "refunded" | "partially_refunded" | "pending" | "failed";
  paidAt: string | null;
  refundedAt: string | null;
  scheduledAt: string;
  appointmentType: string;
  fee: number;                  // Major currency units (after coupon)
  refundedAmount: number;       // Major currency units
  netPaid: number;              // fee - refundedAmount
  currency: string;
  doctorName: string | null;
  doctorSpecialty: string | null;
  doctorSyndicate: string | null;
  patientName: string | null;
  paymentProvider: string | null;
  paymentReference: string | null;  // last 12 chars of provider_payment_id
  environment: "sandbox" | "live" | null;
  couponCode: string | null;
  couponDiscount: number;       // Major currency units
}

function generateReceiptNumber(appointmentId: string, paidAt: string | null): string {
  const date = paidAt ? new Date(paidAt) : new Date();
  const yyyymmdd =
    date.getUTCFullYear().toString() +
    (date.getUTCMonth() + 1).toString().padStart(2, "0") +
    date.getUTCDate().toString().padStart(2, "0");
  const shortId = appointmentId.replace(/-/g, "").slice(0, 8).toUpperCase();
  return `R-${yyyymmdd}-${shortId}`;
}

export const getAppointmentReceipt = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((x: unknown) => {
    const obj = x as { userId?: unknown; appointmentId?: unknown };
    if (typeof obj.userId !== "string" || !/^[0-9a-f-]{36}$/i.test(obj.userId)) {
      throw new Error("Invalid userId");
    }
    if (
      typeof obj.appointmentId !== "string" ||
      !/^[0-9a-f-]{36}$/i.test(obj.appointmentId)
    ) {
      throw new Error("Invalid appointmentId");
    }
    return { userId: obj.userId, appointmentId: obj.appointmentId };
  })
  .handler(async ({ data, context }): Promise<AppointmentReceipt | null> => {
    assertSelf(context.userId, data.userId);
    // 1. Load the appointment.
    const { data: appt } = await supabaseAdmin
      .from("appointments")
      .select(
        "id, patient_id, doctor_id, scheduled_at, appointment_type, status, fee, currency, payment_status, paid_at, refunded_at, refunded_amount, payment_intent_id, payment_environment, coupon_code, coupon_discount",
      )
      .eq("id", data.appointmentId)
      .maybeSingle();
    if (!appt) return null;

    // 2. Authorization — patient profile or doctor profile or admin.
    const { data: myProfile } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("user_id", data.userId)
      .maybeSingle();
    const myProfileId = (myProfile?.id as string | undefined) ?? null;

    const isPatient = myProfileId !== null && myProfileId === (appt.patient_id as string);

    let isDoctor = false;
    if (!isPatient && myProfileId) {
      const { data: dd } = await supabaseAdmin
        .from("doctor_details")
        .select("id")
        .eq("profile_id", myProfileId)
        .maybeSingle();
      const myDoctorDetailsId = (dd?.id as string | undefined) ?? null;
      isDoctor = myDoctorDetailsId !== null && myDoctorDetailsId === (appt.doctor_id as string);
    }

    let isAdminUser = false;
    if (!isPatient && !isDoctor) {
      const { data: rolerow } = await supabaseAdmin
        .from("user_roles")
        .select("role")
        .eq("user_id", data.userId)
        .eq("role", "admin")
        .maybeSingle();
      isAdminUser = Boolean(rolerow);
    }

    if (!isPatient && !isDoctor && !isAdminUser) return null;

    // 3. Only show a receipt for a payment that actually landed.
    const paymentStatus = (appt.payment_status as string | null) ?? "pending";
    if (paymentStatus === "pending" || paymentStatus === "failed") {
      // Still surface metadata so the caller can show "not paid yet" UX
      // without us pretending it's a receipt.
      return null;
    }

    // 4. Doctor + patient names.
    const doctorDetailsId = appt.doctor_id as string;
    const patientProfileId = appt.patient_id as string;

    const [{ data: dd }, { data: patientProfile }] = await Promise.all([
      supabaseAdmin
        .from("doctor_details")
        .select("profile_id, specialty, syndicate_number")
        .eq("id", doctorDetailsId)
        .maybeSingle(),
      supabaseAdmin
        .from("profiles")
        .select("full_name")
        .eq("id", patientProfileId)
        .maybeSingle(),
    ]);

    let doctorName: string | null = null;
    if (dd?.profile_id) {
      const { data: dp } = await supabaseAdmin
        .from("profiles")
        .select("full_name")
        .eq("id", dd.profile_id as string)
        .maybeSingle();
      doctorName = (dp?.full_name as string | null) ?? null;
    }

    // 5. Optional payment row for provider reference.
    const { data: payment } = await supabaseAdmin
      .from("payments")
      .select("provider, provider_payment_id, environment")
      .eq("appointment_id", data.appointmentId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const fee = Number(appt.fee ?? 0);
    const refundedAmount = Number(appt.refunded_amount ?? 0);
    const netPaid = Math.max(0, fee - refundedAmount);

    const providerPaymentId = (payment?.provider_payment_id as string | null) ?? null;
    const reference = providerPaymentId
      ? providerPaymentId.slice(-12).toUpperCase()
      : ((appt.payment_intent_id as string | null) ?? "").slice(-12).toUpperCase() || null;

    return {
      receiptNumber: generateReceiptNumber(
        appt.id as string,
        (appt.paid_at as string | null) ?? null,
      ),
      appointmentId: appt.id as string,
      status: paymentStatus as AppointmentReceipt["status"],
      paidAt: (appt.paid_at as string | null) ?? null,
      refundedAt: (appt.refunded_at as string | null) ?? null,
      scheduledAt: appt.scheduled_at as string,
      appointmentType: (appt.appointment_type as string | null) ?? "in_person",
      fee,
      refundedAmount,
      netPaid,
      currency: ((appt.currency as string | null) ?? "EGP").toUpperCase(),
      doctorName,
      doctorSpecialty: (dd?.specialty as string | null) ?? null,
      doctorSyndicate: (dd?.syndicate_number as string | null) ?? null,
      patientName: (patientProfile?.full_name as string | null) ?? null,
      paymentProvider: (payment?.provider as string | null) ?? "stripe",
      paymentReference: reference,
      environment: (payment?.environment as AppointmentReceipt["environment"]) ??
        (appt.payment_environment as AppointmentReceipt["environment"]) ??
        null,
      couponCode: (appt.coupon_code as string | null) ?? null,
      couponDiscount: Number(appt.coupon_discount ?? 0),
    };
  });