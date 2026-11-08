# Schema audit - https://mytabibi.com (2026-11-08)
Method: raw curl HTML (no Playwright). JSON-LD IS server-rendered on all pages. Score: 62/100.
Assets: /og/tabibi-logo.png 200 image/png; /og/tabibi-og-default.jpg 200 image/jpeg (dimensions not verified; logo claims 512x512).

## Site-wide (every page)
- Organization+MedicalBusiness @id #organization and WebSite @id #website (SearchAction, EntryPoint) - valid, no duplicate @ids on a page.
- WARN: @type ["Organization","MedicalBusiness"] - MedicalBusiness is a LocalBusiness-like type needing real address; address only has addressCountry. Better: Organization + MedicalOrganization (it is a directory, not a clinic).
- ERROR: medicalSpecialty values: "Pediatrics" is not a schema.org MedicalSpecialty member (correct: "Pediatric"); "GeneralPractice" is not a member (use "PrimaryCare"/omit). Also, a marketplace listing specialties is dubious on Organization.
- WARN: alternateName on both Org and WebSite has 11 entries incl. duplicates ("Tebana","طبانا") and misspellings (Tibana, Tabana) - keyword stuffing; trim to 2-3 (WebSite alternateName: "طبانا").
- WARN: name "Tebana" while legalName/Arabic brand differs; add Arabic via alternateName only.
- WARN: contactPoint email support@tabibi.health and sameAs handles (tabibi_health, tabibi.health) are legacy brand; twitter.com should be x.com; unverified that they exist/untestable. No telephone.
- WARN: foundingDate "2025" valid; logo ImageObject ok (min 112px).
- Site-wide DEFECT (not schema but affects it): two rel="canonical" tags on every sub-page - first is the static index.html "https://mytabibi.com" (home), second is the correct page URL. Google may pick the home canonical and consolidate all pages into home. Also canonical has no trailing-slash consistency with @id urls (fine).

## /
Exists: Organization+MedicalBusiness, WebSite+SearchAction, FAQPage (4 Q, all with acceptedAnswer text) - matches expectation.
- INFO: FAQPage gives no Google SERP benefit since 2026-05-07; AI/GEO value unconfirmed. Keep optional, low priority.
- Missing: no BreadcrumbList needed on home; MedicalWebPage/WebPage not present.
- SearchAction target https://mytabibi.com/doctors?q= - verify the route actually reads ?q (untested).

## /doctors
Exists: Org, WebSite, BreadcrumbList (Home > الأطباء) valid.
- No ItemList. Doctor cards are not in raw HTML (no /doctor links found) - list is client-rendered, so ItemList/Physician cannot be seen by non-JS crawlers.
- Missing: CollectionPage + ItemList of Physician (url, name, image, medicalSpecialty) once listings are SSR/prerendered.

## /specialty/internal
Exists: Org, WebSite, MedicalSpecialty, BreadcrumbList (x2), FAQPage (4 Q).
- ERROR: two BreadcrumbList blocks with conflicting trails (one 2 items starting at الأطباء, one 3 items with Home). Keep only the 3-item one.
- ERROR: MedicalSpecialty used as a page entity with url/description/isPartOf(Organization). MedicalSpecialty is an enumeration, not a page; isPartOf not valid on it. Replace with CollectionPage/MedicalWebPage {about: {"@type":"MedicalSpecialty", name...}}, mainEntity ItemList of Physician.
- ERROR (content): FAQ answer renders "حالياً 0+ طبيب باطنة موثّق" - placeholder-like count of zero leaks into structured data and visible copy; suppress sentence when count is 0.
- WARN: FAQ claims "HIPAA" encryption - unverifiable compliance claim (YMYL risk).
- Last breadcrumb item has item URL (fine). No ItemList.

## /articles
Exists: Org, WebSite, BreadcrumbList with single item (المقالات) - WARN: add Home as position 1; a single-item trail is of little value.
- No CollectionPage/ItemList; no article links in raw HTML (client-rendered or empty). Could not select an article to test; Article/BlogPosting (author Person, datePublished, dateModified, image, publisher, MedicalWebPage + reviewedBy) UNTESTED.

## /join-doctor
Exists: Org, WebSite only. No BreadcrumbList/WebPage. Missing: WebPage (or Service for doctor onboarding) + BreadcrumbList. Title is mixed Arabic|English.

## /pricing
Exists: Org, WebSite only. Title "خطة جولد للأطباء" (Gold plan for doctors).
- Missing: Product/Service with Offer (price, priceCurrency EGP, availability, url, seller @id #organization). Note Google Product rich results require visible price; without Offer there is nothing to validate. Add BreadcrumbList.

## Missing high-value types (medical directory)
MedicalOrganization (replace MedicalBusiness), Physician (+ MedicalClinic/ MedicalBusiness location per doctor page, with address, geo, openingHours, aggregateRating only from genuine first-party reviews), BreadcrumbList on /join-doctor, /pricing, home-linked trails, MedicalWebPage on specialty/article pages (lastReviewed, reviewedBy), CollectionPage+ItemList on /doctors, /articles, specialty. Doctor profile pages (/doctor/...) not audited (no URL discovered in raw HTML).

## Untestable
Playwright-rendered DOM, article/doctor detail pages, sameAs liveness, SearchAction ?q handling, Google Rich Results Test (no network access to it), image dimensions.
