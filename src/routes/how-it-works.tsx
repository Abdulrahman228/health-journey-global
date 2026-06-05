import { createFileRoute, Link } from "@tanstack/react-router";
import { useLanguage } from "@/hooks/useLanguage";
import {
  Search,
  Calendar,
  Video,
  FileText,
  Star,
  Shield,
  Stethoscope,
  Users,
  TrendingUp,
  Wallet,
  CheckCircle2,
  Pill,
  Clock,
} from "lucide-react";

export const Route = createFileRoute("/how-it-works")({
  head: () => ({
    meta: [
      { title: "كيف يعمل طبيبي — How It Works | Tabibi" },
      {
        name: "description",
        content:
          "تعرّف على طريقة عمل منصة طبيبي للمرضى والأطباء — من اختيار الطبيب وحتى الكشف الحضوري أو الاستشارة أونلاين والروشتة الإلكترونية.",
      },
    ],
  }),
  component: HowItWorksPage,
});

function HowItWorksPage() {
  const { t } = useLanguage();

  const patientSteps = [
    {
      icon: Search,
      title: t("Search & Compare", "ابحث وقارن"),
      desc: t(
        "Browse 2,500+ verified doctors by specialty, city, price, and rating. Read real reviews from patients.",
        "تصفّح أكثر من 2,500 طبيب موثّق حسب التخصص والمدينة والسعر والتقييم — اقرأ مراجعات حقيقية من المرضى.",
      ),
    },
    {
      icon: Calendar,
      title: t("Book Instantly", "احجز فوراً"),
      desc: t(
        "Pick a slot — in-person or online — and confirm in minutes. Pay securely; cancel free up to 24h before.",
        "اختر موعد حضوري أو أونلاين وأكّد الحجز خلال دقائق — ادفع بأمان، وإلغاء مجاني حتى 24 ساعة قبل الموعد.",
      ),
    },
    {
      icon: Video,
      title: t("Online Consultation", "استشارة أونلاين"),
      desc: t(
        "Submit a request, the doctor proposes a time + fee, accept and join the encrypted video/voice call.",
        "أرسل طلبك، يقترح الطبيب موعداً ورسوماً، وافِق وادخل مكالمة فيديو/صوت مشفّرة بالكامل.",
      ),
    },
    {
      icon: Pill,
      title: t("E-Prescription", "روشتة إلكترونية"),
      desc: t(
        "Receive a digitally-signed prescription you can take to any pharmacy or order delivered to your door.",
        "استلم وصفة رقمية موقّعة من الطبيب تصلح في أي صيدلية أو اطلبها للتوصيل لباب البيت.",
      ),
    },
  ];

  const doctorSteps = [
    {
      icon: Stethoscope,
      title: t("Create Your Profile", "أنشئ بروفايلك"),
      desc: t(
        "Sign up free, upload your license, get verified within 48h, and start receiving bookings.",
        "سجّل مجاناً، ارفع رخصتك المهنية، احصل على التوثيق خلال 48 ساعة، وابدأ استقبال الحجوزات.",
      ),
    },
    {
      icon: TrendingUp,
      title: t("Grow with Premium", "توسّع مع البريميوم"),
      desc: t(
        "Higher organic ranking, e-prescription tools, detailed analytics, priority support, and lower commission (12%).",
        "ترتيب أعلى في نتائج البحث، أدوات الروشتة الإلكترونية، تحليلات تفصيلية، دعم أولوية، وعمولة أقل 12%.",
      ),
    },
    {
      icon: Wallet,
      title: t("Maximize with Gold", "حقّق أقصى دخل مع جولد"),
      desc: t(
        "Sponsored top placements, integrated accounting system (invoices/expenses/income reports), custom subdomain, lowest commission in market (10%).",
        "مكان مميّز في أعلى النتائج، نظام محاسبى متكامل (فواتير ومصروفات وتقارير دخل)، نطاق فرعي خاص، أقل عمولة في السوق 10%.",
      ),
    },
    {
      icon: Users,
      title: t("Manage Patients", "إدارة المرضى"),
      desc: t(
        "Calendar, online queue, masked-call privacy, electronic medical records, and instant Stripe payouts.",
        "تقويم، طابور كشف أونلاين، مكالمات بأرقام مقنّعة لحماية الخصوصية، سجلات طبية إلكترونية، وتحويلات Stripe فورية.",
      ),
    },
  ];

  const trustBadges = [
    {
      icon: Shield,
      title: t("Verified Doctors", "أطباء موثّقون"),
      desc: t("All doctors are license-verified", "كل الأطباء موثّقو الترخيص"),
    },
    {
      icon: Clock,
      title: t("24/7 Support", "دعم 24/7"),
      desc: t("Always-on customer support", "دعم عملاء طوال الوقت"),
    },
    {
      icon: CheckCircle2,
      title: t("Secure Payments", "دفع آمن"),
      desc: t("Stripe + bank-grade encryption", "Stripe وتشفير مصرفي"),
    },
    {
      icon: Star,
      title: t("Real Reviews", "مراجعات حقيقية"),
      desc: t("Only from verified patients", "من مرضى تم التحقق منهم"),
    },
  ];

  return (
    <div className="min-h-screen bg-background">
      {/* Hero */}
      <section className="border-b border-border bg-linear-to-b from-primary/5 via-background to-background py-16 sm:py-20">
        <div className="mx-auto max-w-4xl px-4 text-center sm:px-6 lg:px-8">
          <span className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
            <Stethoscope className="h-3.5 w-3.5" />
            {t("How Tabibi Works", "كيف يعمل طبيبي")}
          </span>
          <h1 className="mt-4 text-3xl font-bold tracking-tight text-foreground sm:text-5xl">
            {t(
              "Healthcare made simple — for everyone",
              "رعاية صحية ميسّرة — للجميع",
            )}
          </h1>
          <p className="mt-4 text-base text-muted-foreground sm:text-lg">
            {t(
              "From booking a verified doctor to receiving an e-prescription at home — Tabibi makes every step seamless.",
              "من حجز طبيب موثّق إلى استلام روشتة إلكترونية في البيت — منصة طبيبي تخلّي كل خطوة سلسة.",
            )}
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link
              to="/doctors"
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground shadow-sm hover:bg-primary/90"
            >
              {t("Find a doctor", "ابحث عن طبيب")}
            </Link>
            <Link
              to="/join-doctor"
              className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-6 py-3 text-sm font-semibold text-foreground hover:bg-muted"
            >
              {t("Join as a doctor", "انضم كطبيب")}
            </Link>
          </div>
        </div>
      </section>

      {/* For Patients */}
      <section className="py-16 sm:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <span className="inline-flex items-center gap-2 rounded-full bg-teal/10 px-3 py-1 text-xs font-medium text-teal">
              <Users className="h-3.5 w-3.5" />
              {t("For Patients", "للمرضى")}
            </span>
            <h2 className="mt-3 text-3xl font-bold text-foreground sm:text-4xl">
              {t("4 simple steps", "4 خطوات بسيطة")}
            </h2>
            <p className="mt-3 text-base text-muted-foreground">
              {t(
                "From searching to receiving care — everything in one place.",
                "من البحث وحتى الحصول على الرعاية — كل شيء في مكان واحد.",
              )}
            </p>
          </div>

          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {patientSteps.map((step, i) => {
              const Icon = step.icon;
              return (
                <div
                  key={i}
                  className="relative rounded-2xl border border-border bg-card p-6 shadow-sm transition-shadow hover:shadow-md"
                >
                  <div className="absolute -top-3 inset-s-6 flex h-7 w-7 items-center justify-center rounded-full bg-primary text-xs font-bold text-primary-foreground">
                    {i + 1}
                  </div>
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
                    <Icon className="h-6 w-6 text-primary" />
                  </div>
                  <h3 className="mt-4 text-lg font-semibold text-foreground">
                    {step.title}
                  </h3>
                  <p className="mt-2 text-sm text-muted-foreground">{step.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* For Doctors */}
      <section className="border-y border-border bg-secondary/30 py-16 sm:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <span className="inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
              <Stethoscope className="h-3.5 w-3.5" />
              {t("For Doctors", "للأطباء")}
            </span>
            <h2 className="mt-3 text-3xl font-bold text-foreground sm:text-4xl">
              {t("Grow your practice", "طوّر عيادتك")}
            </h2>
            <p className="mt-3 text-base text-muted-foreground">
              {t(
                "Reach more patients and run your clinic on a single platform.",
                "اوصل لعدد أكبر من المرضى وأدر عيادتك من منصّة واحدة.",
              )}
            </p>
          </div>

          <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {doctorSteps.map((step, i) => {
              const Icon = step.icon;
              return (
                <div
                  key={i}
                  className="relative rounded-2xl border border-border bg-card p-6 shadow-sm transition-shadow hover:shadow-md"
                >
                  <div className="absolute -top-3 inset-s-6 flex h-7 w-7 items-center justify-center rounded-full bg-teal text-xs font-bold text-white">
                    {i + 1}
                  </div>
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-teal/10">
                    <Icon className="h-6 w-6 text-teal" />
                  </div>
                  <h3 className="mt-4 text-lg font-semibold text-foreground">
                    {step.title}
                  </h3>
                  <p className="mt-2 text-sm text-muted-foreground">{step.desc}</p>
                </div>
              );
            })}
          </div>

          <div className="mt-12 flex flex-wrap items-center justify-center gap-3">
            <Link
              to="/pricing"
              className="inline-flex items-center gap-2 rounded-lg bg-foreground px-6 py-3 text-sm font-semibold text-background hover:opacity-90"
            >
              {t("View pricing plans", "اطّلع على خطط الأسعار")}
            </Link>
            <Link
              to="/join-doctor"
              className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-6 py-3 text-sm font-semibold text-foreground hover:bg-muted"
            >
              {t("Start free", "ابدأ مجاناً")}
            </Link>
          </div>
        </div>
      </section>

      {/* Trust */}
      <section className="py-16 sm:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold text-foreground sm:text-4xl">
              {t("Why trust Tabibi?", "ليه طبيبي؟")}
            </h2>
          </div>
          <div className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {trustBadges.map((b, i) => {
              const Icon = b.icon;
              return (
                <div
                  key={i}
                  className="rounded-2xl border border-border bg-card p-6 text-center shadow-sm"
                >
                  <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
                    <Icon className="h-6 w-6 text-primary" />
                  </div>
                  <h3 className="mt-4 text-base font-semibold text-foreground">
                    {b.title}
                  </h3>
                  <p className="mt-1 text-sm text-muted-foreground">{b.desc}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* FAQ teaser */}
      <section className="border-t border-border bg-secondary/30 py-16 sm:py-20">
        <div className="mx-auto max-w-3xl px-4 text-center sm:px-6 lg:px-8">
          <FileText className="mx-auto h-10 w-10 text-primary" />
          <h2 className="mt-4 text-2xl font-bold text-foreground sm:text-3xl">
            {t("Still have questions?", "عندك أسئلة تانية؟")}
          </h2>
          <p className="mt-3 text-muted-foreground">
            {t(
              "Read our terms, privacy policy, or contact our 24/7 support team.",
              "اطّلع على الشروط، سياسة الخصوصية، أو تواصل مع فريق الدعم 24/7.",
            )}
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <Link
              to="/contact"
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
            >
              {t("Contact us", "تواصل معنا")}
            </Link>
            <Link
              to="/terms"
              className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-5 py-2.5 text-sm font-semibold text-foreground hover:bg-muted"
            >
              {t("Terms", "الشروط")}
            </Link>
            <Link
              to="/privacy"
              className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-5 py-2.5 text-sm font-semibold text-foreground hover:bg-muted"
            >
              {t("Privacy", "الخصوصية")}
            </Link>
          </div>
          <p className="mt-6 text-xs text-muted-foreground">
            {t(
              "Tabibi is HIPAA-aligned and GDPR-compliant.",
              "منصة طبيبي ملتزمة بمعايير HIPAA وGDPR.",
            )}
          </p>
        </div>
      </section>
    </div>
  );
}
