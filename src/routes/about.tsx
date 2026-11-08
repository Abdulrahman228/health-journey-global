import { createFileRoute } from "@tanstack/react-router";
import { HeartPulse, ShieldCheck, Globe, Users } from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";
import { BrandName } from "@/components/BrandName";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { buildMeta, buildSeoLinks, siteConfig } from "@/lib/seo";

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: buildMeta({
      title: "عن طبانا Tebana — منصة مصرية لحجز الأطباء الموثّقين",
      description:
        "طبانا (Tebana) — تعرّف على رسالتنا: ربط المرضى في مصر بأطباء موثّقين يدويًا، كشف في العيادة أو استشارة فيديو، وسجل طبي يبقى مع المريض.",
      path: "/about",
      keywords: [
        "عن طبانا",
        "About Tebana",
        "من نحن طبانا",
        "Tebana mission",
        ...siteConfig.brandAliases,
      ],
    }),
    links: buildSeoLinks("/about"),
  }),
  component: AboutPage,
});

function AboutPage() {
  const { t } = useLanguage();

  return (
    <>
      <Breadcrumbs items={[{ name: t("About", "من نحن"), path: "/about" }]} />

      <article className="mx-auto max-w-3xl px-4 py-12 sm:px-6 lg:py-16">
        <header className="text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 ring-1 ring-primary/20">
            <HeartPulse className="h-8 w-8 text-primary" strokeWidth={2.2} />
          </div>
          <h1 className="arabic-display mt-6 text-balance text-3xl font-bold text-foreground sm:text-4xl">
            {t("About", "عن")} <BrandName variant="inline" />
          </h1>
          <p className="mt-3 text-sm font-medium uppercase tracking-wider text-primary">
            {t(
              "Your health, connected — built in Egypt",
              "صحتك بين يديك — صُنعت في مصر",
            )}
          </p>
        </header>

        <section className="mt-10 leading-relaxed">
          <p className="text-base text-foreground sm:text-lg">
            <strong>
              <BrandName variant="inline" />
            </strong>{" "}
            {t(
              "is a verified telehealth marketplace built for Arabic-speaking patients. We connect you with licensed doctors, enable secure video consultations, issue digital prescriptions, and keep your medical records private and portable — all in one trusted platform known across the region as ",
              "منصة طبية موثّقة مبنية لخدمة المرضى الناطقين بالعربية. نربطك بأطباء معتمدين، نُتيح استشارات فيديو آمنة، نُصدر روشتات رقمية، ونحفظ سجلك الطبي خاصاً ومتاحاً لك — كل ذلك على منصة موحَّدة معروفة في المنطقة باسم ",
            )}
            <BrandName variant="inline" primary="ar" />.
          </p>

          <h2 className="mt-10 text-xl font-bold text-foreground sm:text-2xl">
            {t("Who is behind", "من يقف خلف")}{" "}
            <span lang="ar">«{siteConfig.brand.ar}»</span> /{" "}
            <span lang="en">“{siteConfig.brand.en}”</span>؟
          </h2>
          <p className="mt-3 text-foreground/90">
            {t(
              `${siteConfig.brand.en} (${siteConfig.brand.ar}) is operated by ${siteConfig.organization.legalNameEn} (${siteConfig.organization.legalName}), the company registered to run the platform. You may also know us by our former name, ${siteConfig.formerBrand.en} (${siteConfig.formerBrand.ar}). Whether you search for us as `,
              `منصة ${siteConfig.brand.ar} (${siteConfig.brand.en}) تُديرها شركة ${siteConfig.organization.legalName}، الجهة المسجّلة لتشغيل المنصة. وقد تعرفنا أيضاً باسمنا السابق ${siteConfig.formerBrand.ar} (${siteConfig.formerBrand.en}). سواء بحثت عنّا باسم `,
            )}
            <strong>{siteConfig.brand.ar}</strong>،{" "}
            <strong>{siteConfig.brand.en}</strong>،{" "}
            <strong>{siteConfig.formerBrand.ar}</strong>،{" "}
            {t("or", "أو")} <strong>تطبيق {siteConfig.brand.ar}</strong>،{" "}
            {t(
              "you'll always land on the same trusted platform.",
              "ستصل دائماً للمنصة الموثوقة نفسها.",
            )}
          </p>
        </section>

        <section className="mt-12 grid gap-4 sm:grid-cols-3">
          <PillarCard
            icon={ShieldCheck}
            title={t("Verified", "موثَّق")}
            body={t(
              "Every doctor is identity-checked and license-verified.",
              "كل طبيب مُتحقَّق من هويته ومرخَّص رسمياً.",
            )}
          />
          <PillarCard
            icon={Globe}
            title={t("Bilingual", "ثنائي اللغة")}
            body={t(
              "Full Arabic & English — RTL-first design.",
              "عربي وإنجليزي بالكامل — مع تصميم يبدأ من اليمين.",
            )}
          />
          <PillarCard
            icon={Users}
            title={t("Egypt first", "مصر أولًا")}
            body={t(
              "Built for Egyptian clinics and patients: Egyptian pounds, local payment and Arabic first.",
              "مبنية لعيادات ومرضى مصر: الجنيه المصري، طرق دفع محلية، والعربية أولًا.",
            )}
          />
        </section>
      </article>
    </>
  );
}

function PillarCard({
  icon: Icon,
  title,
  body,
}: {
  icon: typeof HeartPulse;
  title: string;
  body: string;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
        <Icon className="h-5 w-5" strokeWidth={2.2} />
      </div>
      <h3 className="mt-3 text-base font-semibold text-foreground">{title}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{body}</p>
    </div>
  );
}
