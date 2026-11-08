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

export type BillingPeriod = "monthly" | "yearly" | "lifetime";

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

export function formatEgp(amount: number, lang: "ar" | "en" = "ar"): string {
  if (amount === 0) return "0";
  return lang === "ar" ? amount.toLocaleString("ar-EG") : amount.toLocaleString("en-US");
}
