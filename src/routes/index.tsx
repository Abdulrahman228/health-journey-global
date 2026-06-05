import { createFileRoute, Link } from "@tanstack/react-router";
import { useLanguage } from "@/hooks/useLanguage";
import {
  HeartPulse,
  Calendar,
  Video,
  Shield,
  Search,
  Stethoscope,
  Clock,
  Star,
  ArrowRight,
  ArrowLeft,
  Users,
  Award,
  Globe,
  BookOpen,
} from "lucide-react";
import { buildMeta, buildSeoLinks } from "@/lib/seo";
import { faqSchema, jsonLdString } from "@/lib/schema";
import heroMedicalTeamImage from "@/assets/hero-medical-team.png";
import { HeroHierarchicalSearch } from "@/components/HeroHierarchicalSearch";

const HOMEPAGE_FAQ = [
  {
    question: "كيف أحجز موعد مع طبيب على طبيبي؟",
    answer:
      "ابحث عن الطبيب المناسب عن طريق التخصص أو المدينة، ثم اختر الموعد المتاح، وأكد الحجز خلال دقائق. ستصلك رسالة تأكيد فورية على البريد الإلكتروني والرسائل النصية.",
  },
  {
    question: "هل أستطيع الاستشارة أونلاين بالفيديو؟",
    answer:
      "نعم. منصة طبيبي توفر استشارات فيديو آمنة ومشفّرة مع أطباء معتمدين، بدون الحاجة لتثبيت أي تطبيق. تكفي متصفح حديث على الهاتف أو الكمبيوتر.",
  },
  {
    question: "هل الأطباء على طبيبي موثوقون ومرخّصون؟",
    answer:
      "كل طبيب على المنصة يمر بمرحلة تحقق صارمة من الترخيص والشهادات قبل عرض ملفه. تظهر شارة \"موثّق\" بجانب اسم الطبيب الذي اكتمل التحقق منه.",
  },
  {
    question: "كم تكلفة الاستشارة الطبية؟",
    answer:
      "الأسعار تختلف حسب الطبيب والتخصص ونوع الاستشارة (حضوري أو فيديو). يظهر السعر بوضوح في ملف كل طبيب قبل تأكيد الحجز، بدون رسوم مخفية.",
  },
  {
    question: "هل بياناتي الصحية آمنة؟",
    answer:
      "نعم. كل سجلاتك مشفّرة بمعايير HIPAA وتُحفظ بأمان في خوادم مؤمّنة. لا يطّلع عليها سوى الطبيب الذي تختار مشاركتها معه، ويمكنك حذفها في أي وقت.",
  },
  {
    question: "في أي دول يعمل تطبيق طبيبي؟",
    answer:
      "نخدم حالياً مرضى وأطباء في مصر والسعودية والإمارات وقطر والكويت والبحرين وعُمان والأردن، ونتوسع باستمرار لخدمة المزيد من الدول العربية.",
  },
];

export const Route = createFileRoute("/")({
  head: () => ({
    meta: buildMeta({
      title: "احجز موعد طبيب أونلاين 24/7 — 2,500+ طبيب موثّق | طبيبي",
      description:
        "احجز موعدك مع أفضل الأطباء في الوطن العربي خلال دقائق — استشارة فيديو آمنة، أسعار شفافة، تأكيد فوري. جرّب طبيبي مجاناً اليوم.",
      path: "/",
      keywords: [
        "حجز موعد طبيب",
        "طبيب أونلاين",
        "استشارة طبية فيديو",
        "أطباء معتمدون مصر",
        "تطبيب عن بعد",
        "كشف أونلاين",
        "Tabibi",
      ],
    }),
    links: buildSeoLinks("/"),
    scripts: [
      { type: "application/ld+json", children: jsonLdString(faqSchema(HOMEPAGE_FAQ)) },
    ],
  }),
  component: LandingPage,
});

function LandingPage() {
  const { language, t } = useLanguage();
  const isRTL = language === "ar";

  return (
    <div className="flex flex-col">
      <HeroSection t={t} isRTL={isRTL} />
      <StatsSection t={t} />
      <FeaturesSection t={t} isRTL={isRTL} />
      <HowItWorksSection t={t} isRTL={isRTL} />
      <ArticlesTeaserSection t={t} isRTL={isRTL} />
      <FaqSection t={t} />
      <CTASection t={t} isRTL={isRTL} />
    </div>
  );
}

function HeroSection({ t, isRTL }: { t: (en: string, ar: string) => string; isRTL: boolean }) {
  const Arrow = isRTL ? ArrowLeft : ArrowRight;

  return (
    <section className="relative overflow-hidden bg-gradient-to-br from-background via-background to-secondary/50 pt-6 pb-12 sm:pt-8 sm:pb-16 lg:pt-10 lg:pb-20">
      {/* Decorative background elements */}
      <div className="absolute inset-3 -z-10 overflow-hidden">
        <div className="absolute -right-20 -top-20 h-96 w-96 rounded-full bg-primary/5 blur-3xl" />
        <div className="absolute -left-20 bottom-0 h-72 w-72 rounded-full bg-teal/10 blur-3xl" />
      </div>

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid items-center gap-12 lg:grid-cols-2">
          {/* Content */}
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-4 py-1.5 text-sm font-medium text-primary">
              <HeartPulse className="h-4 w-4" />
              {t("Now available in Egypt", "متاح الآن في مصر")}
            </div>
            <h1 className="arabic-elegant mt-6 text-2xl font-extrabold tracking-tight text-foreground sm:text-3xl lg:text-4xl">
              {t(
                "Tabibi — Book your trusted doctor in minutes. Video consultations & in-person visits",
                "طبيبي — احجز طبيبك الموثّق في دقائق، استشارات فيديو ومواعيد حضورية"
              )}
            </h1>
            <p className="mt-6 text-lg leading-8 text-muted-foreground">
              {t(
                "Tabibi connects you with 2,500+ licensed doctors across the Arab world — book in-person visits or secure video consultations, compare prices, read genuine reviews, and manage your medical records on one trusted platform.",
                "منصة طبيبي تربطك بأكثر من 2,500 طبيب مرخّص في الوطن العربي — احجز كشف حضوري أو استشارة فيديو آمنة، قارن الأسعار، اقرأ تقييمات حقيقية، وأدر سجلك الطبي على منصة موثوقة واحدة."
              )}
            </p>

            {/* Search box — hierarchical Country → Governorate → City → District + Near me */}
            <HeroHierarchicalSearch language={isRTL ? "ar" : "en"} isRTL={isRTL} t={t} />

            <div className="mt-6 flex flex-wrap gap-4">
              <Link
                to="/doctors"
                className="inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-3 text-base font-semibold text-primary-foreground shadow-lg shadow-primary/20 transition-all hover:bg-primary/90 hover:shadow-xl hover:shadow-primary/30"
              >
                {t("Find a Doctor", "ابحث عن طبيب")}
                <Arrow className="h-5 w-5" />
              </Link>
              <Link
                to="/join-doctor"
                className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-6 py-3 text-base font-semibold text-foreground transition-all hover:bg-accent"
              >
                {t("Join as Doctor", "انضم كطبيب")}
              </Link>
            </div>
            {/* Trust badges */}
            <div className="mt-10 flex flex-wrap items-center gap-6">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Shield className="h-5 w-5 text-teal" />
                {t("Verified Doctors", "أطباء موثوق بهم")}
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Clock className="h-5 w-5 text-teal" />
                {t("24/7 Support", "دعم على مدار الساعة")}
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Star className="h-5 w-5 text-teal" />
                {t("Trusted by 10K+", "يثق به 10 آلاف+")}
              </div>
            </div>
          </div>

          {/* Visual */}
          <div className="relative hidden lg:block">
            <div className="rounded-[2rem] bg-linear-to-br from-primary/10 to-teal/10 p-5 shadow-2xl shadow-primary/10">
              <img
                src={heroMedicalTeamImage}
                alt={t("Doctors using telehealth platform", "أطباء يستخدمون منصة استشارات طبية عن بعد")}
                className="block aspect-square w-full rounded-[1.5rem] object-cover shadow-xl"
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function StatsSection({ t }: { t: (en: string, ar: string) => string }) {
  const stats = [
    { icon: Stethoscope, value: "2,500+", label: t("Verified Doctors", "طبيب موثوق") },
    { icon: Users, value: "50,000+", label: t("Happy Patients", "مريض سعيد") },
    { icon: Calendar, value: "100,000+", label: t("Appointments", "موعد محجوز") },
    { icon: Globe, value: "15+", label: t("Cities", "مدينة") },
  ];

  return (
    <section className="border-y border-border bg-muted/30 py-12">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 gap-8 lg:grid-cols-4">
          {stats.map((stat, i) => (
            <div key={i} className="text-center">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
                <stat.icon className="h-6 w-6 text-primary" />
              </div>
              <p className="mt-3 text-3xl font-bold text-foreground">{stat.value}</p>
              <p className="mt-1 text-sm text-muted-foreground">{stat.label}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function FeaturesSection({ t, isRTL }: { t: (en: string, ar: string) => string; isRTL: boolean }) {
  const Arrow = isRTL ? ArrowLeft : ArrowRight;
  const features = [
    {
      icon: Search,
      title: t("Find the Right Doctor", "ابحث عن الطبيب المناسب"),
      description: t(
        "Search by specialty, city, rating, and availability. Browse verified doctor profiles with reviews from real patients.",
        "ابحث حسب التخصص والمدينة والتقييم والتوفر. تصفح ملفات الأطباء الموثوقة مع تقييمات من مرضى حقيقيين."
      ),
    },
    {
      icon: Calendar,
      title: t("Easy Booking", "حجز سهل"),
      description: t(
        "Book in-person or online appointments in minutes. Get instant confirmation via email and SMS reminders.",
        "احجز مواعيد حضورية أو أونلاين في دقائق. احصل على تأكيد فوري عبر البريد والرسائل النصية."
      ),
    },
    {
      icon: Video,
      title: t("Online Consultation", "استشارة أونلاين"),
      description: t(
        "Connect with your doctor via secure video call. Get diagnoses, prescriptions, and follow-ups from the comfort of your home.",
        "تواصل مع طبيبك عبر مكالمة فيديو آمنة. احصل على تشخيص وروشتة ومتابعة من راحة منزلك."
      ),
    },
    {
      icon: Shield,
      title: t("Secure Health Records", "سجلات صحية آمنة"),
      description: t(
        "Your medical history, allergies, and test results — all stored securely in one place. Access anytime, anywhere.",
        "تاريخك الطبي وحساسيتك ونتائج تحاليلك — كل ذلك محفوظ بأمان في مكان واحد. اطلع عليه في أي وقت ومن أي مكان."
      ),
    },
    {
      icon: Star,
      title: t("Verified Reviews", "تقييمات موثوقة"),
      description: t(
        "Read honest reviews from patients who actually visited the doctor. Rate your experience after each consultation.",
        "اقرأ تقييمات صادقة من مرضى زاروا الطبيب فعلاً. قيّم تجربتك بعد كل استشارة."
      ),
    },
    {
      icon: Award,
      title: t("Doctor Network", "شبكة أطباء"),
      description: t(
        "Join a growing network of healthcare professionals. Connect with colleagues and build your online presence.",
        "انضم لشبكة متنامية من المتخصصين في الرعاية الصحية. تواصل مع الزملاء وابنِ حضورك على الإنترنت."
      ),
    },
  ];

  return (
    <section className="py-20 sm:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            {t("Everything You Need for Better Healthcare", "كل ما تحتاجه لرعاية صحية أفضل")}
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            {t(
              "From finding the right doctor to managing your health records, Tabibi simplifies your healthcare journey.",
              "من إيجاد الطبيب المناسب إلى إدارة سجلاتك الصحية، طبيبي تبسّط رحلتك الصحية."
            )}
          </p>
        </div>

        <div className="mt-16 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
          {features.map((feature, i) => (
            <div
              key={i}
              className="group relative rounded-2xl border border-border bg-card p-6 transition-all hover:shadow-lg hover:shadow-primary/5 hover:border-primary/20"
            >
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 transition-colors group-hover:bg-primary/20">
                <feature.icon className="h-6 w-6 text-primary" />
              </div>
              <h3 className="mt-4 text-lg font-semibold text-foreground">{feature.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                {feature.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function HowItWorksSection({ t, isRTL }: { t: (en: string, ar: string) => string; isRTL: boolean }) {
  const Arrow = isRTL ? ArrowLeft : ArrowRight;
  const steps = [
    {
      icon: Search,
      title: t("1. Search", "١. ابحث"),
      description: t(
        "Find doctors by specialty, city, or name. Filter by availability and patient ratings.",
        "ابحث عن أطباء حسب التخصص أو المدينة أو الاسم. رشّح حسب التوفر وتقييمات المرضى."
      ),
    },
    {
      icon: Calendar,
      title: t("2. Book", "٢. احجز"),
      description: t(
        "Choose a convenient time slot. Book in-person or online video consultation.",
        "اختر وقتًا مناسبًا. احجز استشارة حضورية أو فيديو أونلاين."
      ),
    },
    {
      icon: Stethoscope,
      title: t("3. Consult", "٣. استشر"),
      description: t(
        "Meet your doctor at the clinic or via secure video call. Get expert care.",
        "قابل طبيبك في العيادة أو عبر مكالمة فيديو آمنة. احصل على رعاية متخصصة."
      ),
    },
    {
      icon: Shield,
      title: t("4. Follow Up", "٤. تابع"),
      description: t(
        "Access your prescription and medical records. Book follow-ups with one click.",
        "اطلع على روشتتك وسجلاتك الطبية. احجز متابعات بنقرة واحدة."
      ),
    },
  ];

  return (
    <section className="bg-gradient-to-b from-secondary/30 to-background py-20 sm:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            {t("How Tabibi Works", "كيف يعمل طبيبي")}
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            {t(
              "Simple steps to get the care you need, when you need it.",
              "خطوات بسيطة للحصول على الرعاية التي تحتاجها، عندما تحتاجها."
            )}
          </p>
        </div>

        <div className="mt-16 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {steps.map((step, i) => (
            <div key={i} className="relative text-center">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-primary shadow-lg shadow-primary/20">
                <step.icon className="h-8 w-8 text-primary-foreground" />
              </div>
              <h3 className="mt-6 text-lg font-semibold text-foreground">{step.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground">{step.description}</p>
              {i < steps.length - 1 && (
                <div className="hidden lg:block absolute top-8 -right-4">
                  <Arrow className="h-6 w-6 text-border" />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function FaqSection({ t }: { t: (en: string, ar: string) => string }) {
  return (
    <section className="bg-background py-20 sm:py-28" id="faq">
      <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <h2 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            {t("Frequently Asked Questions", "الأسئلة الأكثر شيوعاً")}
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            {t(
              "Quick answers about booking, online consultations, security, and pricing.",
              "إجابات سريعة عن الحجز، الاستشارة أونلاين، الأمان، والأسعار."
            )}
          </p>
        </div>

        <div className="mt-12 divide-y divide-border rounded-2xl border border-border bg-card">
          {HOMEPAGE_FAQ.map((item, i) => (
            <details
              key={i}
              className="group p-6 [&_summary::-webkit-details-marker]:hidden"
            >
              <summary className="flex cursor-pointer items-start justify-between gap-4 text-right">
                <h3 className="text-base font-semibold text-foreground sm:text-lg">
                  {item.question}
                </h3>
                <span
                  aria-hidden
                  className="mt-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary transition-transform group-open:rotate-45"
                >
                  +
                </span>
              </summary>
              <p className="mt-4 text-sm leading-relaxed text-muted-foreground sm:text-base">
                {item.answer}
              </p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

function ArticlesTeaserSection({
  t,
  isRTL,
}: {
  t: (en: string, ar: string) => string;
  isRTL: boolean;
}) {
  const Arrow = isRTL ? ArrowLeft : ArrowRight;
  const cards = [
    {
      icon: <HeartPulse className="h-6 w-6" />,
      title: t("Symptoms & red flags", "الأعراض والعلامات المُقلقة"),
      desc: t(
        "Know when chest pain, fever or numbness need urgent care.",
        "اعرف متى يكون ألم الصدر أو الحرارة أو التنميل بحاجة لتدخل عاجل.",
      ),
    },
    {
      icon: <Stethoscope className="h-6 w-6" />,
      title: t("When to see which doctor", "متى تستشير طبيب الاختصاص"),
      desc: t(
        "Cardiologist, neurologist, pediatrician — pick the right specialty in seconds.",
        "قلب، مخ وأعصاب، أطفال... اختر التخصص الصحيح في ثوانٍ.",
      ),
    },
    {
      icon: <Shield className="h-6 w-6" />,
      title: t("Trusted, doctor-written", "محتوى يكتبه أطباء موثّقون"),
      desc: t(
        "Every article is reviewed by a licensed physician on the platform.",
        "كل مقال يُراجع بواسطة طبيب مرخّص على المنصة.",
      ),
    },
  ];

  return (
    <section className="py-16 sm:py-20" aria-labelledby="articles-teaser-heading">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="overflow-hidden rounded-3xl border border-border bg-gradient-to-br from-primary/5 via-background to-teal/5 p-8 sm:p-12">
          <div className="grid items-center gap-10 lg:grid-cols-2">
            <div>
              <span className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                <BookOpen className="h-3.5 w-3.5" />
                {t("Medical Library", "مكتبة طبية")}
              </span>
              <h2
                id="articles-teaser-heading"
                className="mt-4 text-3xl font-extrabold tracking-tight text-foreground sm:text-4xl"
              >
                {t(
                  "Read before you book — answers from real doctors",
                  "اقرأ قبل ما تحجز — إجابات من أطباء حقيقيين",
                )}
              </h2>
              <p className="mt-4 text-lg leading-8 text-muted-foreground">
                {t(
                  "Browse our growing library of medical articles written and reviewed by licensed doctors. Understand symptoms, treatment options, and know when it's time to consult a specialist.",
                  "تصفح مكتبة المحتوى الطبي المتنامية — مقالات يكتبها ويراجعها أطباء مرخّصون لتفهم الأعراض، الخيارات العلاجية، ومتى يجب استشارة الاختصاصي.",
                )}
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <Link
                  to="/articles"
                  className="inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-3 text-base font-semibold text-primary-foreground shadow-lg shadow-primary/20 transition-all hover:bg-primary/90 hover:shadow-xl"
                >
                  <BookOpen className="h-5 w-5" />
                  {t("Browse all articles", "تصفّح كل المقالات")}
                  <Arrow className="h-5 w-5" />
                </Link>
                <Link
                  to="/doctors"
                  className="inline-flex items-center gap-2 rounded-xl border border-border bg-card px-6 py-3 text-base font-semibold text-foreground transition-all hover:bg-accent"
                >
                  {t("Find a doctor", "ابحث عن طبيب")}
                </Link>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
              {cards.map((c, i) => (
                <Link
                  key={i}
                  to="/articles"
                  className="group rounded-2xl border border-border bg-card p-5 transition-all hover:-translate-y-1 hover:shadow-lg"
                >
                  <div className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                    {c.icon}
                  </div>
                  <h3 className="mt-4 text-base font-bold text-foreground">{c.title}</h3>
                  <p className="mt-2 text-sm text-muted-foreground">{c.desc}</p>
                </Link>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function CTASection({ t, isRTL }: { t: (en: string, ar: string) => string; isRTL: boolean }) {
  const Arrow = isRTL ? ArrowLeft : ArrowRight;

  return (
    <section className="py-20 sm:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-primary to-primary/80 px-6 py-16 sm:px-16 sm:py-20 lg:px-20">
          {/* Decorative elements */}
          <div className="absolute -right-10 -top-10 h-64 w-64 rounded-full bg-white/10 blur-3xl" />
          <div className="absolute -bottom-10 -left-10 h-64 w-64 rounded-full bg-teal/20 blur-3xl" />

          <div className="relative mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
              {t(
                "Ready to Take Control of Your Health?",
                "مستعد للتحكم في صحتك؟"
              )}
            </h2>
            <p className="mt-4 text-lg text-primary-foreground/80">
              {t(
                "Join thousands of patients and doctors who trust Tabibi for better healthcare.",
                "انضم لآلاف المرضى والأطباء الذين يثقون بطبيبي لرعاية صحية أفضل."
              )}
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-4">
              <Link
                to="/signup"
                className="inline-flex items-center gap-2 rounded-xl bg-white px-6 py-3 text-base font-semibold text-primary shadow-lg transition-all hover:bg-white/90 hover:shadow-xl"
              >
                {t("Get Started Free", "ابدأ مجاناً")}
                <Arrow className="h-5 w-5" />
              </Link>
              <Link
                to="/how-it-works"
                className="inline-flex items-center gap-2 rounded-xl border border-white/30 bg-white/10 px-6 py-3 text-base font-semibold text-white backdrop-blur-sm transition-all hover:bg-white/20"
              >
                {t("Learn More", "اعرف المزيد")}
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
