import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowRight,
  Baby,
  BadgeCheck,
  Bone,
  Brain,
  Calendar,
  CheckCircle2,
  Ear,
  Eye,
  FileText,
  HeartHandshake,
  HeartPulse,
  Lock,
  Search,
  ShieldCheck,
  Smile,
  Sparkles,
  Stethoscope,
  Video,
  Wallet,
} from "lucide-react";
import { useLanguage } from "@/hooks/useLanguage";
import { buildMeta, buildSeoLinks, siteConfig } from "@/lib/seo";
import { faqSchema, jsonLdString } from "@/lib/schema";
import { supabase } from "@/integrations/supabase/client";
import { PUBLIC_DOCTOR_COLUMNS } from "@/lib/public-columns";
import { SmartSearch } from "@/components/home/SmartSearch";
import { VerifiedBadge } from "@/components/VerifiedBadge";

type T = (en: string, ar: string) => string;

// Four honest answers — no capacity or coverage claims we cannot back.
const HOMEPAGE_FAQ = [
  {
    question: "كيف أحجز موعدًا مع طبيب على طبانا؟",
    answer:
      "ابحث بالتخصص أو اسم الطبيب، اختر موعدًا في العيادة أو استشارة بالفيديو، وأكّد الحجز. يصلك التأكيد برسالة على هاتفك.",
  },
  {
    question: "هل الأطباء على طبانا موثّقون؟",
    answer:
      "نعم. تُراجع رخصة كل طبيب وشهاداته يدويًا قبل ظهوره على المنصة، وتظهر شارة «موثّق» بجانب اسمه بعد اكتمال المراجعة.",
  },
  {
    question: "كم تكلفة الكشف أو الاستشارة؟",
    answer:
      "السعر معلن في صفحة كل طبيب قبل الحجز ولا توجد رسوم مخفية. كشف العيادة يُدفع في العيادة، والاستشارة أونلاين تُدفع إلكترونيًا.",
  },
  {
    question: "هل بياناتي الصحية آمنة؟",
    answer:
      "سجلّك الطبي مشفّر ولا يطّلع عليه إلا الطبيب الذي تختار مشاركته معه، ويمكنك طلب حذفه في أي وقت.",
  },
];

// Most-requested specialties in Egypt — slugs exist in the `specialties` table.
const TOP_SPECIALTIES: { slug: string; ar: string; en: string; Icon: typeof Stethoscope }[] = [
  { slug: "internal", ar: "باطنة", en: "Internal medicine", Icon: Stethoscope },
  { slug: "pediatrics", ar: "أطفال", en: "Pediatrics", Icon: Baby },
  { slug: "dentistry", ar: "أسنان", en: "Dentistry", Icon: Smile },
  { slug: "dermatology", ar: "جلدية", en: "Dermatology", Icon: Sparkles },
  { slug: "gynecology", ar: "نساء وتوليد", en: "Gynecology", Icon: HeartHandshake },
  { slug: "cardiology", ar: "قلب", en: "Cardiology", Icon: HeartPulse },
  { slug: "orthopedics", ar: "عظام", en: "Orthopedics", Icon: Bone },
  { slug: "ophthalmology", ar: "عيون", en: "Ophthalmology", Icon: Eye },
  { slug: "ent", ar: "أنف وأذن", en: "ENT", Icon: Ear },
  { slug: "neurology", ar: "مخ وأعصاب", en: "Neurology", Icon: Brain },
];

export const Route = createFileRoute("/")({
  head: () => ({
    meta: buildMeta({
      title: "احجز طبيبًا موثّقًا في العيادة أو أونلاين | طبانا",
      description:
        "طبانا: منصة طبية مصرية لحجز الأطباء الموثّقين — كشف في العيادة أو استشارة فيديو، سعر معلن قبل الحجز، وسجل طبي يبقى معك.",
      path: "/",
      keywords: [
        "حجز طبيب",
        "دكتور قريب مني",
        "طبيب أونلاين",
        "استشارة طبية فيديو",
        "أطباء موثقون مصر",
        "كشف عيادة",
        siteConfig.brand.en,
      ],
    }),
    links: buildSeoLinks("/"),
    scripts: [{ type: "application/ld+json", children: jsonLdString(faqSchema(HOMEPAGE_FAQ)) }],
  }),
  component: LandingPage,
});

function LandingPage() {
  const { language, t } = useLanguage();
  const isRTL = language === "ar";
  return (
    <div className="flex flex-col">
      <Hero t={t} isRTL={isRTL} />
      <Specialties t={t} isRTL={isRTL} />
      <Trust t={t} />
      <Doctors t={t} isRTL={isRTL} />
      <ForDoctors t={t} isRTL={isRTL} />
      <HowItWorks t={t} />
      <Faq t={t} />
      <FinalCta t={t} isRTL={isRTL} />
    </div>
  );
}

/* ───────────────────────── Hero ───────────────────────── */

function Hero({ t, isRTL }: { t: T; isRTL: boolean }) {
  return (
    <section className="relative overflow-hidden bg-background">
      <div className="hero-grid pointer-events-none absolute inset-0 -z-10" aria-hidden />
      <div className="pointer-events-none absolute -top-32 end-[-10%] -z-10 h-[520px] w-[520px] rounded-full bg-secondary blur-3xl" aria-hidden />
      <div className="pointer-events-none absolute -bottom-40 start-[-10%] -z-10 h-[420px] w-[420px] rounded-full bg-coral/10 blur-3xl" aria-hidden />

      <div className="mx-auto grid max-w-7xl items-center gap-12 px-4 pb-16 pt-10 sm:px-6 lg:grid-cols-12 lg:gap-8 lg:px-8 lg:pb-24 lg:pt-16">
        <div className="lg:col-span-7">
          <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs font-semibold text-primary shadow-sm">
            <ShieldCheck className="h-3.5 w-3.5" />
            {t("Egyptian medical platform · manually verified doctors", "منصة طبية مصرية · أطباء موثّقون يدويًا")}
          </span>
          <h1 className="mt-5 text-4xl font-bold leading-[1.25] text-foreground sm:text-5xl lg:text-[3.4rem]">
            {t("Book a verified doctor", "احجز طبيبك الموثّق")}
            <span className="block text-primary">{t("in minutes", "في دقائق")}</span>
          </h1>
          <p className="mt-5 max-w-xl text-lg leading-relaxed text-muted-foreground">
            {t(
              "In the clinic or by video. The price is shown before you book, and your medical record stays with you.",
              "في العيادة أو بالفيديو — السعر معلن قبل الحجز، وسجلّك الطبي معك في كل مرة.",
            )}
          </p>

          <div className="mt-8">
            <SmartSearch isRTL={isRTL} t={t} />
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted-foreground">{t("Popular:", "الأكثر طلبًا:")}</span>
            {TOP_SPECIALTIES.slice(0, 4).map((s) => (
              <Link
                key={s.slug}
                to="/specialty/$slug"
                params={{ slug: s.slug }}
                className="rounded-full border border-border bg-card px-3 py-1 font-medium text-foreground transition-colors hover:border-primary/40 hover:bg-accent"
              >
                {isRTL ? s.ar : s.en}
              </Link>
            ))}
          </div>
        </div>

        <div className="relative lg:col-span-5">
          <HeroMock t={t} />
        </div>
      </div>

      <svg
        className="pointer-events-none absolute inset-x-0 bottom-0 -z-10 h-24 w-full text-primary/25"
        viewBox="0 0 1200 100"
        preserveAspectRatio="none"
        aria-hidden
      >
        <path
          className="ecg-line"
          d="M0 60 H300 L330 60 L345 20 L360 95 L375 60 H560 L580 60 L595 35 L610 85 L625 60 H900 L915 60 L925 42 L938 78 L950 60 H1200"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinejoin="round"
        />
      </svg>
    </section>
  );
}

/** Product preview built from the real UI language — no stock faces. */
function HeroMock({ t }: { t: T }) {
  const slots = ["10:00", "10:30", "11:00", "11:30"];
  return (
    <div className="relative mx-auto max-w-md lg:max-w-none" dir="rtl">
      <div className="rounded-3xl border border-border bg-card p-5 shadow-[0_30px_80px_-30px_oklch(0.50_0.10_192/0.45)]">
        <div className="flex items-start gap-4">
          <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-secondary text-2xl font-bold text-primary">
            د
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-lg font-bold text-foreground">{t("Verified doctor", "طبيب موثّق")}</span>
              <VerifiedBadge verified size="sm" />
            </div>
            <p className="mt-0.5 text-sm text-muted-foreground">{t("Internal medicine · Cairo", "باطنة · القاهرة")}</p>
            <div className="mt-2 flex flex-wrap gap-2 text-xs">
              <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-1 font-medium text-secondary-foreground">
                <Calendar className="h-3.5 w-3.5" /> {t("Clinic", "عيادة")}
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2.5 py-1 font-medium text-secondary-foreground">
                <Video className="h-3.5 w-3.5" /> {t("Video", "فيديو")}
              </span>
              <span className="inline-flex items-center gap-1 rounded-full bg-sand px-2.5 py-1 font-medium text-sand-foreground">
                <Wallet className="h-3.5 w-3.5" /> {t("Price shown", "السعر معلن")}
              </span>
            </div>
          </div>
        </div>

        <div className="mt-5 rounded-2xl bg-surface p-4">
          <p className="text-xs font-semibold text-muted-foreground">{t("Available today", "مواعيد اليوم")}</p>
          <div className="mt-3 grid grid-cols-4 gap-2">
            {slots.map((s, i) => (
              <span
                key={s}
                className={`rounded-xl py-2 text-center text-sm font-semibold tabular-nums ${
                  i === 1
                    ? "bg-primary text-primary-foreground shadow"
                    : "border border-border bg-card text-foreground"
                }`}
              >
                {s}
              </span>
            ))}
          </div>
          <div className="mt-4 h-11 rounded-xl bg-primary text-center text-sm font-semibold leading-[2.75rem] text-primary-foreground">
            {t("Confirm booking", "تأكيد الحجز")}
          </div>
        </div>
      </div>

      <div className="absolute -bottom-6 start-2 flex items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3 shadow-lg sm:start-[-1.5rem]">
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-success-soft text-success">
          <CheckCircle2 className="h-5 w-5" />
        </span>
        <div className="text-sm">
          <p className="font-semibold text-foreground">{t("Booking confirmed", "تم تأكيد حجزك")}</p>
          <p className="text-xs text-muted-foreground">{t("Sunday · 10:30 AM", "الأحد · 10:30 ص")}</p>
        </div>
      </div>

      <div className="absolute -top-5 end-2 inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-semibold text-foreground shadow-md sm:end-[-1rem]">
        <HeartPulse className="h-4 w-4 text-coral" />
        {t("Your record travels with you", "سجلّك معك في كل زيارة")}
      </div>
    </div>
  );
}

/* ───────────────────── Specialties ───────────────────── */

function Specialties({ t, isRTL }: { t: T; isRTL: boolean }) {
  const Arrow = isRTL ? ArrowLeft : ArrowRight;
  return (
    <section className="border-y border-border bg-surface py-12 sm:py-14" aria-labelledby="home-specialties">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex items-end justify-between gap-4">
          <h2 id="home-specialties" className="text-2xl font-bold text-foreground sm:text-3xl">
            {t("Find a doctor by specialty", "ابحث بالتخصص")}
          </h2>
          <Link to="/doctors" className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline">
            {t("All specialties", "كل التخصصات")}
            <Arrow className="h-4 w-4" />
          </Link>
        </div>
        <ul className="mt-7 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {TOP_SPECIALTIES.map(({ slug, ar, en, Icon }) => (
            <li key={slug}>
              <Link
                to="/specialty/$slug"
                params={{ slug }}
                className="group flex items-center gap-3 rounded-2xl border border-border bg-card p-4 transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-md"
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-secondary text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                  <Icon className="h-5 w-5" />
                </span>
                <span className="font-semibold text-foreground">{isRTL ? ar : en}</span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

/* ──────────────────────── Trust ──────────────────────── */

function Trust({ t }: { t: T }) {
  const items = [
    {
      Icon: ShieldCheck,
      title: t("Every doctor is verified by hand", "كل طبيب موثّق يدويًا"),
      body: t(
        "License and certificates are reviewed before a profile goes live.",
        "رخصته وشهاداته تُراجع قبل ما يظهر ملفه على المنصة.",
      ),
    },
    {
      Icon: Lock,
      title: t("Your record is yours", "سجلّك الطبي ملكك"),
      body: t(
        "Encrypted, shared only with the doctor you choose, deletable on request.",
        "مشفّر، لا يراه إلا الطبيب الذي تختاره، ويمكنك طلب حذفه في أي وقت.",
      ),
    },
    {
      Icon: BadgeCheck,
      title: t("The price before the booking", "السعر قبل الحجز"),
      body: t(
        "Every profile shows the clinic and video fees up front. No hidden charges.",
        "كل ملف يعرض سعر الكشف والاستشارة بوضوح، ولا رسوم مخفية.",
      ),
    },
  ];
  return (
    <section className="py-16 sm:py-20" aria-labelledby="home-trust">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <h2 id="home-trust" className="text-center text-2xl font-bold text-foreground sm:text-3xl">
          {t("Why patients trust Tebana", "ليه تثق في طبانا")}
        </h2>
        <div className="mt-10 grid gap-5 md:grid-cols-3">
          {items.map(({ Icon, title, body }) => (
            <div key={title} className="rounded-3xl border border-border bg-card p-6">
              <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-secondary text-primary">
                <Icon className="h-6 w-6" />
              </span>
              <h3 className="mt-4 text-lg font-bold text-foreground">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{body}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─────────────────── Verified doctors ─────────────────── */

interface HomeDoctor {
  id: string;
  profile_id: string | null;
  specialty: string | null;
  consultation_fee: number | null;
  rating: number | null;
  reviews_count: number | null;
  is_verified: boolean | null;
}
interface HomeProfile {
  id: string;
  full_name: string | null;
  city: string | null;
  avatar_url: string | null;
}

async function fetchVerifiedDoctors(): Promise<(HomeDoctor & { profile?: HomeProfile })[]> {
  const { data, error } = await supabase
    .from("doctor_details")
    .select(PUBLIC_DOCTOR_COLUMNS)
    .eq("is_verified", true)
    .not("profile_id", "is", null)
    .order("rating", { ascending: false, nullsFirst: false })
    .limit(6);
  if (error) throw error;
  const docs = (data ?? []) as unknown as HomeDoctor[];
  const ids = docs.map((d) => d.profile_id).filter((v): v is string => !!v);
  if (ids.length === 0) return docs;
  const { data: profiles } = await supabase
    .from("profiles")
    .select("id, full_name, city, avatar_url")
    .in("id", ids);
  const byId = new Map((profiles ?? []).map((p) => [p.id, p as HomeProfile]));
  return docs.map((d) => ({ ...d, profile: d.profile_id ? byId.get(d.profile_id) : undefined }));
}

function Doctors({ t, isRTL }: { t: T; isRTL: boolean }) {
  const Arrow = isRTL ? ArrowLeft : ArrowRight;
  const { data, isLoading } = useQuery({ queryKey: ["home-verified-doctors"], queryFn: fetchVerifiedDoctors, staleTime: 5 * 60_000 });
  const doctors = data ?? [];

  if (!isLoading && doctors.length === 0) return <VerificationSteps t={t} />;

  return (
    <section className="bg-surface py-16 sm:py-20" aria-labelledby="home-doctors">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex items-end justify-between gap-4">
          <h2 id="home-doctors" className="text-2xl font-bold text-foreground sm:text-3xl">
            {t("Verified doctors", "أطباء موثّقون")}
          </h2>
          <Link to="/doctors" className="inline-flex items-center gap-1 text-sm font-semibold text-primary hover:underline">
            {t("Browse all", "كل الأطباء")}
            <Arrow className="h-4 w-4" />
          </Link>
        </div>
        <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {isLoading
            ? Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="h-40 animate-pulse rounded-3xl border border-border bg-card" />
              ))
            : doctors.map((d) => {
                const name = d.profile?.full_name?.trim() || t("Doctor", "طبيب");
                const specialty = /^general$/i.test(d.specialty ?? "") ? t("General practice", "طب عام") : d.specialty;
                return (
                  <Link
                    key={d.id}
                    to="/doctor/$id"
                    params={{ id: d.id }}
                    className="group flex gap-4 rounded-3xl border border-border bg-card p-5 transition-all hover:-translate-y-0.5 hover:shadow-md"
                  >
                    {d.profile?.avatar_url ? (
                      <img src={d.profile.avatar_url} alt="" className="h-16 w-16 shrink-0 rounded-2xl object-cover" loading="lazy" />
                    ) : (
                      <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-secondary text-xl font-bold text-primary">
                        {name.replace(/^د\.?\s*/, "").charAt(0)}
                      </span>
                    )}
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate font-bold text-foreground">{name}</span>
                        <VerifiedBadge verified={!!d.is_verified} size="sm" />
                      </div>
                      <p className="mt-0.5 truncate text-sm text-muted-foreground">
                        {[specialty, d.profile?.city].filter(Boolean).join(" · ")}
                      </p>
                      <p className="mt-2 text-sm font-semibold text-primary">
                        {d.consultation_fee
                          ? t(`From ${d.consultation_fee} EGP`, `يبدأ من ${d.consultation_fee} ج`)
                          : t("See prices", "اطّلع على الأسعار")}
                      </p>
                    </div>
                  </Link>
                );
              })}
        </div>
      </div>
    </section>
  );
}

function VerificationSteps({ t }: { t: T }) {
  const steps = [
    { Icon: FileText, text: t("The doctor uploads license and certificates", "يرفع الطبيب رخصته وشهاداته") },
    { Icon: Search, text: t("Tebana's team reviews them by hand", "يراجعها فريق طبانا يدويًا") },
    { Icon: BadgeCheck, text: t("The verified badge appears and booking opens", "تظهر شارة «موثّق» ويُفتح الحجز") },
  ];
  return (
    <section className="bg-surface py-16 sm:py-20" aria-labelledby="home-verification">
      <div className="mx-auto max-w-5xl px-4 text-center sm:px-6 lg:px-8">
        <h2 id="home-verification" className="text-2xl font-bold text-foreground sm:text-3xl">
          {t("How a doctor gets verified", "إزاي بنوثّق الطبيب")}
        </h2>
        <ol className="mt-10 grid gap-5 sm:grid-cols-3">
          {steps.map(({ Icon, text }, i) => (
            <li key={i} className="rounded-3xl border border-border bg-card p-6">
              <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-secondary text-primary">
                <Icon className="h-6 w-6" />
              </span>
              <p className="mt-4 text-sm font-semibold text-foreground">
                <span className="text-primary">{i + 1}. </span>
                {text}
              </p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

/* ───────────────────── For doctors ───────────────────── */

function ForDoctors({ t, isRTL }: { t: T; isRTL: boolean }) {
  const Arrow = isRTL ? ArrowLeft : ArrowRight;
  const bullets = [
    t("Queue and appointment booking from the website and the app", "حجز بالدور والمواعيد من الموقع والتطبيق"),
    t("E-prescriptions and a medical record for every patient", "روشتة إلكترونية وسجل طبي لكل مريض"),
    t("0% commission on clinic visits — you only pay on online consultations", "0% عمولة على كشف العيادة — العمولة على الاستشارة أونلاين فقط"),
  ];
  return (
    <section className="py-16 sm:py-20" aria-labelledby="home-for-doctors">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="relative overflow-hidden rounded-[2rem] bg-ink px-6 py-12 text-background sm:px-12 lg:px-16 lg:py-16">
          <div className="pointer-events-none absolute -end-24 -top-24 h-80 w-80 rounded-full bg-primary/40 blur-3xl" aria-hidden />
          <div className="pointer-events-none absolute -bottom-24 -start-16 h-64 w-64 rounded-full bg-coral/30 blur-3xl" aria-hidden />
          <div className="relative grid items-center gap-10 lg:grid-cols-2">
            <div>
              <span className="text-sm font-semibold text-coral">{t("For doctors", "للأطباء")}</span>
              <h2 id="home-for-doctors" className="mt-2 text-3xl font-bold sm:text-4xl">
                {t("Open your digital clinic", "افتح عيادتك الرقمية")}
              </h2>
              <p className="mt-4 max-w-lg text-base leading-relaxed text-background/75">
                {t(
                  "Manage bookings, the waiting room, prescriptions and your patients' records from one place.",
                  "إدارة الحجوزات وغرفة الانتظار والروشتات وسجلات مرضاك من مكان واحد.",
                )}
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link
                  to="/join-doctor"
                  className="inline-flex items-center gap-2 rounded-xl bg-coral px-6 py-3 text-base font-semibold text-coral-foreground shadow-lg transition-colors hover:bg-coral/90"
                >
                  {t("Join as a doctor", "انضم كطبيب")}
                  <Arrow className="h-5 w-5" />
                </Link>
                <Link
                  to="/pricing"
                  className="inline-flex items-center gap-2 rounded-xl border border-background/30 px-6 py-3 text-base font-semibold text-background transition-colors hover:bg-background/10"
                >
                  {t("Plans and pricing", "الباقات والأسعار")}
                </Link>
              </div>
            </div>
            <ul className="space-y-4">
              {bullets.map((b) => (
                <li key={b} className="flex items-start gap-3 rounded-2xl bg-background/10 p-4 backdrop-blur">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-coral" />
                  <span className="text-sm font-medium leading-relaxed">{b}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ──────────────────── How it works ──────────────────── */

function HowItWorks({ t }: { t: T }) {
  const steps = [
    { Icon: Search, title: t("Search", "ابحث"), body: t("By specialty, doctor name or symptom.", "بالتخصص أو اسم الطبيب أو العرَض.") },
    { Icon: Calendar, title: t("Book", "احجز"), body: t("Pick a clinic slot or a video consultation.", "اختر موعدًا في العيادة أو استشارة فيديو.") },
    { Icon: HeartPulse, title: t("Get care", "اتعالج"), body: t("Your prescription and record stay in your account.", "روشتتك وسجلّك يبقوا في حسابك.") },
  ];
  return (
    <section className="bg-surface py-16 sm:py-20" aria-labelledby="home-how">
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
        <h2 id="home-how" className="text-center text-2xl font-bold text-foreground sm:text-3xl">
          {t("Three steps", "ثلاث خطوات")}
        </h2>
        <ol className="mt-10 grid gap-5 sm:grid-cols-3">
          {steps.map(({ Icon, title, body }, i) => (
            <li key={title} className="relative rounded-3xl border border-border bg-card p-6 text-center">
              <span className="absolute -top-3 start-6 rounded-full bg-primary px-2.5 py-0.5 text-xs font-bold text-primary-foreground">
                {i + 1}
              </span>
              <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-secondary text-primary">
                <Icon className="h-6 w-6" />
              </span>
              <h3 className="mt-4 text-lg font-bold text-foreground">{title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}

/* ────────────────────────── FAQ ────────────────────────── */

function Faq({ t }: { t: T }) {
  return (
    <section className="py-16 sm:py-20" aria-labelledby="home-faq">
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
        <h2 id="home-faq" className="text-center text-2xl font-bold text-foreground sm:text-3xl">
          {t("Common questions", "أسئلة شائعة")}
        </h2>
        <div className="mt-8 divide-y divide-border rounded-3xl border border-border bg-card">
          {HOMEPAGE_FAQ.map((f) => (
            <details key={f.question} className="group px-6 py-4 open:bg-surface/60">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-start font-semibold text-foreground [&::-webkit-details-marker]:hidden">
                {f.question}
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-secondary text-primary transition-transform group-open:rotate-45">
                  +
                </span>
              </summary>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{f.answer}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────── Final CTA ─────────────────────── */

function FinalCta({ t, isRTL }: { t: T; isRTL: boolean }) {
  const Arrow = isRTL ? ArrowLeft : ArrowRight;
  return (
    <section className="pb-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="relative overflow-hidden rounded-[2rem] bg-primary px-6 py-14 text-center text-primary-foreground sm:px-16">
          <div className="pointer-events-none absolute -start-20 -top-20 h-64 w-64 rounded-full bg-background/15 blur-3xl" aria-hidden />
          <div className="pointer-events-none absolute -bottom-24 -end-10 h-72 w-72 rounded-full bg-coral/30 blur-3xl" aria-hidden />
          <h2 className="relative text-3xl font-bold sm:text-4xl">
            {t("Your doctor is a search away", "طبيبك على بُعد بحث")}
          </h2>
          <p className="relative mx-auto mt-3 max-w-xl text-base text-primary-foreground/85">
            {t("Verified doctors, clear prices, and a record that stays with you.", "أطباء موثّقون، أسعار واضحة، وسجل يبقى معك.")}
          </p>
          <div className="relative mt-8 flex flex-wrap justify-center gap-3">
            <Link
              to="/doctors"
              className="inline-flex items-center gap-2 rounded-xl bg-background px-6 py-3 text-base font-semibold text-primary shadow-lg transition-colors hover:bg-background/90"
            >
              {t("Find a doctor", "ابحث عن طبيب")}
              <Arrow className="h-5 w-5" />
            </Link>
            <Link
              to="/join-doctor"
              className="inline-flex items-center gap-2 rounded-xl border border-primary-foreground/40 px-6 py-3 text-base font-semibold text-primary-foreground transition-colors hover:bg-primary-foreground/10"
            >
              {t("I'm a doctor", "أنا طبيب")}
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
