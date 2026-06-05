/**
 * /specialty/$slug/$city — Specialty × City combo page.
 *
 * Highest commercial-intent SEO target ("best cardiologist in Riyadh").
 * Falls under MOFU/BOFU per the Rank Math AI-Search module — these
 * pages are resistant to AI Overviews because they need fresh, local,
 * trust-laden data (rating + price + verification + booking CTA).
 */
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { Star, BadgeCheck, MapPin, ArrowRight, Video, Stethoscope } from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";
import { useCurrency } from "@/hooks/useCurrency";
import { buildMeta, buildSeoLinks, canonicalUrl } from "@/lib/seo";
import { breadcrumbSchema, faqSchema, itemListSchema, jsonLdString } from "@/lib/schema";
import {
  loadSpecialtyCityForSeo,
  type SpecialtyCitySeoData,
} from "@/lib/seo.functions";
import { Breadcrumbs } from "@/components/Breadcrumbs";

function buildTitle(d: SpecialtyCitySeoData | null, slug: string, citySlug: string): string {
  if (!d) return `أفضل أطباء ${slug} في ${citySlug} | طبيبي`;
  const count = d.doctorCount > 0 ? `+${d.doctorCount}` : "نخبة من";
  return `أفضل أطباء ${d.specialty.nameAr} في ${d.city.nameAr} ${count} طبيب | طبيبي`;
}

function buildDescription(d: SpecialtyCitySeoData | null): string {
  if (!d) {
    return "تصفّح أفضل الأطباء حسب التخصص والمدينة واحجز موعدك أونلاين على منصة طبيبي.";
  }
  const cnt = d.doctorCount > 0 ? `${d.doctorCount}+ طبيب موثّق` : "أطباء موثّقون";
  return `${cnt} في تخصص ${d.specialty.nameAr} داخل ${d.city.nameAr}. قارن التقييمات والأسعار، احجز حضورياً أو فيديو في دقائق على طبيبي — تأكيد فوري.`;
}

function buildFaq(d: SpecialtyCitySeoData) {
  return [
    {
      question: `كم سعر الكشف عند أفضل أطباء ${d.specialty.nameAr} في ${d.city.nameAr}؟`,
      answer: `الأسعار تختلف من طبيب لآخر حسب الخبرة ونوع الكشف. سعر الكشف يظهر بوضوح في ملف كل طبيب قبل تأكيد الحجز، بدون رسوم خفية.`,
    },
    {
      question: `هل أستطيع حجز موعد فيديو مع طبيب ${d.specialty.nameAr} في ${d.city.nameAr}؟`,
      answer: `نعم — كثير من أطباء ${d.specialty.nameAr} في ${d.city.nameAr} على طبيبي يدعمون استشارات الفيديو المشفّرة. ابحث عن علامة "كشف أون لاين" بجانب اسم الطبيب.`,
    },
    {
      question: `كيف أحجز موعد طبيب ${d.specialty.nameAr} في ${d.city.nameAr} الآن؟`,
      answer: `اختر طبيب من القائمة، اطّلع على تقييمات المرضى وسعر الكشف، حدد الموعد المناسب من جدول العيادة، وأكد الحجز. ستصلك رسالة تأكيد فوراً.`,
    },
    {
      question: `هل أطباء ${d.specialty.nameAr} على طبيبي مرخّصون رسمياً؟`,
      answer: `نعم — كل طبيب يمر بمرحلة تحقق صارمة من الترخيص والشهادات قبل عرض ملفه. تظهر شارة "موثّق" بجانب اسم الطبيب المعتمد.`,
    },
  ];
}

export const Route = createFileRoute("/specialty/$slug/$city")({
  loader: async ({ params }) => {
    const data = await loadSpecialtyCityForSeo({
      data: { slug: params.slug, city: params.city },
    });
    if (!data) throw notFound();
    return { data };
  },
  head: ({ params, loaderData }) => {
    const d = loaderData?.data ?? null;
    const path = `/specialty/${params.slug}/${params.city}`;
    const title = buildTitle(d, params.slug, params.city);
    const description = buildDescription(d);

    const scripts: Array<{ type: string; children: string }> = [];
    if (d) {
      scripts.push({
        type: "application/ld+json",
        children: jsonLdString(
          breadcrumbSchema([
            { name: "الأطباء", path: "/doctors" },
            { name: d.specialty.nameAr, path: `/specialty/${d.specialty.slug}` },
            { name: d.city.nameAr, path },
          ]),
        ),
      });
      scripts.push({
        type: "application/ld+json",
        children: jsonLdString(faqSchema(buildFaq(d))),
      });
      if (d.topDoctors.length > 0) {
        scripts.push({
          type: "application/ld+json",
          children: jsonLdString(
            itemListSchema({
              name: `أطباء ${d.specialty.nameAr} في ${d.city.nameAr}`,
              url: canonicalUrl(path),
              items: d.topDoctors.map((doc) => ({
                name: doc.name ?? `طبيب ${d.specialty.nameAr}`,
                url: canonicalUrl(`/doctor/${doc.id}`),
                image: doc.avatarUrl,
              })),
            }),
          ),
        });
      }
    }

    return {
      meta: buildMeta({
        title,
        description,
        path,
        keywords: d
          ? [
              `أفضل طبيب ${d.specialty.nameAr} ${d.city.nameAr}`,
              `طبيب ${d.specialty.nameAr} ${d.city.nameAr}`,
              `${d.specialty.nameEn} ${d.city.nameEn}`,
              `best ${d.specialty.nameEn} doctor ${d.city.nameEn}`,
              "حجز موعد طبيب",
              "طبيبي",
            ]
          : undefined,
      }),
      links: buildSeoLinks(path),
      scripts,
    };
  },
  component: SpecialtyCityPage,
});

function SpecialtyCityPage() {
  const { data } = Route.useLoaderData();
  const { language, t } = useLanguage();
  const { formatPrice } = useCurrency();

  const specName = language === "ar" ? data.specialty.nameAr : data.specialty.nameEn;
  const cityName = language === "ar" ? data.city.nameAr : data.city.nameEn;
  const faq = buildFaq(data);

  return (
    <div className="min-h-screen bg-background">
      <Breadcrumbs
        items={[
          { name: t("Doctors", "الأطباء"), path: "/doctors" },
          { name: specName, path: `/specialty/${data.specialty.slug}` },
          { name: cityName, path: `/specialty/${data.specialty.slug}/${data.city.slug}` },
        ]}
      />

      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
        {/* Hero — keyword in H1 + first 10% of content (Rank Math On-Page rule) */}
        <header className="mb-10">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Stethoscope className="h-6 w-6" />
            </span>
            <div>
              <h1 className="text-3xl font-bold text-foreground sm:text-4xl">
                {t(
                  `Best ${data.specialty.nameEn} doctors in ${data.city.nameEn}`,
                  `أفضل أطباء ${data.specialty.nameAr} في ${data.city.nameAr}`,
                )}
              </h1>
              <p className="mt-1 text-muted-foreground">
                {data.doctorCount > 0
                  ? t(
                      `${data.doctorCount}+ verified ${data.specialty.nameEn} doctors in ${data.city.nameEn}`,
                      `+${data.doctorCount} طبيب ${data.specialty.nameAr} موثّق في ${data.city.nameAr}`,
                    )
                  : t("Trusted local doctors near you", "أطباء موثوقون بقربك")}
              </p>
            </div>
          </div>
          <p className="mt-6 max-w-3xl text-base leading-relaxed text-muted-foreground">
            {t(
              `Find and book the best ${data.specialty.nameEn} doctors in ${data.city.nameEn} on Tabibi. Compare verified profiles, real patient ratings, consultation fees, and availability — then book in-person or video in minutes.`,
              `ابحث واحجز مع أفضل أطباء ${data.specialty.nameAr} في ${data.city.nameAr} على منصة طبيبي. قارن بين الملفات الموثّقة وتقييمات المرضى الحقيقية وأسعار الكشف وجدول المواعيد، ثم احجز حضورياً أو عبر فيديو في دقائق.`,
            )}
          </p>
        </header>

        {/* Doctor cards */}
        {data.topDoctors.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border p-10 text-center">
            <p className="text-muted-foreground">
              {t(
                `No verified ${data.specialty.nameEn} doctors in ${data.city.nameEn} yet.`,
                `لا يوجد أطباء ${data.specialty.nameAr} موثّقون في ${data.city.nameAr} حالياً.`,
              )}
            </p>
            <Link
              to="/specialty/$slug"
              params={{ slug: data.specialty.slug }}
              className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
            >
              {t(`See all ${data.specialty.nameEn} doctors`, `كل أطباء ${data.specialty.nameAr}`)}{" "}
              <ArrowRight className="h-4 w-4 rtl:rotate-180" />
            </Link>
          </div>
        ) : (
          <section
            aria-label={t("Top doctors", "أفضل الأطباء")}
            className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
          >
            {data.topDoctors.map((doc: SpecialtyCitySeoData["topDoctors"][number]) => (
              <Link
                key={doc.id}
                to="/doctor/$id"
                params={{ id: doc.id }}
                className="group block rounded-2xl border border-border bg-card p-5 transition-shadow hover:shadow-lg"
              >
                <div className="flex items-start gap-3">
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-linear-to-br from-primary to-teal text-xl font-semibold text-primary-foreground">
                    {(doc.name?.charAt(0) ?? "?").toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <h2 className="truncate text-base font-semibold text-foreground">
                        {doc.name ?? t("Doctor", "طبيب")}
                      </h2>
                      <BadgeCheck className="h-4 w-4 shrink-0 text-teal" aria-label={t("Verified", "موثّق")} />
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {specName} — {cityName}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                      {typeof doc.rating === "number" && doc.rating > 0 && (
                        <span className="inline-flex items-center gap-1">
                          <Star className="h-3.5 w-3.5 fill-current text-amber-500" />
                          <span className="font-medium text-foreground">{doc.rating.toFixed(1)}</span>
                        </span>
                      )}
                      {doc.yearsExperience ? (
                        <span>
                          {doc.yearsExperience} {t("yrs", "سنة")}
                        </span>
                      ) : null}
                      {doc.telemedicineEnabled && (
                        <span className="inline-flex items-center gap-1 text-teal">
                          <Video className="h-3.5 w-3.5" /> {t("Video", "فيديو")}
                        </span>
                      )}
                    </div>
                    {typeof doc.consultationFee === "number" && doc.consultationFee > 0 && (
                      <p className="mt-2 text-sm font-medium text-foreground">
                        {formatPrice(doc.consultationFee, doc.currency || "EGP")}
                      </p>
                    )}
                  </div>
                </div>
                <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-primary group-hover:gap-2 transition-all">
                  {t("View profile & book", "عرض الملف والحجز")}{" "}
                  <ArrowRight className="h-4 w-4 rtl:rotate-180" />
                </span>
              </Link>
            ))}
          </section>
        )}

        {/* Internal links: back to pillar + sibling cities (sibling-link discovery) */}
        <section className="mt-12 rounded-2xl border border-border bg-card p-6">
          <h2 className="text-lg font-semibold text-foreground">
            <MapPin className="me-1 inline h-5 w-5 text-primary" />
            {t(`More cities for ${data.specialty.nameEn} doctors`, `مدن أخرى لأطباء ${data.specialty.nameAr}`)}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {t(
              "Looking for a doctor in another city? Browse the specialty pillar:",
              "تبحث عن طبيب في مدينة أخرى؟ تصفّح الصفحة الرئيسية للتخصص:",
            )}
          </p>
          <Link
            to="/specialty/$slug"
            params={{ slug: data.specialty.slug }}
            className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
          >
            {t(`All ${data.specialty.nameEn} doctors`, `كل أطباء ${data.specialty.nameAr}`)}{" "}
            <ArrowRight className="h-4 w-4 rtl:rotate-180" />
          </Link>
        </section>

        {/* FAQ (visible) — pairs with FAQPage JSON-LD */}
        <section className="mt-12">
          <h2 className="text-2xl font-bold text-foreground">
            {t("Frequently asked questions", "أسئلة شائعة")}
          </h2>
          <div className="mt-4 space-y-3">
            {faq.map((q, i) => (
              <details
                key={i}
                className="group rounded-xl border border-border bg-card p-5 open:shadow-sm"
              >
                <summary className="cursor-pointer text-base font-semibold text-foreground marker:hidden">
                  {q.question}
                </summary>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{q.answer}</p>
              </details>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
