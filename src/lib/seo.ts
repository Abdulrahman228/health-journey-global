/**
 * SEO configuration and helpers for Tabibi (طبيبي).
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
  (typeof import.meta !== "undefined" && (import.meta as any).env?.VITE_SITE_URL) ||
  "https://tabibi.health";

export const siteConfig = {
  url: SITE_URL,
  brand: {
    en: "Tabibi",
    ar: "طبيبي",
  },
  tagline: {
    en: "Your Health, Connected",
    ar: "صحتك بين يديك",
  },
  defaultDescription: {
    en: "Tabibi connects patients with verified doctors across the Arab world. Book appointments, video consultations, and manage medical records — all in one trusted platform.",
    ar: "طبيبي يربطك بأفضل الأطباء الموثوقين في الوطن العربي. احجز موعدك، استشر أونلاين عبر الفيديو، وأدر سجلك الطبي في منصة واحدة آمنة.",
  },
  defaultKeywords: [
    "طبيب أونلاين",
    "حجز موعد طبيب",
    "استشارة طبية أونلاين",
    "أطباء معتمدون",
    "تطبيب عن بعد",
    "Tabibi",
    "online doctor",
    "telemedicine Arab world",
  ],
  ogImage: "/og/tabibi-og-default.jpg",
  twitterHandle: "@tabibi_health",
  locale: { primary: "ar_AR", alternate: "en_US" },
  organization: {
    legalName: "Tabibi Health Technologies",
    email: "support@tabibi.health",
    phone: "+20-000-000-0000",
    foundingDate: "2025",
    addressCountry: "EG",
  },
} as const;

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

/** Build the canonical + hreflang link tags for TanStack Start `head()`. */
export function buildSeoLinks(path: string = "/") {
  const canonical = canonicalUrl(path);
  const cleanPath = path === "/" ? "" : path.startsWith("/") ? path : `/${path}`;
  return [
    { rel: "canonical", href: canonical },
    { rel: "alternate", hrefLang: "ar", href: `${siteConfig.url}${cleanPath}` },
    { rel: "alternate", hrefLang: "en", href: `${siteConfig.url}/en${cleanPath}` },
    { rel: "alternate", hrefLang: "x-default", href: canonical },
  ];
}
