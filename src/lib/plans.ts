// Single source of truth for doctor subscription plans.
// Used by both /join-doctor and /pricing pages.

export type PlanCode = "doctor_free" | "doctor_premium_monthly" | "doctor_gold_monthly";

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
  featured?: boolean;
  badgeEn?: string;
  badgeAr?: string;
  ctaEn: string;
  ctaAr: string;
  features: PlanFeature[];
}

export const DOCTOR_PLANS: DoctorPlan[] = [
  {
    code: "doctor_free",
    nameEn: "Free",
    nameAr: "مجانى",
    descriptionEn: "Basic profile, free bookings, 15% commission on online consultations.",
    descriptionAr: "ملف أساسي، حجوزات حضورية مجانية، عمولة 15% على الكشف الأونلاين فقط.",
    priceEgp: 0,
    ctaEn: "Start free",
    ctaAr: "ابدأ مجاناً",
    features: [
      { en: "Basic profile", ar: "ملف أساسي" },
      { en: "Visibility in organic results", ar: "ظهور في النتائج العضوية" },
      { en: "Accept in-person bookings", ar: "قبول الحجوزات الحضورية" },
      { en: "Free booking (no booking fees)", ar: "حجز مجانى" },
      { en: "15% commission on online consultations", ar: "عمولة 15% على الكشف الأونلاين" },
    ],
  },
  {
    code: "doctor_premium_monthly",
    nameEn: "Premium",
    nameAr: "بريميوم",
    descriptionEn: "Higher ranking, verified badge, e-prescriptions, priority support, lower commission.",
    descriptionAr: "ترتيب أعلى، شارة موثّق، روشتة إلكترونية، أولوية الدعم، عمولة أقل.",
    priceEgp: 500,
    featured: true,
    badgeEn: "Most popular",
    badgeAr: "الأكثر شيوعاً",
    ctaEn: "Choose Premium",
    ctaAr: "اختر بريميوم",
    features: [
      { en: "Everything in Free", ar: "كل مميزات الخطة المجانية" },
      { en: "Higher organic search ranking", ar: "ترتيب أعلى في نتائج البحث العضوية" },
      { en: "Premium badge on profile", ar: "شارة بريميوم على البروفايل" },
      { en: "E-prescription (signed digital prescriptions)", ar: "الروشتة الإلكترونية (وصفات طبية رقمية موقّعة)" },
      { en: "Detailed analytics (views, booking rates)", ar: "تحليلات مفصّلة (مشاهدات، معدلات الحجز)" },
      { en: "Priority technical support", ar: "أولوية الدعم الفني" },
      { en: "12% commission instead of 15% on online consultations", ar: "عمولة 12% بدلاً من 15% على الكشف الأون لاين" },
    ],
  },
  {
    code: "doctor_gold_monthly",
    nameEn: "Gold",
    nameAr: "جولد",
    descriptionEn: "Sponsored placements, custom subdomain, installable PWA, lab results online, lowest commission.",
    descriptionAr: "أماكن Sponsored، نطاق فرعي خاص، PWA، نتائج تحاليل أونلاين، أقل عمولة في السوق.",
    priceEgp: 1000,
    ctaEn: "Choose Gold",
    ctaAr: "اختر جولد",
    features: [
      { en: "Everything in Premium", ar: "كل مميزات Premium" },
      {
        en: "Full accounting system (invoices, expenses, monthly income reports)",
        ar: "نظام محاسبى متكامل (فواتير، مصروفات، تقارير دخل شهرية)",
      },
      {
        en: "Compete for Sponsored slots (top of results with \"Ad\" badge)",
        ar: "حق المنافسة على أماكن Sponsored (أعلى النتائج بشارة \"إعلان\")",
      },
      { en: "Daily bidding budget cap", ar: "حد ميزانية يومية للمزايدة" },
      { en: "Ad analytics (views/clicks/CTR)", ar: "تحليلات الإعلانات (مشاهدات/نقرات/CTR)" },
      { en: "Custom profile site dr-{name}.mytabibi.com", ar: "موقع بروفايل خاص dr-{name}.mytabibi.com" },
      { en: "Installable PWA branded for your clinic", ar: "PWA قابل للتنصيب باسم العيادة" },
      { en: "Online lab results delivery", ar: "نتائج تحاليل أون لاين" },
      { en: "10% commission only on online consultations (lowest in market)", ar: "عمولة 10% فقط (الأقل في السوق) على الكشف الأون لاين" },
    ],
  },
];

export function formatEgp(amount: number, lang: "ar" | "en" = "ar"): string {
  if (amount === 0) return lang === "ar" ? "0" : "0";
  return lang === "ar"
    ? amount.toLocaleString("ar-EG")
    : amount.toLocaleString("en-US");
}
