/**
 * Curated list of top Arab cities (Egypt + GCC + Jordan) used for
 * SEO-friendly URL slugs in /specialty/$slug/$city pages.
 *
 * Why a static map (not a DB table):
 *  - Stable, crawlable slugs (`cairo` not `%D8%A7%D9%84%D9%82%D8%A7%D9%87%D8%B1%D8%A9`)
 *  - Bilingual matching against free-text `profiles.city` / `clinics.city`
 *  - Predictable sitemap generation
 *
 * To match a city in DB queries, use `cityMatchTerms(slug)` which returns
 * all Arabic + English variants to OR-match against.
 */

export interface CityEntry {
  slug: string;
  nameAr: string;
  nameEn: string;
  countryCode: "EG" | "SA" | "AE" | "QA" | "KW" | "BH" | "OM" | "JO";
  /** Extra DB-side aliases to also match (different spellings) */
  aliases?: string[];
}

export const CITIES: CityEntry[] = [
  // Egypt
  { slug: "cairo", nameAr: "القاهرة", nameEn: "Cairo", countryCode: "EG", aliases: ["Cairo", "القاهره"] },
  { slug: "giza", nameAr: "الجيزة", nameEn: "Giza", countryCode: "EG", aliases: ["الجيزه"] },
  { slug: "alexandria", nameAr: "الإسكندرية", nameEn: "Alexandria", countryCode: "EG", aliases: ["الاسكندرية", "الاسكندريه"] },
  { slug: "mansoura", nameAr: "المنصورة", nameEn: "Mansoura", countryCode: "EG", aliases: ["المنصوره"] },
  { slug: "tanta", nameAr: "طنطا", nameEn: "Tanta", countryCode: "EG" },
  { slug: "asyut", nameAr: "أسيوط", nameEn: "Asyut", countryCode: "EG", aliases: ["اسيوط"] },
  { slug: "ismailia", nameAr: "الإسماعيلية", nameEn: "Ismailia", countryCode: "EG", aliases: ["الاسماعيلية"] },
  { slug: "port-said", nameAr: "بورسعيد", nameEn: "Port Said", countryCode: "EG" },
  { slug: "suez", nameAr: "السويس", nameEn: "Suez", countryCode: "EG" },
  { slug: "hurghada", nameAr: "الغردقة", nameEn: "Hurghada", countryCode: "EG", aliases: ["الغردقه"] },
  { slug: "luxor", nameAr: "الأقصر", nameEn: "Luxor", countryCode: "EG", aliases: ["الاقصر"] },
  { slug: "aswan", nameAr: "أسوان", nameEn: "Aswan", countryCode: "EG", aliases: ["اسوان"] },

  // Saudi Arabia
  { slug: "riyadh", nameAr: "الرياض", nameEn: "Riyadh", countryCode: "SA" },
  { slug: "jeddah", nameAr: "جدة", nameEn: "Jeddah", countryCode: "SA", aliases: ["جده"] },
  { slug: "mecca", nameAr: "مكة المكرمة", nameEn: "Mecca", countryCode: "SA", aliases: ["مكة", "مكه"] },
  { slug: "medina", nameAr: "المدينة المنورة", nameEn: "Medina", countryCode: "SA", aliases: ["المدينة", "المدينه"] },
  { slug: "dammam", nameAr: "الدمام", nameEn: "Dammam", countryCode: "SA" },
  { slug: "khobar", nameAr: "الخبر", nameEn: "Khobar", countryCode: "SA" },
  { slug: "taif", nameAr: "الطائف", nameEn: "Taif", countryCode: "SA", aliases: ["الطايف"] },
  { slug: "tabuk", nameAr: "تبوك", nameEn: "Tabuk", countryCode: "SA" },
  { slug: "abha", nameAr: "أبها", nameEn: "Abha", countryCode: "SA", aliases: ["ابها"] },

  // UAE
  { slug: "dubai", nameAr: "دبي", nameEn: "Dubai", countryCode: "AE" },
  { slug: "abu-dhabi", nameAr: "أبوظبي", nameEn: "Abu Dhabi", countryCode: "AE", aliases: ["ابوظبي", "أبو ظبي"] },
  { slug: "sharjah", nameAr: "الشارقة", nameEn: "Sharjah", countryCode: "AE", aliases: ["الشارقه"] },
  { slug: "ajman", nameAr: "عجمان", nameEn: "Ajman", countryCode: "AE" },
  { slug: "ras-al-khaimah", nameAr: "رأس الخيمة", nameEn: "Ras Al Khaimah", countryCode: "AE", aliases: ["راس الخيمة"] },

  // Qatar
  { slug: "doha", nameAr: "الدوحة", nameEn: "Doha", countryCode: "QA", aliases: ["الدوحه"] },
  { slug: "al-rayyan", nameAr: "الريان", nameEn: "Al Rayyan", countryCode: "QA" },

  // Kuwait
  { slug: "kuwait-city", nameAr: "مدينة الكويت", nameEn: "Kuwait City", countryCode: "KW", aliases: ["الكويت"] },
  { slug: "hawalli", nameAr: "حولي", nameEn: "Hawalli", countryCode: "KW" },

  // Bahrain
  { slug: "manama", nameAr: "المنامة", nameEn: "Manama", countryCode: "BH", aliases: ["المنامه"] },
  { slug: "muharraq", nameAr: "المحرق", nameEn: "Muharraq", countryCode: "BH" },

  // Oman
  { slug: "muscat", nameAr: "مسقط", nameEn: "Muscat", countryCode: "OM" },
  { slug: "salalah", nameAr: "صلالة", nameEn: "Salalah", countryCode: "OM", aliases: ["صلاله"] },

  // Jordan
  { slug: "amman", nameAr: "عمان", nameEn: "Amman", countryCode: "JO" },
  { slug: "irbid", nameAr: "إربد", nameEn: "Irbid", countryCode: "JO", aliases: ["اربد"] },
  { slug: "zarqa", nameAr: "الزرقاء", nameEn: "Zarqa", countryCode: "JO" },
  { slug: "aqaba", nameAr: "العقبة", nameEn: "Aqaba", countryCode: "JO", aliases: ["العقبه"] },
];

const BY_SLUG = new Map(CITIES.map((c) => [c.slug, c]));

export function getCityBySlug(slug: string): CityEntry | null {
  return BY_SLUG.get(slug.toLowerCase()) ?? null;
}

/** All DB-side string variants for matching against `profiles.city` / `clinics.city`. */
export function cityMatchTerms(city: CityEntry): string[] {
  return [city.nameAr, city.nameEn, ...(city.aliases ?? [])];
}

export function listAllCitySlugs(): string[] {
  return CITIES.map((c) => c.slug);
}

export const COUNTRY_NAMES_AR: Record<CityEntry["countryCode"], string> = {
  EG: "مصر",
  SA: "السعودية",
  AE: "الإمارات",
  QA: "قطر",
  KW: "الكويت",
  BH: "البحرين",
  OM: "عُمان",
  JO: "الأردن",
};
