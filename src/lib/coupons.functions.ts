/**
 * Coupon / promo code utilities.
 *
 *   • {@link validateCoupon}  — read-only check used by the booking UI to
 *     preview a discount before the patient commits.
 *   • {@link applyCouponToAppointment} — internal helper used by
 *     `createAppointmentCheckout` to atomically attach a coupon to an
 *     appointment row (writes `coupon_code` + `coupon_discount`).
 *
 * Redemption rows are written by the Stripe webhook (after payment lands)
 * via the SQL RPC `record_coupon_redemption()`, so an abandoned checkout
 * does not consume a per-user redemption slot.
 */
import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export interface CouponValidationResult {
  valid: boolean;
  code: string | null;
  discountType: "percent" | "fixed" | null;
  discountValue: number | null;
  discountAmount: number;       // major units, computed for the supplied amount
  finalAmount: number;          // amount - discountAmount, never below 0
  currency: string | null;
  message: string;              // Arabic, user-facing
}

interface CouponRow {
  id: string;
  code: string;
  description: string | null;
  discount_type: string;
  discount_value: number;
  currency: string | null;
  min_amount: number | null;
  max_discount: number | null;
  valid_from: string | null;
  valid_until: string | null;
  usage_limit: number | null;
  usage_limit_per_user: number | null;
  times_used: number;
  applies_to: string;
  doctor_id: string | null;
  is_active: boolean;
}

interface ValidateInput {
  code: string;
  amount: number;                              // major units (e.g. 750 EGP)
  currency: string;                            // ISO upper or lower
  appointmentType?: "in_person" | "video" | "telehealth";
  doctorId?: string | null;                    // doctor_details.id
  userId?: string | null;                      // auth.users.id (for per-user limit)
}

function normalizeCode(raw: string): string {
  return String(raw ?? "").trim().toUpperCase();
}

function computeDiscount(
  coupon: CouponRow,
  amount: number,
): { discount: number; final: number } {
  if (coupon.discount_type === "fixed") {
    const discount = Math.min(coupon.discount_value, amount);
    return { discount: round2(discount), final: round2(amount - discount) };
  }
  // percent
  let discount = (amount * coupon.discount_value) / 100;
  if (coupon.max_discount && discount > coupon.max_discount) {
    discount = coupon.max_discount;
  }
  if (discount > amount) discount = amount;
  return { discount: round2(discount), final: round2(amount - discount) };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

async function loadCoupon(code: string): Promise<CouponRow | null> {
  const { data } = await supabaseAdmin
    .from("coupons")
    .select(
      "id, code, description, discount_type, discount_value, currency, min_amount, max_discount, valid_from, valid_until, usage_limit, usage_limit_per_user, times_used, applies_to, doctor_id, is_active",
    )
    .eq("code", code)
    .maybeSingle();
  return (data as CouponRow | null) ?? null;
}

async function userRedemptionCount(
  couponId: string,
  userId: string,
): Promise<number> {
  const { count } = await supabaseAdmin
    .from("coupon_redemptions")
    .select("id", { count: "exact", head: true })
    .eq("coupon_id", couponId)
    .eq("user_id", userId);
  return count ?? 0;
}

/**
 * Validate a coupon against the supplied booking context. Pure read — no
 * side effects. Always resolves with a result; `valid` distinguishes
 * success from any rejection reason.
 */
export async function evaluateCoupon(
  input: ValidateInput,
): Promise<CouponValidationResult> {
  const code = normalizeCode(input.code);
  const empty: CouponValidationResult = {
    valid: false,
    code: null,
    discountType: null,
    discountValue: null,
    discountAmount: 0,
    finalAmount: round2(input.amount),
    currency: input.currency.toUpperCase(),
    message: "",
  };

  if (!code) return { ...empty, message: "أدخل كود الخصم." };
  if (!Number.isFinite(input.amount) || input.amount <= 0) {
    return { ...empty, message: "المبلغ غير صالح." };
  }

  const coupon = await loadCoupon(code);
  if (!coupon || !coupon.is_active) {
    return { ...empty, message: "الكود غير صالح." };
  }

  const now = new Date();
  if (coupon.valid_from && new Date(coupon.valid_from) > now) {
    return { ...empty, message: "الكود لم يبدأ بعد." };
  }
  if (coupon.valid_until && new Date(coupon.valid_until) < now) {
    return { ...empty, message: "انتهت صلاحية الكود." };
  }
  if (
    coupon.usage_limit !== null &&
    coupon.times_used >= coupon.usage_limit
  ) {
    return { ...empty, message: "تم استنفاد عدد مرات استخدام الكود." };
  }
  if (
    coupon.applies_to !== "all" &&
    input.appointmentType &&
    !(
      coupon.applies_to === input.appointmentType ||
      (coupon.applies_to === "video" && input.appointmentType === "telehealth")
    )
  ) {
    return {
      ...empty,
      message:
        coupon.applies_to === "video"
          ? "الكود مخصّص للكشف عبر الفيديو فقط."
          : "الكود مخصّص لزيارة العيادة فقط.",
    };
  }
  if (coupon.doctor_id && input.doctorId && coupon.doctor_id !== input.doctorId) {
    return { ...empty, message: "الكود غير صالح لهذا الطبيب." };
  }
  if (
    coupon.discount_type === "fixed" &&
    coupon.currency &&
    coupon.currency.toUpperCase() !== input.currency.toUpperCase()
  ) {
    return { ...empty, message: "الكود بعملة مختلفة." };
  }
  if (coupon.min_amount !== null && input.amount < coupon.min_amount) {
    return {
      ...empty,
      message: `الحد الأدنى للطلب ${coupon.min_amount} ${input.currency.toUpperCase()}.`,
    };
  }

  if (
    input.userId &&
    coupon.usage_limit_per_user !== null &&
    coupon.usage_limit_per_user > 0
  ) {
    const used = await userRedemptionCount(coupon.id, input.userId);
    if (used >= coupon.usage_limit_per_user) {
      return { ...empty, message: "استخدمت الكود من قبل." };
    }
  }

  const { discount, final } = computeDiscount(coupon, input.amount);
  if (discount <= 0) {
    return { ...empty, message: "هذا الكود لا يخصم على المبلغ الحالي." };
  }

  return {
    valid: true,
    code: coupon.code,
    discountType: coupon.discount_type as "percent" | "fixed",
    discountValue: coupon.discount_value,
    discountAmount: discount,
    finalAmount: final,
    currency: input.currency.toUpperCase(),
    message: coupon.description ?? "تم تطبيق الخصم.",
  };
}

// =============================================================================
// Server fn: validateCoupon (callable from the booking UI)
// =============================================================================
export const validateCoupon = createServerFn({ method: "POST" })
  .inputValidator((x: unknown) => {
    const obj = x as ValidateInput | undefined;
    if (!obj || typeof obj.code !== "string") throw new Error("Missing code");
    if (typeof obj.amount !== "number") throw new Error("Missing amount");
    if (typeof obj.currency !== "string") throw new Error("Missing currency");
    if (obj.code.length > 64) throw new Error("Code too long");
    return {
      code: obj.code,
      amount: obj.amount,
      currency: obj.currency,
      appointmentType: obj.appointmentType,
      doctorId: obj.doctorId ?? null,
      userId: obj.userId ?? null,
    };
  })
  .handler(async ({ data }) => evaluateCoupon(data));

// =============================================================================
// Internal: applyCouponToAppointment
//
// Called inline by createAppointmentCheckout BEFORE redirecting to Stripe.
// Stamps `coupon_code` + `coupon_discount` on the appointment row and
// returns the validated discount. Returns null if the coupon is invalid;
// the caller is expected to fall back to the original price.
//
// Redemption is recorded only when the payment webhook fires
// (record_coupon_redemption SQL RPC) so an abandoned session leaves no
// trace.
// =============================================================================
export async function applyCouponToAppointment(args: {
  appointmentId: string;
  code: string;
  amount: number;
  currency: string;
  appointmentType?: "in_person" | "video" | "telehealth";
  doctorId?: string | null;
  userId?: string | null;
}): Promise<CouponValidationResult> {
  const result = await evaluateCoupon({
    code: args.code,
    amount: args.amount,
    currency: args.currency,
    appointmentType: args.appointmentType,
    doctorId: args.doctorId,
    userId: args.userId,
  });
  if (!result.valid || !result.code) return result;

  // Stamp the appointment with the validated discount + new fee.
  const { error } = await supabaseAdmin
    .from("appointments")
    .update({
      coupon_code: result.code,
      coupon_discount: result.discountAmount,
      fee: result.finalAmount,
      updated_at: new Date().toISOString(),
    } as never)
    .eq("id", args.appointmentId);
  if (error) {
    return {
      valid: false,
      code: result.code,
      discountType: result.discountType,
      discountValue: result.discountValue,
      discountAmount: 0,
      finalAmount: round2(args.amount),
      currency: args.currency.toUpperCase(),
      message: "تعذّر تطبيق الكود على الحجز.",
    };
  }
  return result;
}
