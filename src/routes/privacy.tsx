import { createFileRoute } from "@tanstack/react-router";
import { useLanguage } from "@/hooks/useLanguage";
import { Shield } from "lucide-react";
import { buildMeta } from "@/lib/seo";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: buildMeta({
      title: "Privacy Policy — Tabibi | سياسة الخصوصية",
      description:
        "سياسة الخصوصية وحماية البيانات الطبية لمنصة طبيبي. معلومات عن جمع البيانات، استخدامها، تشفيرها، وحقوقك القانونية.",
      path: "/privacy",
    }),
  }),
  component: PrivacyPage,
});

const LAST_UPDATED_AR = "2 يونيو 2026";
const LAST_UPDATED_EN = "June 2, 2026";

type Section = { title: string; body: string[]; list?: string[] };

function PrivacyPage() {
  const { language, t } = useLanguage();
  const isAr = language === "ar";

  return (
    <div className="bg-background">
      <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10">
            <Shield className="h-8 w-8 text-primary" />
          </div>
          <h1 className="mt-6 text-4xl font-bold text-foreground">
            {t("Privacy Policy", "سياسة الخصوصية")}
          </h1>
          <p className="mt-3 text-sm text-muted-foreground">
            {t(`Last updated: ${LAST_UPDATED_EN}`, `آخر تحديث: ${LAST_UPDATED_AR}`)}
          </p>
        </div>

        <div
          className="mt-8 rounded-xl border border-primary/20 bg-primary/5 p-5 text-sm leading-relaxed text-foreground/90"
          dir={isAr ? "rtl" : "ltr"}
        >
          {t(
            "We treat your medical data as our top priority. This policy explains in plain language what we collect, why, and how you can control it.",
            "نتعامل مع بياناتك الطبية باعتبارها أولوية قصوى. توضّح هذه السياسة بلغة مبسّطة ما نجمعه، ولماذا، وكيف يمكنك التحكم فيه.",
          )}
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
              {t("Privacy contact", "تواصل لشؤون الخصوصية")}:
            </strong>{" "}
            <a className="text-primary hover:underline" href="mailto:privacy@mytabibi.com">
              privacy@mytabibi.com
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
    title: "البيانات التي نجمعها",
    body: ["نجمع الفئات التالية من البيانات لتقديم الخدمة بشكل صحيح:"],
    list: [
      "بيانات الحساب: الاسم، البريد الإلكتروني، رقم الهاتف، تاريخ الميلاد، الجنس.",
      "بيانات طبية: التاريخ المرضي، الأعراض، التشخيصات، الروشتات، الفحوصات (يقدّمها المستخدم طوعياً).",
      "بيانات الدفع: تُعالَج كاملةً عبر Stripe، ولا نخزّن أرقام البطاقات على خوادمنا.",
      "بيانات تقنية: عنوان IP، نوع المتصفح، نظام التشغيل، صفحات الزيارة، لتحسين الأداء والأمن.",
      "ملفات تعريف الارتباط (Cookies): لإبقائك مسجّل الدخول وتذكّر تفضيلاتك (اللغة، الوضع الليلي).",
    ],
  },
  {
    title: "كيف نستخدم البيانات",
    body: ["نستخدم بياناتك للأغراض التالية فقط:"],
    list: [
      "تقديم الاستشارات الطبية وحجز المواعيد وإصدار الروشتات الإلكترونية.",
      "معالجة المدفوعات وإصدار الفواتير الضريبية.",
      "تحسين تجربة المستخدم والميزات الجديدة عبر تحليلات مجمّعة لا تكشف الهوية.",
      "إرسال تنبيهات الحجوزات والمواعيد عبر البريد الإلكتروني وواتساب (يمكنك إلغاء الاشتراك في أي وقت).",
      "الامتثال للالتزامات القانونية والتنظيمية (مثل الاحتفاظ بسجلات الفواتير).",
    ],
  },
  {
    title: "الأمان والتشفير",
    body: [
      "تُنقل جميع البيانات عبر الإنترنت باستخدام تشفير TLS 1.3.",
      "تُخزَّن البيانات الحساسة (مثل الملفات الطبية) مشفّرة في قاعدة البيانات (Encryption at Rest) عبر خدمة Supabase الخاضعة لشهادات SOC 2.",
      "نستخدم سياسات الأمان على مستوى الصف (Row Level Security) لضمان أن المريض يرى بياناته فقط، والطبيب يرى فقط ملفات مرضاه المعتمدين.",
      "لا يطّلع موظفو «طبيبي» على ملفاتك الطبية إلا في حالات الدعم الفني عند طلبك أو لأسباب أمنية موثّقة.",
    ],
  },
  {
    title: "مشاركة البيانات مع أطراف ثالثة",
    body: ["نشارك أجزاء محدودة من بياناتك مع شركاء موثوقين فقط لتشغيل الخدمة:"],
    list: [
      "Stripe: لمعالجة المدفوعات (لا يصلهم محتوى استشاراتك الطبية).",
      "Supabase: لاستضافة قاعدة البيانات وملفات الوسائط.",
      "Cloudflare: لتشغيل الموقع وحمايته من الهجمات.",
      "خدمات البريد/واتساب: لإرسال تنبيهات الحجوزات (الاسم ورقم الهاتف فقط).",
      "الأطباء الذين تتشاور معهم بنفسك: يطّلعون فقط على البيانات الطبية التي تشاركها معهم في الاستشارة.",
    ],
  },
  {
    title: "حقوقك",
    body: ["وفقاً للقوانين المعمول بها، لك الحق في:"],
    list: [
      "الاطلاع على بياناتك الشخصية المخزّنة لدينا.",
      "تصحيح أي بيانات غير دقيقة من إعدادات حسابك.",
      "طلب حذف حسابك وبياناتك بالكامل (مع مراعاة الالتزامات القانونية للاحتفاظ بسجلات الفواتير).",
      "تنزيل نسخة من بياناتك بصيغة قابلة للقراءة الآلية.",
      "إلغاء الاشتراك في الإشعارات التسويقية في أي وقت.",
      "تقديم شكوى لدى السلطة المختصة بحماية البيانات إذا رأيت أن حقوقك انتُهكت.",
    ],
  },
  {
    title: "مدة الاحتفاظ بالبيانات",
    body: [
      "نحتفظ ببيانات الحساب طالما حسابك نشط.",
      "تُحفَظ السجلات الطبية والروشتات لمدة 5 سنوات بعد آخر استشارة، وفقاً للوائح الطبية المصرية.",
      "تُحفَظ سجلات الفواتير لمدة 5 سنوات وفقاً لمتطلبات مصلحة الضرائب المصرية.",
      "تُحذف بقية البيانات خلال 30 يوماً من إغلاق الحساب.",
    ],
  },
  {
    title: "ملفات تعريف الارتباط (Cookies)",
    body: [
      "نستخدم ملفات تعريف ارتباط أساسية لتسجيل الدخول وتذكّر التفضيلات. لا نستخدم ملفات تعريف ارتباط للتتبّع الإعلاني.",
      "يمكنك التحكم في هذه الملفات عبر إعدادات متصفحك، مع ملاحظة أن تعطيلها قد يؤثر على بعض وظائف المنصة.",
    ],
  },
  {
    title: "الأطفال",
    body: [
      "خدماتنا غير موجّهة للأطفال دون 18 عاماً دون موافقة ولي الأمر. إذا اكتشفنا حساباً لطفل دون موافقة، نحذفه فوراً.",
    ],
  },
  {
    title: "النقل الدولي للبيانات",
    body: [
      "قد تُعالَج بعض البيانات على خوادم خارج مصر (مثل خوادم Supabase وStripe وCloudflare) ضمن دول تتمتع بمعايير حماية مكافئة. نتأكد من وجود ضمانات تعاقدية مناسبة لحماية البيانات.",
    ],
  },
  {
    title: "تحديثات السياسة",
    body: [
      "قد نُحدّث هذه السياسة من وقت لآخر. سننشر الإصدار الجديد على هذه الصفحة مع تحديث تاريخ «آخر تحديث»، ونُخطرك عبر البريد بأي تغييرات جوهرية.",
    ],
  },
];

const sectionsEn: Section[] = [
  {
    title: "Data We Collect",
    body: ["We collect the following categories to deliver the service:"],
    list: [
      "Account data: name, email, phone, date of birth, gender.",
      "Medical data: medical history, symptoms, diagnoses, prescriptions, lab results (provided voluntarily).",
      "Payment data: processed entirely via Stripe; we never store card numbers on our servers.",
      "Technical data: IP address, browser type, OS, page visits — used to improve performance and security.",
      "Cookies: to keep you logged in and remember preferences (language, dark mode).",
    ],
  },
  {
    title: "How We Use Data",
    body: ["We use your data only for:"],
    list: [
      "Providing consultations, appointments, and e-prescriptions.",
      "Processing payments and issuing tax invoices.",
      "Improving UX and features via aggregated, anonymised analytics.",
      "Sending booking and appointment notifications via email and WhatsApp (you can opt out anytime).",
      "Complying with legal and regulatory obligations (e.g. invoice records).",
    ],
  },
  {
    title: "Security & Encryption",
    body: [
      "All data in transit is protected by TLS 1.3.",
      "Sensitive data (medical files) is encrypted at rest in our Supabase database, which is SOC 2 certified.",
      "Row Level Security ensures patients see only their own data, and doctors only see records of their approved patients.",
      "Tabibi staff access your medical files only on your explicit support request or for documented security reasons.",
    ],
  },
  {
    title: "Sharing With Third Parties",
    body: ["We share limited data only with trusted partners required to run the service:"],
    list: [
      "Stripe — to process payments (never receives consultation content).",
      "Supabase — to host the database and media files.",
      "Cloudflare — to serve and protect the website.",
      "Email/WhatsApp providers — to send booking alerts (name and phone only).",
      "Doctors you consult — see only the medical data you share with them in the consultation.",
    ],
  },
  {
    title: "Your Rights",
    body: ["Under applicable law you have the right to:"],
    list: [
      "Access the personal data we hold about you.",
      "Correct any inaccurate data from your account settings.",
      "Request full deletion of your account and data (subject to legal retention obligations).",
      "Download a copy of your data in a machine-readable format.",
      "Opt out of marketing notifications at any time.",
      "Lodge a complaint with the competent data-protection authority if you believe your rights were violated.",
    ],
  },
  {
    title: "Retention",
    body: [
      "We retain account data while your account is active.",
      "Medical records and prescriptions are kept for 5 years after the last consultation, per Egyptian medical regulations.",
      "Invoice records are retained for 5 years per the Egyptian Tax Authority's requirements.",
      "All other data is deleted within 30 days after account closure.",
    ],
  },
  {
    title: "Cookies",
    body: [
      "We use essential cookies for login and preferences. We do not use advertising-tracking cookies.",
      "You can manage cookies via your browser settings; disabling them may affect some platform functions.",
    ],
  },
  {
    title: "Children",
    body: [
      "Our services are not directed at children under 18 without parental consent. If we discover such an account, we delete it immediately.",
    ],
  },
  {
    title: "International Data Transfers",
    body: [
      "Some data may be processed on servers outside Egypt (Supabase, Stripe, Cloudflare) in jurisdictions with equivalent protection standards. Appropriate contractual safeguards are in place.",
    ],
  },
  {
    title: "Policy Updates",
    body: [
      'We may update this policy from time to time. The new version will be posted on this page with an updated "Last updated" date, and we will notify you by email of any material changes.',
    ],
  },
];
