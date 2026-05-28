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
    alternateName: siteConfig.brand.ar,
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
    alternateName: siteConfig.brand.ar,
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
