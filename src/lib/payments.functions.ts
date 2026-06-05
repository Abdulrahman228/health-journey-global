import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
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
  .handler(async ({ data }) => {
    const stripe = createStripeClient(data.environment);

    const prices = await stripe.prices.list({ lookup_keys: [data.priceId] });
    if (!prices.data.length) throw new Error("Price not found");
    const stripePrice = prices.data[0];
    const isRecurring = stripePrice.type === "recurring";

    const customerId = (data.customerEmail || data.userId)
      ? await resolveOrCreateCustomer(stripe, {
          email: data.customerEmail,
          userId: data.userId,
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
      ...(data.userId && {
        metadata: { userId: data.userId, ...(data.planCode && { planCode: data.planCode }) },
        ...(isRecurring && {
          subscription_data: {
            metadata: { userId: data.userId, ...(data.planCode && { planCode: data.planCode }) },
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

export const createAppointmentCheckout = createServerFn({ method: "POST" })
  .inputValidator((data: {
    appointmentId: string;
    amount: number; // in smallest currency unit (e.g. cents / piastres)
    currency: string; // ISO lowercase (egp, usd, sar…)
    doctorName: string;
    returnUrl: string;
    cancelUrl: string;
    customerEmail?: string;
    userId?: string;
  }) => {
    if (!/^[a-zA-Z0-9-]+$/.test(data.appointmentId)) throw new Error("Invalid appointmentId");
    if (!Number.isInteger(data.amount) || data.amount < 50) {
      throw new Error("Invalid amount");
    }
    if (!/^[a-z]{3}$/.test(data.currency)) throw new Error("Invalid currency");
    if (data.userId && !/^[a-zA-Z0-9_-]+$/.test(data.userId)) {
      throw new Error("Invalid userId");
    }
    return data;
  })
  .handler(async ({ data }) => {
    const env: StripeEnv = getStripeEnvironment();
    const stripe = createStripeClient(env);

    const customerId = (data.customerEmail || data.userId)
      ? await resolveOrCreateCustomer(stripe, {
          email: data.customerEmail,
          userId: data.userId,
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
            unit_amount: data.amount,
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
          ...(data.userId && { userId: data.userId }),
        },
      },
      metadata: {
        appointment_id: data.appointmentId,
        ...(data.userId && { userId: data.userId }),
      },
    });

    return session.url;
  });
