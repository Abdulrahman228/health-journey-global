import { createFileRoute, Link } from "@tanstack/react-router";
import { useLanguage } from "@/hooks/useLanguage";
import { useState } from "react";
import { buildMeta } from "@/lib/seo";
import {
  Stethoscope,
  Wallet,
  Calendar,
  LayoutDashboard,
  FileSignature,
  Video,
  TrendingUp,
  CheckCircle2,
  Star,
  Shield,
  CreditCard,
  BadgeCheck,
  Sparkles,
  ArrowRight,
  Calculator,
  Clock,
  HeadphonesIcon,
} from "lucide-react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { DOCTOR_PLANS, formatEgp } from "@/lib/plans";

export const Route = createFileRoute("/join-doctor")({
  head: () => ({
    meta: buildMeta({
      title: "انضم كطبيب — طبيبي | Join as Doctor on Tabibi",
      description:
        "انضم لأكبر منصة استشارات طبية أونلاين فى مصر والعالم العربى. تسجيل مجانى، روشتة إلكترونية، فيديو HD مدمج، ودخل إضافى من الكشف الأونلاين.",
      path: "/join-doctor",
    }),
  }),
  component: JoinDoctorPage,
});

function JoinDoctorPage() {
  const { t, language } = useLanguage();
  const isAr = language === "ar";

  return (
    <div className="bg-background">
      <Hero t={t} isAr={isAr} />
      <WhyJoin t={t} />
      <HowItWorks t={t} />
      <Plans t={t} />
      <IncomeCalculator t={t} isAr={isAr} />
      <TrustBar t={t} />
      <Faq t={t} />
      <FinalCTA t={t} />
    </div>
  );
}

type T = (en: string, ar: string) => string;

/* ─────────────────────── ① Hero ─────────────────────── */
function Hero({ t, isAr }: { t: T; isAr: boolean }) {
  return (
    <section className="relative overflow-hidden bg-gradient-to-br from-primary via-primary to-teal-600 text-white">
      <div className="absolute inset-0 opacity-10">
        <div
          className="absolute inset-0"
          style={{
            backgroundImage:
              "radial-gradient(circle at 20% 20%, white 1px, transparent 1px), radial-gradient(circle at 80% 80%, white 1px, transparent 1px)",
            backgroundSize: "40px 40px",
          }}
        />
      </div>

      <div className="relative mx-auto max-w-7xl px-4 py-20 sm:px-6 sm:py-28 lg:px-8">
        <div className="grid items-center gap-12 lg:grid-cols-2">
          <div className={isAr ? "text-start" : ""}>
            <div className="inline-flex items-center gap-2 rounded-full bg-white/10 px-4 py-1.5 text-sm font-medium backdrop-blur">
              <Sparkles className="h-4 w-4" />
              {t("Now accepting verified doctors", "نستقبل الأطباء الموثّقين الآن")}
            </div>

            <h1 className="mt-6 text-4xl font-bold leading-tight sm:text-5xl lg:text-6xl">
              {t(
                "Join the largest medical network in Egypt & the Arab world",
                "انضم لأكبر شبكة استشارات طبية فى مصر والعالم العربى",
              )}
            </h1>

            <p className="mt-5 text-lg text-white/90 sm:text-xl">
              {t(
                "Earn extra income, deliver smart care to your patients from anywhere — no booking commission, only a fair share on online consultations.",
                "اكسب دخلاً إضافياً وقدّم رعاية ذكية لمرضاك من أى مكان. الحجز مجانى تماماً، عمولة عادلة فقط على الكشف الأونلاين.",
              )}
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                to="/signup"
                search={{ role: "doctor" }}
                className="inline-flex items-center gap-2 rounded-xl bg-white px-6 py-3.5 text-base font-bold text-primary shadow-lg transition hover:scale-105 hover:shadow-xl"
              >
                {t("Start free registration", "ابدأ التسجيل المجانى")}
                <ArrowRight className={`h-5 w-5 ${isAr ? "rotate-180" : ""}`} />
              </Link>
              <Link
                to="/how-it-works"
                className="inline-flex items-center gap-2 rounded-xl border-2 border-white/40 bg-white/10 px-6 py-3.5 text-base font-bold text-white backdrop-blur transition hover:bg-white/20"
              >
                {t("How it works", "كيف يعمل")}
              </Link>
            </div>

            <div className="mt-10 grid grid-cols-3 gap-4 sm:gap-6">
              {[
                { n: "2,500+", l: t("Verified doctors", "طبيب موثّق") },
                { n: "50K+", l: t("Consultations", "استشارة") },
                { n: "4.8/5", l: t("Patient rating", "تقييم المرضى") },
              ].map((s, i) => (
                <div key={i} className="border-s border-white/20 ps-4">
                  <div className="text-2xl font-bold sm:text-3xl">{s.n}</div>
                  <div className="text-xs text-white/80 sm:text-sm">{s.l}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Decorative card */}
          <div className="relative hidden lg:block">
            <div className="absolute -inset-4 rounded-3xl bg-white/20 blur-2xl" />
            <div className="relative rounded-3xl bg-white/10 p-8 backdrop-blur-xl border border-white/20">
              <div className="flex items-center gap-3">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white text-primary">
                  <Stethoscope className="h-7 w-7" />
                </div>
                <div>
                  <div className="text-lg font-bold">
                    {t("Dr. Sarah Ahmed", "د. سارة أحمد")}
                  </div>
                  <div className="text-sm text-white/80">
                    {t("Cardiology • Verified", "قلب وأوعية دموية • موثّقة")}
                  </div>
                </div>
              </div>
              <div className="mt-6 grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-xl bg-white/10 p-3">
                  <div className="text-xs text-white/70">{t("This month", "هذا الشهر")}</div>
                  <div className="mt-1 text-2xl font-bold">EGP 18,400</div>
                </div>
                <div className="rounded-xl bg-white/10 p-3">
                  <div className="text-xs text-white/70">{t("Patients", "مرضى")}</div>
                  <div className="mt-1 text-2xl font-bold">142</div>
                </div>
              </div>
              <div className="mt-4 flex items-center gap-2 rounded-xl bg-white/10 p-3 text-sm">
                <CheckCircle2 className="h-5 w-5 text-emerald-300" />
                {t("New booking — 14:30 today", "حجز جديد — 14:30 اليوم")}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────── ② Why Join ─────────────────────── */
function WhyJoin({ t }: { t: T }) {
  const benefits = [
    {
      Icon: Wallet,
      color: "text-emerald-600 bg-emerald-50",
      title: t("Extra income", "دخل إضافى"),
      desc: t(
        "From online consultations, paid securely via Stripe in EGP.",
        "من الكشف الأونلاين، تُحوّل بأمان عبر Stripe بالجنيه المصرى.",
      ),
    },
    {
      Icon: Calendar,
      color: "text-blue-600 bg-blue-50",
      title: t("Flexible schedule", "جدول مرن"),
      desc: t(
        "You set your own slots. Cancel or pause anytime.",
        "أنت تحدد مواعيدك المتاحة. أوقف أو ألغِ فى أى وقت.",
      ),
    },
    {
      Icon: LayoutDashboard,
      color: "text-purple-600 bg-purple-50",
      title: t("Free dashboard", "لوحة تحكم مجانية"),
      desc: t(
        "Bookings, patients, earnings, analytics — all in one place.",
        "حجوزات، مرضى، أرباح، وتقارير تفصيلية — كلها فى مكان واحد.",
      ),
    },
    {
      Icon: FileSignature,
      color: "text-amber-600 bg-amber-50",
      title: t("E-prescription", "روشتة إلكترونية"),
      desc: t(
        "Digitally signed, legally binding, sent instantly to the patient.",
        "موقّعة رقمياً، ملزمة قانونياً، تُرسل فوراً للمريض.",
      ),
    },
    {
      Icon: Video,
      color: "text-rose-600 bg-rose-50",
      title: t("Built-in HD video", "فيديو HD مدمج"),
      desc: t(
        "No third-party software. End-to-end encrypted video & chat.",
        "بدون برامج خارجية. مكالمات فيديو ومحادثة مشفّرة طرف-لطرف.",
      ),
    },
    {
      Icon: TrendingUp,
      color: "text-teal-600 bg-teal-50",
      title: t("Marketing & SEO", "تسويق ذاتى"),
      desc: t(
        "Professional public profile optimised for Google rankings.",
        "صفحة احترافية محسّنة لمحركات البحث لزيادة وصولك للمرضى.",
      ),
    },
  ];

  return (
    <section className="border-y border-border bg-card py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="text-center">
          <h2 className="text-3xl font-bold text-foreground sm:text-4xl">
            {t("Why join Tabibi?", "ليه تنضم لطبيبي؟")}
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-muted-foreground">
            {t(
              "Everything you need to grow your practice online — minus the friction.",
              "كل ما تحتاجه لتنمية ممارستك الطبية أونلاين — بدون تعقيدات.",
            )}
          </p>
        </div>

        <div className="mt-12 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {benefits.map(({ Icon, color, title, desc }, i) => (
            <div
              key={i}
              className="rounded-2xl border border-border bg-background p-6 transition hover:border-primary/40 hover:shadow-md"
            >
              <div className={`flex h-12 w-12 items-center justify-center rounded-xl ${color}`}>
                <Icon className="h-6 w-6" />
              </div>
              <h3 className="mt-4 text-lg font-bold text-foreground">{title}</h3>
              <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────── ③ How It Works ─────────────────────── */
function HowItWorks({ t }: { t: T }) {
  const steps = [
    {
      n: "1",
      title: t("Sign up", "سجّل بياناتك"),
      desc: t("Create your account in under 2 minutes.", "أنشئ حسابك فى أقل من دقيقتين."),
    },
    {
      n: "2",
      title: t("Upload your licence", "ارفع رخصة المزاولة"),
      desc: t("Medical syndicate ID + national ID.", "بطاقة نقابة الأطباء + الرقم القومى."),
    },
    {
      n: "3",
      title: t("Get verified in ~24h", "التحقق خلال ~24 ساعة"),
      desc: t(
        "Our team reviews and approves your profile.",
        "فريقنا يراجع ملفك ويعتمده ويمنحك شارة التوثيق.",
      ),
    },
    {
      n: "4",
      title: t("Start receiving bookings", "ابدأ استقبال الحجوزات"),
      desc: t(
        "Your profile goes live and patients can book instantly.",
        "صفحتك تظهر للمرضى ويبدأ الحجز فوراً.",
      ),
    },
  ];

  return (
    <section className="py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="text-center">
          <h2 className="text-3xl font-bold text-foreground sm:text-4xl">
            {t("How it works", "إزاى تنضم فى 4 خطوات")}
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-muted-foreground">
            {t(
              "From signup to first booking in less than 48 hours.",
              "من التسجيل لاستقبال أول حجز فى أقل من 48 ساعة.",
            )}
          </p>
        </div>

        <div className="mt-14 grid gap-8 md:grid-cols-2 lg:grid-cols-4">
          {steps.map((s, i) => (
            <div key={i} className="relative">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-2xl font-bold text-white shadow-lg">
                {s.n}
              </div>
              <h3 className="mt-5 text-xl font-bold text-foreground">{s.title}</h3>
              <p className="mt-2 text-muted-foreground">{s.desc}</p>
              {i < steps.length - 1 && (
                <div className="absolute end-0 top-7 hidden h-0.5 w-12 bg-border lg:block" />
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────── ④ Plans ─────────────────────── */
function Plans({ t }: { t: T }) {
  const plans = DOCTOR_PLANS.map((p) => ({
    name: t(p.nameEn, p.nameAr),
    price: p.priceEgp === 0 ? "0" : formatEgp(p.priceEgp, "en"),
    period: p.priceEgp === 0 ? t("forever", "للأبد") : t("EGP / month", "ج.م / شهرياً"),
    featured: !!p.featured,
    badge: p.badgeEn && p.badgeAr ? t(p.badgeEn, p.badgeAr) : undefined,
    features: p.features.map((f) => t(f.en, f.ar)),
    cta: t(p.ctaEn, p.ctaAr),
  }));

  return (
    <section className="border-y border-border bg-card py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="text-center">
          <h2 className="text-3xl font-bold text-foreground sm:text-4xl">
            {t("Simple, transparent pricing", "أسعار بسيطة وشفّافة")}
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-muted-foreground">
            {t(
              "Start free. Upgrade only when you grow.",
              "ابدأ مجاناً. ارفع باقتك فقط عندما تنمو ممارستك.",
            )}
          </p>
        </div>

        <div className="mx-auto mt-12 grid max-w-5xl gap-6 lg:grid-cols-3">
          {plans.map((p, i) => (
            <div
              key={i}
              className={`relative rounded-2xl border p-8 transition ${
                p.featured
                  ? "scale-105 border-primary bg-background shadow-xl ring-2 ring-primary/20"
                  : "border-border bg-background hover:shadow-md"
              }`}
            >
              {p.badge && (
                <div className="absolute -top-3 start-1/2 -translate-x-1/2 rounded-full bg-primary px-3 py-1 text-xs font-bold text-white">
                  {p.badge}
                </div>
              )}
              <div className="text-lg font-bold text-foreground">{p.name}</div>
              <div className="mt-4 flex items-baseline gap-1">
                <span className="text-5xl font-bold text-foreground">{p.price}</span>
                <span className="text-sm text-muted-foreground">{p.period}</span>
              </div>
              <ul className="mt-6 space-y-3 text-sm">
                {p.features.map((f, j) => (
                  <li key={j} className="flex items-start gap-2 text-foreground/90">
                    <CheckCircle2 className="mt-0.5 h-5 w-5 flex-shrink-0 text-emerald-500" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              <Link
                to="/signup"
                search={{ role: "doctor" }}
                className={`mt-8 block rounded-xl px-4 py-3 text-center font-bold transition ${
                  p.featured
                    ? "bg-primary text-white hover:bg-primary/90"
                    : "border border-border bg-card text-foreground hover:bg-muted"
                }`}
              >
                {p.cta}
              </Link>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────── ⑤ Income Calculator ─────────────────────── */
function IncomeCalculator({ t, isAr }: { t: T; isAr: boolean }) {
  const [fee, setFee] = useState(200);
  const [count, setCount] = useState(60);
  const COMMISSION = 0.15; // 15%
  const gross = fee * count;
  const commission = Math.round(gross * COMMISSION);
  const net = gross - commission;

  return (
    <section className="py-20">
      <div className="mx-auto max-w-4xl px-4 sm:px-6 lg:px-8">
        <div className="text-center">
          <div className="mx-auto inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
            <Calculator className="h-7 w-7 text-primary" />
          </div>
          <h2 className="mt-5 text-3xl font-bold text-foreground sm:text-4xl">
            {t("Estimate your monthly income", "احسب دخلك المتوقّع شهرياً")}
          </h2>
          <p className="mt-3 text-muted-foreground">
            {t(
              "Tabibi takes a 15% commission only on online consultations. Booking is 100% free.",
              "تأخذ طبيبي 15% عمولة فقط على الكشف الأونلاين. الحجز مجانى 100%.",
            )}
          </p>
        </div>

        <div className="mt-10 grid gap-6 rounded-3xl border border-border bg-card p-6 sm:p-8 md:grid-cols-2">
          <div>
            <label className="block text-sm font-medium text-foreground">
              {t("Online consultation fee (EGP)", "سعر الكشف الأونلاين (ج.م)")}
            </label>
            <input
              type="number"
              min={50}
              max={2000}
              value={fee}
              onChange={(e) => setFee(Math.max(0, Number(e.target.value) || 0))}
              className="mt-2 w-full rounded-xl border border-border bg-background px-4 py-3 text-lg font-bold text-foreground focus:border-primary focus:outline-none"
            />
            <input
              type="range"
              min={50}
              max={1000}
              step={25}
              value={fee}
              onChange={(e) => setFee(Number(e.target.value))}
              className="mt-3 w-full accent-primary"
            />

            <label className="mt-6 block text-sm font-medium text-foreground">
              {t("Consultations per month", "عدد الكشوف شهرياً")}
            </label>
            <input
              type="number"
              min={0}
              max={500}
              value={count}
              onChange={(e) => setCount(Math.max(0, Number(e.target.value) || 0))}
              className="mt-2 w-full rounded-xl border border-border bg-background px-4 py-3 text-lg font-bold text-foreground focus:border-primary focus:outline-none"
            />
            <input
              type="range"
              min={0}
              max={300}
              step={5}
              value={count}
              onChange={(e) => setCount(Number(e.target.value))}
              className="mt-3 w-full accent-primary"
            />
          </div>

          <div className="flex flex-col justify-center rounded-2xl bg-gradient-to-br from-primary to-teal-600 p-6 text-white">
            <div className="text-sm uppercase tracking-wide text-white/80">
              {t("Your monthly take-home", "دخلك الشهرى الصافى")}
            </div>
            <div className={`mt-2 text-5xl font-bold ${isAr ? "" : "tracking-tight"}`}>
              {net.toLocaleString()} <span className="text-2xl">EGP</span>
            </div>
            <div className="mt-6 space-y-2 border-t border-white/20 pt-4 text-sm text-white/90">
              <div className="flex justify-between">
                <span>{t("Gross", "الإجمالى")}</span>
                <span className="font-semibold">{gross.toLocaleString()} EGP</span>
              </div>
              <div className="flex justify-between">
                <span>{t("Tabibi commission (15%)", "عمولة طبيبي (15%)")}</span>
                <span className="font-semibold">−{commission.toLocaleString()} EGP</span>
              </div>
            </div>
            <p className="mt-4 text-xs text-white/70">
              {t(
                "Indicative only — actual earnings vary by demand and reviews.",
                "تقدير فقط — الأرباح الفعلية تختلف حسب الطلب والتقييمات.",
              )}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────── ⑥ Trust Bar ─────────────────────── */
function TrustBar({ t }: { t: T }) {
  const items = [
    { Icon: Shield, label: t("TLS 1.3 encryption", "تشفير TLS 1.3") },
    { Icon: CreditCard, label: t("Stripe secured", "Stripe المعتمدة") },
    { Icon: BadgeCheck, label: t("Licenced & regulated", "مرخّصة ومنظّمة") },
    { Icon: HeadphonesIcon, label: t("24/7 support", "دعم 24/7") },
  ];
  return (
    <section className="border-y border-border bg-card py-10">
      <div className="mx-auto grid max-w-5xl grid-cols-2 gap-6 px-4 sm:grid-cols-4 sm:px-6 lg:px-8">
        {items.map(({ Icon, label }, i) => (
          <div key={i} className="flex items-center justify-center gap-2 text-muted-foreground">
            <Icon className="h-5 w-5 text-primary" />
            <span className="text-sm font-medium">{label}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ─────────────────────── ⑦ FAQ ─────────────────────── */
function Faq({ t }: { t: T }) {
  const faqs = [
    {
      q: t("Is registration free?", "هل التسجيل مجانى؟"),
      a: t(
        "Yes. Creating your account, building your profile, and receiving bookings is 100% free. We only charge a 15% commission on completed online consultations.",
        "نعم. إنشاء الحساب وبناء الصفحة الشخصية واستقبال الحجوزات كلها مجانية تماماً. نأخذ فقط عمولة 15% على الكشوف الأونلاين المكتملة.",
      ),
    },
    {
      q: t("How much commission does Tabibi take?", "كم تأخذ طبيبي عمولة؟"),
      a: t(
        "Commission applies only to online consultations: 15% on the Free plan, 12% on Premium, and 10% on Gold. Booking in-clinic appointments through Tabibi is completely free for both you and the patient.",
        "العمولة على الكشف الأونلاين فقط: 15% على الخطة المجانية، 12% على بريميوم، و10% على جولد. حجز المواعيد الحضورية عبر طبيبي مجانى تماماً للطبيب والمريض على السواء.",
      ),
    },
    {
      q: t("When do I receive my earnings?", "متى أستلم أرباحى؟"),
      a: t(
        "Earnings are paid out weekly via bank transfer (Egyptian banks) or to your Stripe account after a 7-day clearance period from the consultation date.",
        "تُحوَّل الأرباح أسبوعياً عبر تحويل بنكى (بنوك مصرية) أو لحساب Stripe الخاص بك بعد فترة تسوية 7 أيام من تاريخ الاستشارة.",
      ),
    },
    {
      q: t("Do I need special equipment?", "هل أحتاج معدّات خاصة؟"),
      a: t(
        "No. Any modern laptop or smartphone with a camera and stable internet is enough. The video tool is built into the platform — no downloads required.",
        "لا. أى لاب توب أو موبايل حديث به كاميرا وإنترنت ثابت يكفى. أداة الفيديو مدمجة فى المنصة بدون أى برامج خارجية.",
      ),
    },
    {
      q: t("What if a patient cancels?", "ماذا لو ألغى المريض الحجز؟"),
      a: t(
        "Cancellations more than 2 hours before the appointment are free. Late cancellations or no-shows are subject to your personal cancellation policy, which you set in your dashboard.",
        "الإلغاء قبل أكثر من ساعتين من الموعد بدون أى رسوم. الإلغاءات المتأخرة أو عدم الحضور تخضع لسياسة الإلغاء الخاصة بك التى تحدّدها من لوحة التحكم.",
      ),
    },
    {
      q: t("How do I cancel my subscription?", "كيف ألغى الاشتراك المدفوع؟"),
      a: t(
        "Cancel anytime from your billing settings. You keep all features until the end of the current billing period — no questions asked.",
        "تستطيع الإلغاء فى أى وقت من إعدادات الفوترة. تحتفظ بكل المزايا حتى نهاية فترة الفوترة الحالية — بدون أى أسئلة.",
      ),
    },
  ];

  return (
    <section className="py-20">
      <div className="mx-auto max-w-3xl px-4 sm:px-6 lg:px-8">
        <div className="text-center">
          <h2 className="text-3xl font-bold text-foreground sm:text-4xl">
            {t("Frequently asked questions", "أسئلة شائعة")}
          </h2>
          <p className="mt-3 text-muted-foreground">
            {t(
              "Everything you need to know before joining.",
              "كل ما تحتاج معرفته قبل الانضمام.",
            )}
          </p>
        </div>

        <Accordion type="single" collapsible className="mt-10">
          {faqs.map((f, i) => (
            <AccordionItem key={i} value={`item-${i}`} className="border-border">
              <AccordionTrigger className="text-start text-base font-semibold hover:no-underline">
                {f.q}
              </AccordionTrigger>
              <AccordionContent className="text-muted-foreground leading-relaxed">
                {f.a}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  );
}

/* ─────────────────────── ⑧ Final CTA ─────────────────────── */
function FinalCTA({ t }: { t: T }) {
  return (
    <section className="bg-gradient-to-br from-primary via-primary to-teal-600 py-20 text-white">
      <div className="mx-auto max-w-4xl px-4 text-center sm:px-6 lg:px-8">
        <Star className="mx-auto h-10 w-10 text-amber-300" fill="currentColor" />
        <h2 className="mt-4 text-3xl font-bold sm:text-4xl">
          {t("Ready to grow your practice?", "جاهز تنمّى ممارستك الطبية؟")}
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-lg text-white/90">
          {t(
            "Registration takes less than 5 minutes. Get verified in under 24 hours.",
            "التسجيل أقل من 5 دقائق، والتوثيق فى أقل من 24 ساعة.",
          )}
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link
            to="/signup"
            search={{ role: "doctor" }}
            className="inline-flex items-center gap-2 rounded-xl bg-white px-7 py-4 text-base font-bold text-primary shadow-lg transition hover:scale-105"
          >
            {t("Register now — free", "سجّل الآن — مجاناً")}
            <ArrowRight className="h-5 w-5 rtl:rotate-180" />
          </Link>
          <Link
            to="/contact"
            className="inline-flex items-center gap-2 rounded-xl border-2 border-white/40 bg-white/10 px-7 py-4 text-base font-bold text-white backdrop-blur transition hover:bg-white/20"
          >
            {t("Talk to sales", "تواصل مع فريق المبيعات")}
          </Link>
        </div>
        <div className="mt-6 flex items-center justify-center gap-2 text-sm text-white/80">
          <Clock className="h-4 w-4" />
          {t("No credit card required to start", "لا تحتاج بطاقة ائتمان للبدء")}
        </div>
      </div>
    </section>
  );
}
