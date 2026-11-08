/**
 * /specialty/$slug — Pillar (Silo) page for a medical specialty.
 *
 * Implements the Silo + Hub structure from the Rank Math course:
 *  - The Pillar page lists all verified doctors in the specialty,
 *    aggregates rating, and links out to each doctor profile (Spokes).
 *  - Internal linking stays inside the specialty silo.
 */
import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { Star, MapPin, BadgeCheck, Stethoscope, ArrowRight, Video } from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";
import { useCurrency } from "@/hooks/useCurrency";
import { buildMeta, buildSeoLinks, canonicalUrl, siteConfig } from "@/lib/seo";
import {
  breadcrumbSchema,
  faqSchema,
  itemListSchema,
  jsonLdString,
  medicalSpecialtySchema,
} from "@/lib/schema";
import { loadSpecialtyForSeo, type SpecialtySeoData } from "@/lib/seo.functions";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { CITIES } from "@/lib/cities";

function buildSpecialtyTitle(s: SpecialtySeoData | null, slug: string): string {
  if (!s) return `أفضل أطباء ${slug} | طبانا`;
  const count = s.doctorCount > 0 ? `+${s.doctorCount} طبيب` : "أطباء موثّقون";
  return `أفضل أطباء ${s.nameAr} — ${count} | طبانا`;
}

function buildSpecialtyDescription(s: SpecialtySeoData | null): string {
  if (!s) {
    return "تصفّح أفضل الأطباء حسب التخصص واحجز موعدك أونلاين على منصة طبانا.";
  }
  const count = s.doctorCount > 0 ? `${s.doctorCount}+ طبيب موثّق` : "نخبة من الأطباء الموثّقين";
  return `${count} في تخصص ${s.nameAr} (${s.nameEn}). قارن التقييمات والأسعار واحجز موعدك حضورياً أو عبر فيديو في دقائق على طبانا.`;
}

function specialtyFaq(s: SpecialtySeoData) {
  return [
    {
      question: `كم تكلفة الكشف عند أطباء ${s.nameAr} على طبانا؟`,
      answer:
        `الأسعار تختلف بين الأطباء، ويظهر سعر الكشف بوضوح في ملف كل طبيب قبل الحجز، بدون رسوم خفية.` +
        (s.doctorCount > 0 ? ` على طبانا حالياً ${s.doctorCount} طبيب ${s.nameAr} موثّق.` : ""),
    },
    {
      question: `هل أستطيع الاستشارة أونلاين بالفيديو مع طبيب ${s.nameAr}؟`,
      answer: `نعم — كثير من أطباء ${s.nameAr} على طبانا يقدّمون استشارات فيديو آمنة ومشفّرة، وتظهر علامة "كشف أون لاين" بجانب اسم كل طبيب يدعم الميزة.`,
    },
    {
      question: `كيف أختار أفضل طبيب ${s.nameAr}؟`,
      answer:
        "راجع تقييمات المرضى السابقين، عدد سنوات الخبرة، شهاداته، والعيادات التي يعمل بها، ثم قارن سعر الكشف. كل الأطباء على طبانا يمرّون بمرحلة تحقق صارمة من الترخيص.",
    },
    {
      question: `هل بياناتي الصحية آمنة عند الحجز مع طبيب ${s.nameAr}؟`,
      answer:
        "نعم. سجلّك الطبي مشفّر أثناء التخزين والنقل، ولا يطّلع عليه سوى الطبيب الذي تختار مشاركته معه، ويمكنك طلب حذفه في أي وقت.",
    },
  ];
}

export const Route = createFileRoute("/specialty/$slug")({
  loader: async ({ params }) => {
    const specialty = await loadSpecialtyForSeo({ data: params.slug });
    // Unknown slug → real 404 (was a 200 "not found" page = soft-404 for crawlers).
    if (!specialty) throw notFound();
    return { specialty };
  },
  head: ({ params, loaderData }) => {
    const s = loaderData?.specialty ?? null;
    const path = `/specialty/${params.slug}`;
    const title = buildSpecialtyTitle(s, params.slug);
    const description = buildSpecialtyDescription(s);

    const scripts: Array<{ type: string; children: string }> = [];
    if (s) {
      scripts.push({
        type: "application/ld+json",
        children: jsonLdString(
          medicalSpecialtySchema({
            slug: s.slug,
            nameAr: s.nameAr,
            nameEn: s.nameEn,
            description: buildSpecialtyDescription(s),
            doctorCount: s.doctorCount,
          }),
        ),
      });
      // BreadcrumbList is emitted once by the <Breadcrumbs> component in the
      // page body (Home › الأطباء › specialty); a second one here conflicted.
      scripts.push({
        type: "application/ld+json",
        children: jsonLdString(faqSchema(specialtyFaq(s))),
      });
      if (s.topDoctors.length > 0) {
        scripts.push({
          type: "application/ld+json",
          children: jsonLdString(
            itemListSchema({
              name: `أطباء ${s.nameAr}`,
              url: canonicalUrl(path),
              items: s.topDoctors.map((d) => ({
                name: d.name ?? `طبيب ${s.nameAr}`,
                url: canonicalUrl(`/doctor/${d.id}`),
                image: d.avatarUrl,
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
        keywords: s
          ? [
              `أطباء ${s.nameAr}`,
              `أفضل طبيب ${s.nameAr}`,
              `${s.nameEn} doctor`,
              "حجز موعد طبيب",
              "طبيب أونلاين",
              siteConfig.brand.ar,
            ]
          : undefined,
      }),
      links: buildSeoLinks(path),
      scripts,
    };
  },
  component: SpecialtyPillarPage,
});

function SpecialtyPillarPage() {
  const { specialty } = Route.useLoaderData();
  const { language, t } = useLanguage();
  const { formatPrice } = useCurrency();

  if (!specialty) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-20 text-center">
        <h1 className="text-2xl font-bold text-foreground">
          {t("Specialty not found", "التخصص غير موجود")}
        </h1>
        <Link to="/doctors" className="mt-4 inline-block text-primary hover:underline">
          {t("Browse all doctors", "تصفّح كل الأطباء")}
        </Link>
      </div>
    );
  }

  const specName = language === "ar" ? specialty.nameAr : specialty.nameEn;
  const faq = specialtyFaq(specialty);

  return (
    <div className="min-h-screen bg-background">
      <Breadcrumbs
        items={[
          { name: t("Doctors", "الأطباء"), path: "/doctors" },
          { name: specName, path: `/specialty/${specialty.slug}` },
        ]}
      />

      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
        {/* Pillar hero */}
        <header className="mb-10">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Stethoscope className="h-6 w-6" />
            </span>
            <div>
              <h1 className="text-3xl font-bold text-foreground sm:text-4xl">
                {t(`Best ${specialty.nameEn} doctors`, `أفضل أطباء ${specialty.nameAr}`)}
              </h1>
              <p className="mt-1 text-muted-foreground">
                {specialty.doctorCount > 0
                  ? t(
                      `${specialty.doctorCount}+ verified ${specialty.nameEn} doctors on Tebana`,
                      `+${specialty.doctorCount} طبيب ${specialty.nameAr} موثّق على طبانا`,
                    )
                  : t("Verified doctors at your fingertips", "أطباء موثّقون بين يديك")}
              </p>
            </div>
          </div>
          <p className="mt-6 max-w-3xl text-base leading-relaxed text-muted-foreground">
            {t(
              `Compare top-rated ${specialty.nameEn} doctors by reviews, experience, and consultation fees. Book in-person or video appointments on a HIPAA-grade secure platform — confirmation in minutes.`,
              `قارن بين أفضل أطباء ${specialty.nameAr} حسب التقييمات وسنوات الخبرة وأسعار الكشف. احجز موعدك حضورياً أو عبر فيديو على منصة آمنة بمعايير HIPAA — تأكيد فوري خلال دقائق.`,
            )}
          </p>
        </header>

        {/* Doctor grid (spokes) */}
        {specialty.topDoctors.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border p-10 text-center text-muted-foreground">
            {t(
              "No verified doctors in this specialty yet. Check back soon.",
              "لا يوجد أطباء موثّقون في هذا التخصص حالياً. تفقّد القائمة قريباً.",
            )}
          </div>
        ) : (
          <section aria-label={t("Top doctors", "أفضل الأطباء")} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {specialty.topDoctors.map((doc: SpecialtySeoData["topDoctors"][number]) => (
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
                    <p className="text-sm text-muted-foreground">{specName}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                      {typeof doc.rating === "number" && doc.rating > 0 && (
                        <span className="inline-flex items-center gap-1">
                          <Star className="h-3.5 w-3.5 fill-current text-amber-500" />
                          <span className="font-medium text-foreground">{doc.rating.toFixed(1)}</span>
                        </span>
                      )}
                      {doc.city && (
                        <span className="inline-flex items-center gap-1">
                          <MapPin className="h-3.5 w-3.5" />
                          {doc.city}
                        </span>
                      )}
                      {doc.yearsExperience ? (
                        <span>
                          {doc.yearsExperience} {t("yrs", "سنة")}
                        </span>
                      ) : null}
                    </div>
                    {typeof doc.consultationFee === "number" && doc.consultationFee > 0 && (
                      <p className="mt-2 text-sm font-medium text-foreground">
                        {formatPrice(doc.consultationFee, doc.currency || "EGP")}
                      </p>
                    )}
                  </div>
                </div>
                <span className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-primary group-hover:gap-2 transition-all">
                  {t("View profile & book", "عرض الملف والحجز")} <ArrowRight className="h-4 w-4 rtl:rotate-180" />
                </span>
              </Link>
            ))}
          </section>
        )}

        {/* Internal link back to general doctors hub + telemedicine CTA */}
        <section className="mt-12 grid gap-4 rounded-2xl border border-border bg-card p-6 sm:grid-cols-2">
          <div>
            <h2 className="text-lg font-semibold text-foreground">
              {t("Browse all specialties", "تصفّح كل التخصصات")}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {t(
                `Not what you were looking for? See all verified doctors across every medical specialty on Tebana.`,
                "لم تجد ما تبحث عنه؟ تصفّح كل الأطباء الموثّقين عبر جميع التخصصات الطبية على طبانا.",
              )}
            </p>
            <Link
              to="/doctors"
              className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
            >
              {t("All doctors", "كل الأطباء")} <ArrowRight className="h-4 w-4 rtl:rotate-180" />
            </Link>
          </div>
          <div>
            <h2 className="text-lg font-semibold text-foreground">
              <Video className="me-1 inline h-5 w-5 text-teal" />
              {t("Video consultation", "استشارة فيديو")}
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {t(
                `Talk to a ${specialty.nameEn} doctor over secure video — no app install, fully encrypted, seen only by your doctor.`,
                `تحدّث مع طبيب ${specialty.nameAr} عبر فيديو آمن — بدون تثبيت تطبيق، تشفير كامل، ولا يراه إلا طبيبك.`,
              )}
            </p>
            <Link
              to="/how-it-works"
              className="mt-3 inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline"
            >
              {t("How it works", "كيف يعمل")} <ArrowRight className="h-4 w-4 rtl:rotate-180" />
            </Link>
          </div>
        </section>

        {/* City × specialty silo: internal links to top-intent combo pages */}
        <section className="mt-12 rounded-2xl border border-border bg-card p-6">
          <h2 className="text-lg font-semibold text-foreground">
            <MapPin className="me-1 inline h-5 w-5 text-primary" />
            {t(
              `${specialty.nameEn} doctors by city`,
              `أطباء ${specialty.nameAr} حسب المدينة`,
            )}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {t(
              "Pick your city to see verified doctors near you with prices and ratings.",
              "اختر مدينتك لتشاهد الأطباء الموثّقين بالقرب منك مع الأسعار والتقييمات.",
            )}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {CITIES.map((c) => (
              <Link
                key={c.slug}
                to="/specialty/$slug/$city"
                params={{ slug: specialty.slug, city: c.slug }}
                className="rounded-full border border-border bg-background px-3 py-1.5 text-xs text-foreground transition hover:border-primary/50 hover:text-primary"
              >
                {language === "ar" ? c.nameAr : c.nameEn}
              </Link>
            ))}
          </div>
        </section>

        {/* Visible FAQ — pairs with FAQPage JSON-LD in head() */}
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
