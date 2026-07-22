// Single source of truth for doctor subscription plans.
// Used by /pricing and /join-doctor.
//
// Model: Gold is the single paid tier, offered Monthly (999) or Yearly (9999).
// (doctor_free remains a valid code for the default/unsubscribed tier and legacy
// references, but is not shown as a purchasable option.)

export type PlanCode = "doctor_free" | "doctor_gold_monthly" | "doctor_gold_yearly";

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
  billingPeriod: "monthly" | "yearly";
  featured?: boolean;
  badgeEn?: string;
  badgeAr?: string;
  ctaEn: string;
  ctaAr: string;
  features: PlanFeature[];
}

export const GOLD_MONTHLY_PRICE_EGP = 999;
export const GOLD_YEARLY_PRICE_EGP = 9999;

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

// Gold's full feature set — identical for Monthly and Yearly (same tier, only the
// billing period differs).
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
  { en: "Custom profile site dr-{name}.mytabibi.com", ar: "موقع بروفايل خاص dr-{name}.mytabibi.com" },
  { en: "Installable branded PWA for your clinic", ar: "تطبيق PWA قابل للتنصيب باسم عيادتك" },
  { en: "Online lab-results delivery", ar: "نتائج تحاليل أون لاين" },
  {
    en: "10% commission on online consultations only (lowest in market)",
    ar: "عمولة 10% على الكشف الأونلاين فقط (الأقل في السوق)",
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
];

export function formatEgp(amount: number, lang: "ar" | "en" = "ar"): string {
  if (amount === 0) return "0";
  return lang === "ar" ? amount.toLocaleString("ar-EG") : amount.toLocaleString("en-US");
}
