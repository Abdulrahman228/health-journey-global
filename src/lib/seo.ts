/**
 * SEO configuration and helpers for Tebana (طبانا), formerly Tabibi (طبيبي).
 *
 * Single source of truth for site-wide metadata, canonical URLs,
 * Open Graph defaults, and per-route meta tag generation.
 *
 * Follows Rank Math SEO best practices:
 *  - Title formula: keyword + power word + number + sentiment, ≤ 60 chars
 *  - Meta description: includes keyword + compelling CTA, ≤ 160 chars
 *  - Canonical URL on every page
 *  - Open Graph + Twitter Card on every page
 *  - hreflang for ar/en bilingual content
 */

/**
 * Override SITE_URL at build/runtime via VITE_SITE_URL.
 * Falls back to production domain placeholder.
 */
export const SITE_URL: string =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_SITE_URL) ||
  "https://mytabibi.com";

export const siteConfig = {
  url: SITE_URL,
  brand: {
    en: "Tebana",
    ar: "طبانا",
  },
  /**
   * Former brand name (طبيبي / Tabibi). The company was registered as
   * "طبانا للخدمات الإلكترونية", so the product was renamed. Kept only for
   * search continuity (JSON-LD alternateName) — never render it as the brand.
   */
  formerBrand: {
    en: "Tabibi",
    ar: "طبيبي",
  },
  /**
   * All recognized spellings of the brand name across Arabic, English,
   * and common transliterations users type into Google and app stores.
   * Used in JSON-LD `alternateName`, meta keywords, and OG metadata so
   * the site ranks for any of these queries.
   */
  brandAliases: [
    "طبانا",
    "Tebana",
    "طبانا للخدمات الإلكترونية",
    "تطبيق طبانا",
    "موقع طبانا",
    "طبانا اونلاين",
    "Tebana app",
    // Former name — kept so existing rankings and shared links keep resolving.
    "طبيبي",
    "Tabibi",
  ],
  tagline: {
    en: "Your Health, Connected",
    ar: "صحتك بين يديك",
  },
  defaultDescription: {
    en: "Tebana (طبانا) connects patients with verified doctors across the Arab world. Book appointments, video consultations, and manage medical records — all in one trusted platform.",
    ar: "طبانا (Tebana) تربطك بأفضل الأطباء الموثوقين في الوطن العربي. احجز موعدك، استشر أونلاين عبر الفيديو، وأدر سجلك الطبي في منصة واحدة آمنة.",
  },
  defaultKeywords: [
    // Arabic brand + intent queries
    "طبانا",
    "تطبيق طبانا",
    "موقع طبانا",
    "طبانا اونلاين",
    "طبيب أونلاين",
    "حجز موعد طبيب",
    "استشارة طبية أونلاين",
    "أطباء معتمدون",
    "تطبيب عن بعد",
    // English brand + transliterations
    "Tebana",
    "Tebana app",
    "Tibana",
    "Tabana",
    "online doctor",
    "telemedicine Arab world",
    "book doctor online",
    // Former brand (search continuity)
    "طبيبي",
    "Tabibi",
  ],
  ogImage: "/og/tabibi-og-default.jpg",
  // TODO(rebrand): social handle and support email not yet decided by the owner — keep as-is.
  twitterHandle: "@tabibi_health",
  locale: { primary: "ar_EG", alternate: "en_US" },
  organization: {
    legalName: "طبانا للخدمات الإلكترونية",
    legalNameEn: "Tebana for Electronic Services",
    email: "support@tabibi.health",
    phone: "+20-000-000-0000",
    foundingDate: "2025",
    addressCountry: "EG",
  },
} as const;

/**
 * doctor_details.specialty is free text: doctors type the Arabic or English
 * name, and older sign-ups stored the placeholder "General" (now "طب عام").
 * Match every accepted spelling (same rule as /doctors and search_doctors_nearby).
 */
export function specialtyTerms(spec: { name_ar: string; name_en: string; slug: string }): string[] {
  const terms = new Set([spec.name_ar, spec.name_en, spec.slug]);
  if (spec.slug === "general") terms.add("General");
  return [...terms];
}

/** Build a fully-qualified canonical URL from a path. */
export function canonicalUrl(path: string = "/"): string {
  const clean = path.startsWith("/") ? path : `/${path}`;
  return `${siteConfig.url}${clean === "/" ? "" : clean}`;
}

/** Truncate a string with ellipsis (no mid-word cuts). */
export function truncate(text: string, max: number): string {
  if (!text) return "";
  if (text.length <= max) return text;
  const slice = text.slice(0, max - 1);
  const lastSpace = slice.lastIndexOf(" ");
  return `${slice.slice(0, lastSpace > 0 ? lastSpace : slice.length).trim()}…`;
}

export interface SeoMetaInput {
  /** Page title — keyword first, ≤ 60 chars recommended */
  title: string;
  /** Meta description with keyword + CTA, ≤ 160 chars recommended */
  description: string;
  /** Canonical path (e.g. "/doctors") — leading slash optional */
  path?: string;
  /** Per-page OG image (absolute or root-relative). Falls back to default. */
  image?: string;
  /** "website" | "article" | "profile" — default "website" */
  type?: "website" | "article" | "profile";
  /** Disable indexing (login, dashboard, admin pages) */
  noindex?: boolean;
  /** Page language ("ar" | "en"). Affects og:locale only. */
  locale?: "ar" | "en";
  /** Article publish date (ISO 8601) for articles */
  publishedTime?: string;
  /** Article modified date (ISO 8601) */
  modifiedTime?: string;
  /** Comma-joined keywords (optional — Google ignores but Bing/Yandex use) */
  keywords?: string[];
}

/**
 * Build the meta array consumed by TanStack Start's `head()`.
 *
 * Usage in a route:
 * ```ts
 * head: () => ({ meta: buildMeta({ title: "...", description: "...", path: "/doctors" }) })
 * ```
 */
export function buildMeta(input: SeoMetaInput) {
  const title = truncate(input.title, 60);
  const description = truncate(input.description, 160);
  const canonical = canonicalUrl(input.path ?? "/");
  const image = input.image
    ? input.image.startsWith("http")
      ? input.image
      : `${siteConfig.url}${input.image}`
    : `${siteConfig.url}${siteConfig.ogImage}`;
  const ogLocale =
    input.locale === "en" ? "en_US" : siteConfig.locale.primary;
  const ogLocaleAlt =
    input.locale === "en" ? siteConfig.locale.primary : siteConfig.locale.alternate;
  const type = input.type ?? "website";

  const meta: Array<Record<string, string>> = [
    { title },
    { name: "description", content: description },
    {
      name: "robots",
      content: input.noindex
        ? "noindex, nofollow"
        : "index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1",
    },
    // Open Graph
    { property: "og:type", content: type },
    { property: "og:title", content: title },
    { property: "og:description", content: description },
    { property: "og:url", content: canonical },
    { property: "og:image", content: image },
    { property: "og:image:alt", content: title },
    { property: "og:site_name", content: siteConfig.brand.en },
    { property: "og:locale", content: ogLocale },
    { property: "og:locale:alternate", content: ogLocaleAlt },
    // Content freshness signal (Rank Math advanced SEO)
    { property: "og:updated_time", content: new Date().toISOString() },
    { property: "article:modified_time", content: new Date().toISOString() },
    // Twitter
    { name: "twitter:card", content: "summary_large_image" },
    { name: "twitter:site", content: siteConfig.twitterHandle },
    { name: "twitter:title", content: title },
    { name: "twitter:description", content: description },
    { name: "twitter:image", content: image },
  ];

  if (input.keywords && input.keywords.length > 0) {
    meta.push({ name: "keywords", content: input.keywords.join(", ") });
  }
  if (type === "article") {
    if (input.publishedTime) {
      meta.push({ property: "article:published_time", content: input.publishedTime });
    }
    if (input.modifiedTime) {
      meta.push({ property: "article:modified_time", content: input.modifiedTime });
    }
  }

  return meta;
}

/**
 * Build canonical + hreflang link tags for TanStack Start `head()`.
 *
 * Tabibi serves the same URL for all Arabic-speaking markets (the UI
 * language is controlled by user preference, not the URL), so we
 * declare regional hreflang variants pointing back to the same
 * canonical. This is the Google-recommended pattern for sites that
 * use one URL for multiple regions of the same language:
 *   https://developers.google.com/search/docs/specialty/international/localized-versions
 *
 * Region codes target our priority Arab markets (Egypt + GCC + Jordan).
 * `x-default` is the global fallback for any other Arabic locale.
 */
export function buildSeoLinks(path: string = "/") {
  // Canonical only. hreflang is for DIFFERENT URLs per language/region; with a
  // single URL per page (UI language is a user preference) the nine regional
  // variants were noise that the 2026-11 audit flagged. Add hreflang back only
  // when an /en URL tree exists.
  return [{ rel: "canonical", href: canonicalUrl(path) }];
}
