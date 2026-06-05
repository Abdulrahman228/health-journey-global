/**
 * Schema.org JSON-LD builders for Tabibi.
 *
 * Each helper returns a plain object ready to be JSON.stringify'd
 * into a `<script type="application/ld+json">` tag (via TanStack
 * Start's `head().scripts` or the `<JsonLd>` component).
 *
 * References:
 *  - https://schema.org/Physician
 *  - https://schema.org/MedicalBusiness
 *  - https://schema.org/FAQPage
 *  - https://schema.org/BreadcrumbList
 */

import { siteConfig, canonicalUrl } from "./seo";

/**
 * Root-level Organization + MedicalBusiness.
 * Place on the home page and (lighter version) on `__root.tsx`.
 */
export function organizationSchema() {
  return {
    "@context": "https://schema.org",
    "@type": ["Organization", "MedicalBusiness"],
    "@id": `${siteConfig.url}/#organization`,
    name: siteConfig.brand.en,
    // Multiple spellings so Google's Knowledge Graph matches any of
    // them (Arabic, English, and common transliterations).
    alternateName: siteConfig.brandAliases,
    url: siteConfig.url,
    logo: {
      "@type": "ImageObject",
      url: `${siteConfig.url}/og/tabibi-logo.png`,
      width: 512,
      height: 512,
    },
    image: `${siteConfig.url}${siteConfig.ogImage}`,
    description: siteConfig.defaultDescription.ar,
    foundingDate: siteConfig.organization.foundingDate,
    medicalSpecialty: [
      "GeneralPractice",
      "Cardiovascular",
      "Dermatology",
      "Pediatrics",
      "Psychiatric",
    ],
    address: {
      "@type": "PostalAddress",
      addressCountry: siteConfig.organization.addressCountry,
    },
    contactPoint: {
      "@type": "ContactPoint",
      contactType: "customer support",
      email: siteConfig.organization.email,
      availableLanguage: ["Arabic", "English"],
    },
    sameAs: [
      "https://twitter.com/tabibi_health",
      "https://facebook.com/tabibi.health",
      "https://instagram.com/tabibi.health",
    ],
  };
}

/**
 * WebSite schema with SearchAction — enables the sitelinks search box.
 */
export function websiteSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "WebSite",
    "@id": `${siteConfig.url}/#website`,
    url: siteConfig.url,
    name: siteConfig.brand.en,
    alternateName: siteConfig.brandAliases,
    description: siteConfig.defaultDescription.ar,
    inLanguage: ["ar", "en"],
    publisher: { "@id": `${siteConfig.url}/#organization` },
    potentialAction: {
      "@type": "SearchAction",
      target: {
        "@type": "EntryPoint",
        urlTemplate: `${siteConfig.url}/doctors?q={search_term_string}`,
      },
      "query-input": "required name=search_term_string",
    },
  };
}

export interface BreadcrumbItem {
  name: string;
  path: string;
}

/**
 * BreadcrumbList — pair this with a visible `<Breadcrumbs />` component.
 */
export function breadcrumbSchema(items: BreadcrumbItem[]) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: canonicalUrl(item.path),
    })),
  };
}

export interface FaqItem {
  question: string;
  answer: string;
}

/**
 * FAQPage schema — use on pages with visible Q&A blocks.
 * Rank Math rule: don't combine with FAQ Block schema.
 */
export function faqSchema(items: FaqItem[]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: item.answer,
      },
    })),
  };
}

export interface PhysicianInput {
  id: string;
  name: string;
  specialty?: string | null;
  description?: string | null;
  image?: string | null;
  telephone?: string | null;
  city?: string | null;
  country?: string | null;
  consultationFee?: number | null;
  currency?: string | null;
  ratingValue?: number | null;
  reviewCount?: number | null;
  acceptsVideo?: boolean;
  languages?: string[];
}

/**
 * Physician schema for individual doctor profile pages.
 * Combined with AggregateRating when reviews exist.
 */
export function physicianSchema(d: PhysicianInput) {
  const url = canonicalUrl(`/doctor/${d.id}`);
  const node: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Physician",
    "@id": `${url}#physician`,
    name: d.name,
    url,
  };

  if (d.image) node.image = d.image;
  if (d.description) node.description = d.description;
  if (d.specialty) node.medicalSpecialty = d.specialty;
  if (d.telephone) node.telephone = d.telephone;
  if (d.languages && d.languages.length > 0) {
    node.availableLanguage = d.languages;
  }

  if (d.city || d.country) {
    node.address = {
      "@type": "PostalAddress",
      ...(d.city ? { addressLocality: d.city } : {}),
      ...(d.country ? { addressCountry: d.country } : {}),
    };
  }

  if (d.acceptsVideo) {
    node.availableService = {
      "@type": "MedicalProcedure",
      name: "Online Video Consultation",
      procedureType: "https://schema.org/Telemedicine",
    };
  }

  if (
    typeof d.ratingValue === "number" &&
    typeof d.reviewCount === "number" &&
    d.reviewCount > 0
  ) {
    node.aggregateRating = {
      "@type": "AggregateRating",
      ratingValue: d.ratingValue.toFixed(1),
      reviewCount: d.reviewCount,
      bestRating: "5",
      worstRating: "1",
    };
  }

  if (typeof d.consultationFee === "number") {
    node.offers = {
      "@type": "Offer",
      price: d.consultationFee.toFixed(2),
      priceCurrency: d.currency || "EGP",
      availability: "https://schema.org/InStock",
      url,
    };
  }

  return node;
}

/**
 * Convenience: serialize a JSON-LD object for inline injection.
 * Strips `<` to prevent XSS via `</script>` in user-controlled fields.
 */
export function jsonLdString(obj: unknown): string {
  return JSON.stringify(obj).replace(/</g, "\\u003c");
}

export interface ReviewInput {
  id: string;
  doctorId: string;
  doctorName: string | null;
  rating: number;
  comment: string | null;
  authorName: string | null;
  createdAt: string;
}

/**
 * Individual Review schema — emitted in addition to `aggregateRating`
 * on the Physician node so Google can show a star snippet AND quote
 * actual reviewer text in the SERP.
 */
export function reviewSchema(r: ReviewInput) {
  const url = canonicalUrl(`/doctor/${r.doctorId}`);
  const node: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Review",
    "@id": `${url}#review-${r.id}`,
    itemReviewed: {
      "@type": "Physician",
      "@id": `${url}#physician`,
      ...(r.doctorName ? { name: r.doctorName } : {}),
    },
    reviewRating: {
      "@type": "Rating",
      ratingValue: r.rating,
      bestRating: 5,
      worstRating: 1,
    },
    author: {
      "@type": "Person",
      name: r.authorName || "مريض موثّق",
    },
    datePublished: r.createdAt,
  };
  if (r.comment) node.reviewBody = r.comment;
  return node;
}

export interface ClinicInput {
  id: string;
  name: string | null;
  address?: string | null;
  city?: string | null;
  phone?: string | null;
  lat?: number | null;
  lng?: number | null;
  doctorId: string;
  doctorName?: string | null;
  specialty?: string | null;
}

/**
 * MedicalClinic schema — emit one per clinic. Pairs with the Physician
 * schema (linked via `medicalSpecialty` + `employee`) so Google can
 * connect a doctor to multiple practice locations (rich Local Pack +
 * "Doctors near me" eligibility).
 */
export function medicalClinicSchema(c: ClinicInput) {
  const node: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "MedicalClinic",
    "@id": `${canonicalUrl(`/doctor/${c.doctorId}`)}#clinic-${c.id}`,
    name: c.name || "عيادة",
    url: canonicalUrl(`/doctor/${c.doctorId}`),
  };
  if (c.specialty) node.medicalSpecialty = c.specialty;
  if (c.phone) node.telephone = c.phone;

  if (c.address || c.city) {
    node.address = {
      "@type": "PostalAddress",
      ...(c.address ? { streetAddress: c.address } : {}),
      ...(c.city ? { addressLocality: c.city } : {}),
    };
  }
  if (typeof c.lat === "number" && typeof c.lng === "number") {
    node.geo = {
      "@type": "GeoCoordinates",
      latitude: c.lat,
      longitude: c.lng,
    };
  }
  if (c.doctorName) {
    node.employee = {
      "@type": "Physician",
      "@id": `${canonicalUrl(`/doctor/${c.doctorId}`)}#physician`,
      name: c.doctorName,
    };
  }
  return node;
}

export interface ArticleSchemaInput {
  slug: string;
  title: string;
  description: string | null;
  image: string | null;
  authorName: string | null;
  language: "ar" | "en";
  publishedAt: string | null;
  updatedAt: string;
}

/**
 * MedicalWebPage + Article hybrid — Google treats medical content
 * with extra E-E-A-T scrutiny, so we declare it as MedicalWebPage
 * (YMYL signal) while still emitting Article fields for rich results.
 */
export function articleSchema(a: ArticleSchemaInput) {
  const url = canonicalUrl(`/articles/${a.slug}`);
  const node: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": ["MedicalWebPage", "Article"],
    "@id": `${url}#article`,
    url,
    headline: a.title,
    inLanguage: a.language,
    datePublished: a.publishedAt ?? a.updatedAt,
    dateModified: a.updatedAt,
    mainEntityOfPage: { "@type": "WebPage", "@id": url },
    publisher: {
      "@type": "Organization",
      "@id": `${siteConfig.url}#org`,
      name: siteConfig.brand.ar,
    },
    author: {
      "@type": "Person",
      name: a.authorName || siteConfig.brand.ar,
    },
  };
  if (a.description) node.description = a.description;
  if (a.image) node.image = a.image;
  // Speakable: highlight title + intro paragraph for voice assistants
  // (Google Assistant Arabic, Alexa). Rank Math course module 7 lists
  // SpeakableSpecification as a "free YMYL boost" for medical content.
  node.speakable = {
    "@type": "SpeakableSpecification",
    cssSelector: ["h1", ".article-lead", ".prose > p:first-of-type"],
  };
  return node;
}

export interface ListItemInput {
  name: string;
  url: string;
  image?: string | null;
}

/**
 * ItemList — gives Google a "carousel" view of doctor/article lists.
 * Rank Math course module 4.2: list pages benefit from explicit
 * ItemList schema; helps trigger sitelinks-style results for /doctors,
 * /specialty/$slug, and /articles index pages.
 */
export function itemListSchema(opts: {
  name: string;
  items: ListItemInput[];
  url: string;
}) {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    "@id": `${opts.url}#itemlist`,
    name: opts.name,
    numberOfItems: opts.items.length,
    itemListElement: opts.items.map((it, i) => ({
      "@type": "ListItem",
      position: i + 1,
      url: it.url,
      name: it.name,
      ...(it.image ? { image: it.image } : {}),
    })),
  };
}

/**
 * MedicalSpecialty schema — pairs with the specialty pillar page to
 * tell Google "this hub aggregates verified Physicians in <specialty>".
 * Adds a strong YMYL E-E-A-T signal for medical search (Rank Math
 * module 7: trust-signal markup for YMYL niches).
 */
export function medicalSpecialtySchema(opts: {
  slug: string;
  nameAr: string;
  nameEn: string;
  description?: string | null;
  doctorCount: number;
}) {
  const url = canonicalUrl(`/specialty/${opts.slug}`);
  return {
    "@context": "https://schema.org",
    "@type": "MedicalSpecialty",
    "@id": `${url}#specialty`,
    name: opts.nameAr,
    alternateName: opts.nameEn,
    url,
    ...(opts.description ? { description: opts.description } : {}),
    ...(opts.doctorCount > 0
      ? {
          potentialAction: {
            "@type": "ReserveAction",
            target: url,
            description: `احجز موعد مع طبيب ${opts.nameAr} موثّق`,
          },
        }
      : {}),
    isPartOf: { "@id": `${siteConfig.url}/#organization` },
  };
}
