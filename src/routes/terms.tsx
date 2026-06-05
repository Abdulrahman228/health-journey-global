import { createFileRoute } from "@tanstack/react-router";
import { useLanguage } from "@/hooks/useLanguage";
import { FileText } from "lucide-react";
import { buildMeta } from "@/lib/seo";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: buildMeta({
      title: "Terms of Service — Tabibi | شروط الخدمة",
      description:
        "شروط استخدام منصة طبيبي للاستشارات الطبية أونلاين، مسؤوليات المستخدم، حدود المسؤولية، والسياسات القانونية.",
      path: "/terms",
    }),
  }),
  component: TermsPage,
});

const LAST_UPDATED_AR = "2 يونيو 2026";
const LAST_UPDATED_EN = "June 2, 2026";

type Section = { title: string; body: string[]; list?: string[] };

function TermsPage() {
  const { language, t } = useLanguage();
  const isAr = language === "ar";

  return (
    <div className="bg-background">
      <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
            <FileText className="h-8 w-8 text-primary" />
          </div>
          <h1 className="mt-6 text-4xl font-bold text-foreground">
            {t("Terms of Service", "شروط الخدمة")}
          </h1>
          <p className="mt-3 text-sm text-muted-foreground">
            {t(`Last updated: ${LAST_UPDATED_EN}`, `آخر تحديث: ${LAST_UPDATED_AR}`)}
          </p>
        </div>

        <div
          className="mt-12 space-y-10 leading-relaxed"
          dir={isAr ? "rtl" : "ltr"}
        >
          {(isAr ? sectionsAr : sectionsEn).map((s, i) => (
            <section key={i} className="space-y-3">
              <h2 className="border-b border-border pb-2 text-2xl font-bold text-foreground">
                {`${i + 1}. ${s.title}`}
              </h2>
              {s.body.map((p, j) => (
                <p key={j} className="text-muted-foreground">
                  {p}
                </p>
              ))}
              {s.list && (
                <ul className="ms-6 list-disc space-y-1 text-muted-foreground">
                  {s.list.map((li, j) => (
                    <li key={j}>{li}</li>
                  ))}
                </ul>
              )}
            </section>
          ))}

          <div className="mt-10 rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground">
            <strong className="text-foreground">
              {t("Contact us", "تواصل معنا")}:
            </strong>{" "}
            <a className="text-primary hover:underline" href="mailto:legal@mytabibi.com">
              legal@mytabibi.com
            </a>
            {" — "}
            <a className="text-primary hover:underline" href="/contact">
              {t("Contact page", "صفحة التواصل")}
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

const sectionsAr: Section[] = [
  {
    title: "تعريفات وقبول الشروط",
    body: [
      "منصة «طبيبي» (mytabibi.com) منصة رقمية تربط المرضى بأطباء موثّقين لتقديم استشارات طبية أونلاين، حجز المواعيد، إصدار الروشتات الإلكترونية، والبحث عن الأدوية نادرة التوفر.",
      "باستخدامك للمنصة فأنت توافق صراحةً على هذه الشروط وعلى سياسة الخصوصية. إذا كنت لا توافق، فضلاً امتنع عن استخدام الخدمة.",
    ],
  },
  {
    title: "أهلية الاستخدام",
    body: ["يُشترط لاستخدام المنصة:"],
    list: [
      "بلوغ سن 18 عاماً على الأقل، أو الحصول على موافقة ولي الأمر للقُصّر.",
      "تقديم بيانات صحيحة ودقيقة عند التسجيل والاستشارة.",
      "الالتزام بعدم انتحال شخصية أي طبيب أو صيدلي أو منشأة طبية.",
    ],
  },
  {
    title: "طبيعة الخدمة وإخلاء المسؤولية الطبية",
    body: [
      "تقدم منصة «طبيبي» وسيطاً تقنياً يربط المرضى بمقدمي رعاية مرخّصين. الأطباء على المنصة مهنيون مستقلون مسؤولون عن تشخيصاتهم ووصفاتهم العلاجية.",
      "الخدمة لا تُغني عن زيارة الطبيب وجهاً لوجه في الحالات المعقدة، ولا تُستخدم في الطوارئ. في حالات الطوارئ، توجّه فوراً إلى أقرب مستشفى أو اتصل بالإسعاف.",
      "لا تتحمل «طبيبي» مسؤولية نتائج العلاج، أو سوء التشخيص، أو الأضرار الناتجة عن قرارات طبية يتخذها الأطباء أو المرضى.",
    ],
  },
  {
    title: "الحساب وأمن البيانات",
    body: [
      "أنت مسؤول عن الحفاظ على سرية بيانات الدخول لحسابك. أي نشاط يتم من خلال حسابك يُعتبر صادراً عنك.",
      "في حال اكتشاف أي استخدام غير مصرح به، أبلغنا فوراً عبر support@mytabibi.com.",
    ],
  },
  {
    title: "المدفوعات والرسوم والاسترداد",
    body: [
      "حجز المواعيد عبر منصة «طبيبي» مجاني تماماً للمرضى، ولا تُحصّل المنصة أي عمولة على عملية الحجز ذاتها.",
      "تُحصّل «طبيبي» عمولة فقط على خدمة الكشف الأونلاين (الاستشارة عن بُعد عبر الفيديو/المحادثة)، وذلك من قيمة الاستشارة التي يُحدّدها الطبيب.",
      "تشمل باقات الأطباء الاختيارية: الباقة المميزة بسعر 500 جنيه شهرياً، والباقة الذهبية بسعر 1000 جنيه شهرياً، وتمنح الطبيب مزايا إضافية على المنصة.",
      "تتم جميع المدفوعات بأمان عبر بوابة Stripe المعتمدة، بالعملة المصرية (EGP) أو ما يعادلها.",
      "سياسة الاسترداد: يحق للمريض طلب استرداد كامل لقيمة الكشف الأونلاين قبل بدء الاستشارة، وذلك بإرسال طلب إلى billing@mytabibi.com. لا يُسترد المبلغ بعد إتمام الاستشارة.",
    ],
  },
  {
    title: "الروشتة الإلكترونية والأدوية",
    body: [
      "الروشتات الإلكترونية الصادرة عبر المنصة موقّعة رقمياً وتحمل بيانات الطبيب المُصدِر، وهي ملزمة قانونياً وفق القوانين المعمول بها.",
      "خدمة «الأدوية نادرة التوفر» تتيح للمرضى البحث عن بدائل ومصادر للأدوية غير المتاحة، ولا تُعد ضماناً لتوفّرها.",
    ],
  },
  {
    title: "الاستخدامات المحظورة",
    body: ["يُحظر على المستخدم:"],
    list: [
      "استخدام المنصة لأي غرض غير قانوني أو يضرّ بالغير.",
      "محاولة اختراق المنصة أو تعطيلها أو الوصول لبيانات مستخدمين آخرين.",
      "نشر محتوى مضلّل أو تجاري غير مرخّص أو ينتهك حقوق الملكية الفكرية.",
      "استخدام المنصة لتقديم استشارات طبية دون ترخيص ساري المفعول.",
    ],
  },
  {
    title: "الملكية الفكرية",
    body: [
      "جميع حقوق الملكية الفكرية للمنصة، بما في ذلك الشعار والتصميم والكود والمحتوى، مملوكة لـ «طبيبي» أو المرخّصين لها. لا يجوز نسخها أو إعادة استخدامها دون إذن كتابي مسبق.",
    ],
  },
  {
    title: "إنهاء الخدمة",
    body: [
      "يحق للمنصة تعليق أو إنهاء حسابك عند مخالفتك لأي من هذه الشروط، أو في حال ثبوت تقديمك لمعلومات مزيّفة، دون إخلال بأي حقوق سابقة لأي طرف.",
    ],
  },
  {
    title: "حدود المسؤولية",
    body: [
      "ضمن الحدود التي يسمح بها القانون، لا تتحمل «طبيبي» أو موظفوها أو شركاؤها المسؤولية عن أي أضرار غير مباشرة أو تبعية أو خاصة ناتجة عن استخدام المنصة أو تعطّلها.",
    ],
  },
  {
    title: "القانون الحاكم",
    body: [
      "تخضع هذه الشروط وتُفسّر وفقاً لقوانين جمهورية مصر العربية، وتختص محاكم القاهرة بأي نزاع ينشأ عنها.",
    ],
  },
  {
    title: "تعديل الشروط",
    body: [
      "يحق للمنصة تعديل هذه الشروط في أي وقت. ستُنشر التعديلات على هذه الصفحة مع تحديث تاريخ «آخر تحديث»، ويُعتبر استمرارك في استخدام المنصة موافقةً ضمنية على التعديلات.",
    ],
  },
];

const sectionsEn: Section[] = [
  {
    title: "Acceptance of Terms",
    body: [
      "Tabibi (mytabibi.com) is a digital platform connecting patients with verified physicians for online consultations, appointment booking, e-prescriptions, and rare medication search.",
      "By using the platform you expressly agree to these Terms and to our Privacy Policy. If you do not agree, please refrain from using the service.",
    ],
  },
  {
    title: "Eligibility",
    body: ["To use the platform you must:"],
    list: [
      "Be at least 18 years old, or have parental consent if a minor.",
      "Provide accurate and truthful information at registration and consultation.",
      "Not impersonate any doctor, pharmacist, or medical entity.",
    ],
  },
  {
    title: "Nature of Service & Medical Disclaimer",
    body: [
      "Tabibi acts as a technical intermediary between patients and licensed providers. Doctors on the platform are independent professionals responsible for their own diagnoses and prescriptions.",
      "The service is NOT a substitute for in-person care in complex cases and is NOT for emergencies. In emergencies, go to the nearest hospital or call ambulance services immediately.",
      "Tabibi is not liable for treatment outcomes, misdiagnosis, or damages arising from medical decisions made by doctors or patients.",
    ],
  },
  {
    title: "Account & Data Security",
    body: [
      "You are responsible for safeguarding your login credentials. Any activity from your account is deemed yours.",
      "Report any unauthorised use immediately to support@mytabibi.com.",
    ],
  },
  {
    title: "Payments, Fees & Refunds",
    body: [
      "Booking appointments through Tabibi is completely FREE for patients. Tabibi does not charge any commission on the booking itself.",
      "Tabibi only takes a commission on online consultations (telemedicine via video/chat), deducted from the consultation fee set by the doctor.",
      "Optional doctor subscriptions: Premium (500 EGP/mo), Gold (1,000 EGP/mo) — providing additional platform features.",
      "All payments are securely processed via Stripe in EGP or local equivalents.",
      "Refund policy: full refund of the online consultation fee available before the consultation starts, by emailing billing@mytabibi.com. No refunds after a completed consultation.",
    ],
  },
  {
    title: "E-Prescriptions & Medications",
    body: [
      "Digitally signed e-prescriptions issued through the platform are legally binding under applicable law and carry the issuing doctor's credentials.",
      "The Rare Medications service helps patients locate alternatives and sources for hard-to-find drugs, but does not guarantee availability.",
    ],
  },
  {
    title: "Prohibited Uses",
    body: ["Users may not:"],
    list: [
      "Use the platform for any unlawful or harmful purpose.",
      "Attempt to breach, disrupt, or access other users' data.",
      "Post misleading, unauthorised commercial, or IP-infringing content.",
      "Provide medical advice without a valid licence.",
    ],
  },
  {
    title: "Intellectual Property",
    body: [
      "All IP rights, including logo, design, code, and content, belong to Tabibi or its licensors. No reproduction or reuse is permitted without prior written consent.",
    ],
  },
  {
    title: "Termination",
    body: [
      "We may suspend or terminate your account for any breach of these Terms or for fraudulent information, without prejudice to prior rights.",
    ],
  },
  {
    title: "Limitation of Liability",
    body: [
      "To the maximum extent permitted by law, Tabibi and its affiliates are not liable for any indirect, incidental, or special damages arising from use or unavailability of the platform.",
    ],
  },
  {
    title: "Governing Law",
    body: [
      "These Terms are governed by the laws of the Arab Republic of Egypt. Cairo courts have exclusive jurisdiction over any dispute.",
    ],
  },
  {
    title: "Changes to Terms",
    body: [
      'We may update these Terms at any time. Updates will be posted on this page with a revised "Last updated" date. Continued use constitutes acceptance.',
    ],
  },
];
