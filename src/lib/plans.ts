// Single source of truth for doctor subscription plans.
// Used by /pricing and /join-doctor.
//
// Model: Gold is the single paid tier, offered Monthly (999), Yearly (9999) or
// Lifetime (19999, one payment, never expires — stored as a subscription with a
// NULL current_period_end, which doctor_active_tier() treats as "never expires").
// (doctor_free remains a valid code for the default/unsubscribed tier and legacy
// references, but is not shown as a purchasable option.)

export type PlanCode =
  | "doctor_free"
  | "doctor_gold_monthly"
  | "doctor_gold_yearly"
  | "doctor_gold_lifetime";

export type BillingPeriod = "free" | "monthly" | "yearly" | "lifetime";

/** Every new doctor gets Gold free for this many days from the join date (DB: grant_doctor_trial_if_absent). */
export const TRIAL_DAYS = 30;

/** Price suffix for a billing period ("ج.م / شهرياً", "ج.م مرة واحدة", "للأبد"…). */
export function periodLabel(period: BillingPeriod, lang: "ar" | "en" = "ar"): string {
  const ar: Record<BillingPeriod, string> = { free: "للأبد", monthly: "ج.م / شهرياً", yearly: "ج.م / سنوياً", lifetime: "ج.م مرة واحدة" };
  const en: Record<BillingPeriod, string> = { free: "forever", monthly: "EGP / month", yearly: "EGP / year", lifetime: "EGP one-time" };
  return (lang === "ar" ? ar : en)[period];
}

export interface PlanFeature {
  en: string;
  ar: string;
}

export interface DoctorPlan {
  code: PlanCode;
  nameEn: string;
  nameAr: string;
  descriptionAr: string;
  descriptionEn: string;
  priceEgp: number; // 0 for free
  billingPeriod: BillingPeriod;
  featured?: boolean;
  badgeEn?: string;
  badgeAr?: string;
  ctaEn: string;
  ctaAr: string;
  features: PlanFeature[];
}

export const GOLD_MONTHLY_PRICE_EGP = 999;
export const GOLD_YEARLY_PRICE_EGP = 9999;
export const GOLD_LIFETIME_PRICE_EGP = 19999;

/** True for plan codes that never expire. */
export function isLifetimePlan(code: string | null | undefined): boolean {
  return code === "doctor_gold_lifetime";
}

/**
 * Annual savings from paying yearly instead of monthly-for-a-year:
 *   (monthly × 12) − yearly. Never negative.
 */
export function annualSavingsEgp(
  monthly: number = GOLD_MONTHLY_PRICE_EGP,
  yearly: number = GOLD_YEARLY_PRICE_EGP,
): number {
  return Math.max(0, monthly * 12 - yearly);
}

// Gold's full feature set — identical for every billing period (same tier, only
// how long it lasts differs).
const GOLD_FEATURES: PlanFeature[] = [
  { en: "Everything in Free", ar: "كل مميزات الخطة المجانية" },
  { en: "Higher organic search ranking", ar: "ترتيب أعلى في نتائج البحث العضوية" },
  { en: "Gold badge on your profile", ar: "شارة جولد على البروفايل" },
  { en: "E-prescriptions (signed digital prescriptions)", ar: "الروشتة الإلكترونية (وصفات موقّعة رقمياً)" },
  { en: "Detailed analytics (views, booking rates)", ar: "تحليلات مفصّلة (مشاهدات، معدلات الحجز)" },
  { en: "Priority technical support", ar: "أولوية الدعم الفني" },
  {
    en: "Full accounting system (invoices, expenses, monthly reports)",
    ar: "نظام محاسبى متكامل (فواتير، مصروفات، تقارير شهرية)",
  },
  { en: "Compete for Sponsored slots (top of results)", ar: "المنافسة على أماكن Sponsored (أعلى النتائج)" },
  { en: "Your own profile page: mytabibi.com/d/your-name", ar: "صفحة خاصة باسمك: mytabibi.com/d/اسمك" },
  { en: "Installable branded PWA for your clinic", ar: "تطبيق PWA قابل للتنصيب باسم عيادتك" },
  { en: "Online lab-results delivery", ar: "نتائج تحاليل أون لاين" },
  {
    en: "10% commission on online consultations only — 0% on clinic visits",
    ar: "عمولة 10% على الكشف الأونلاين فقط — و0% على كشف العيادة",
  },
];

// What a doctor gets without paying — honest to the code: only the AI
// assistant, analytics, the accounting module, sponsored slots and the 10 %
// commission are Gold-gated.
export const FREE_PLAN: DoctorPlan = {
  code: "doctor_free",
  nameEn: "Free",
  nameAr: "الخطة المجانية",
  descriptionEn: "Everything you need to run bookings. No card, no expiry.",
  descriptionAr: "كل ما تحتاجه لإدارة حجوزاتك. بدون كارت وبلا انتهاء.",
  priceEgp: 0,
  billingPeriod: "free",
  ctaEn: "Start free",
  ctaAr: "ابدأ مجاناً",
  features: [
    { en: "Doctor profile listed in search results", ar: "ملف طبيب يظهر في نتائج البحث" },
    { en: "Unlimited clinic bookings (queue + appointments) — 0% commission", ar: "حجز بالدور والمواعيد للعيادة بلا حدود — 0% عمولة" },
    { en: "Live waiting room and queue", ar: "غرفة انتظار ودور مباشر" },
    { en: "Online video consultations (15% commission)", ar: "استشارات فيديو أونلاين (عمولة 15%)" },
    { en: "Medical record and e-prescription for every patient", ar: "سجل طبي وروشتة إلكترونية لكل مريض" },
    { en: "Doctor app on Android and iOS", ar: "تطبيق الطبيب على أندرويد وآيفون" },
    { en: "Standard support", ar: "دعم فني" },
  ],
};

/** Paid plans only (what /pricing lets a doctor buy). */
export const DOCTOR_PLANS: DoctorPlan[] = [
  {
    code: "doctor_gold_monthly",
    nameEn: "Gold Monthly",
    nameAr: "جولد شهري",
    descriptionEn: "Full Gold access, billed monthly. Cancel anytime.",
    descriptionAr: "كل مزايا جولد، فوترة شهرية. ألغِ في أي وقت.",
    priceEgp: GOLD_MONTHLY_PRICE_EGP,
    billingPeriod: "monthly",
    ctaEn: "Subscribe monthly",
    ctaAr: "اشترك شهرياً",
    features: GOLD_FEATURES,
  },
  {
    code: "doctor_gold_yearly",
    nameEn: "Gold Yearly",
    nameAr: "جولد سنوي",
    descriptionEn: "Full Gold access, billed yearly — best value.",
    descriptionAr: "كل مزايا جولد، فوترة سنوية — أفضل قيمة.",
    priceEgp: GOLD_YEARLY_PRICE_EGP,
    billingPeriod: "yearly",
    featured: true,
    badgeEn: "Best Value",
    badgeAr: "أفضل قيمة",
    ctaEn: "Subscribe yearly",
    ctaAr: "اشترك سنوياً",
    features: GOLD_FEATURES,
  },
  {
    code: "doctor_gold_lifetime",
    nameEn: "Gold Lifetime",
    nameAr: "جولد مدى الحياة",
    descriptionEn: "Pay once, keep every Gold feature for life.",
    descriptionAr: "ادفع مرة واحدة واحتفظ بكل مزايا جولد مدى الحياة.",
    priceEgp: GOLD_LIFETIME_PRICE_EGP,
    billingPeriod: "lifetime",
    badgeEn: "One payment",
    badgeAr: "دفعة واحدة",
    ctaEn: "Get lifetime access",
    ctaAr: "اشترك مدى الحياة",
    features: GOLD_FEATURES,
  },
];

/** Free + paid, for pages that show the whole ladder. */
export const ALL_PLANS: DoctorPlan[] = [FREE_PLAN, ...DOCTOR_PLANS];

export function formatEgp(amount: number, lang: "ar" | "en" = "ar"): string {
  if (amount === 0) return "0";
  return lang === "ar" ? amount.toLocaleString("ar-EG") : amount.toLocaleString("en-US");
}
