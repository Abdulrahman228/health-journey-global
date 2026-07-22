import { createFileRoute } from "@tanstack/react-router";
import { useAdminGuard } from "@/hooks/useAdminGuard";
import { AdminShell } from "@/components/admin/AdminNav";
import {
  BedDouble,
  Loader2,
  Clock,
  ClipboardList,
  UserCheck,
  AlertCircle,
  TrendingUp,
} from "lucide-react";

export const Route = createFileRoute("/admin/admissions")({
  head: () => ({
    meta: [
      { title: "الإدخال والأسرة — لوحة الأدمن" },
      { name: "description", content: "إدارة المرضى الداخليين والأسرة المتاحة في المستشفى." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: AdminAdmissionsPage,
});

type BedStatCard = {
  icon: typeof BedDouble;
  label: string;
  value: string;
  sub: string;
  tone: "primary" | "emerald" | "amber" | "rose";
};

const BED_STATS: BedStatCard[] = [
  { icon: BedDouble, label: "إجمالي الأسرة", value: "—", sub: "لم تُكوَّن بعد", tone: "primary" },
  { icon: UserCheck, label: "الأسرة المشغولة", value: "—", sub: "في انتظار البيانات", tone: "emerald" },
  { icon: Clock, label: "إدخال اليوم", value: "—", sub: "حجوزات الإدخال اليوم", tone: "amber" },
  { icon: AlertCircle, label: "انتظار الخروج", value: "—", sub: "قيد موافقة الطبيب", tone: "rose" },
];

const PLANNED_MODULES = [
  {
    icon: BedDouble,
    title: "خريطة الأسرة (Bed Map)",
    desc: "عرض مرئي للأجنحة والطوابق مع حالة كل سرير في الوقت الفعلي.",
  },
  {
    icon: ClipboardList,
    title: "قيد الإدخال",
    desc: "تسجيل دخول مريض جديد مع ربط ملفه الطبي وتخصيص سرير.",
  },
  {
    icon: UserCheck,
    title: "موافقات الخروج",
    desc: "قائمة المرضى المقررين خروجهم بانتظار مراجعة الطبيب وتسوية الفاتورة.",
  },
  {
    icon: TrendingUp,
    title: "تقارير الإشغال",
    desc: "نسب الإشغال اليومية والأسبوعية والشهرية لكل جناح وتخصص.",
  },
];

function AdminAdmissionsPage() {
  const { isLoading, isAdmin, ready } = useAdminGuard();

  if (isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" aria-hidden="true" />
      </div>
    );
  }

  // Not admin — useAdminGuard is already navigating away; render nothing during transition.
  if (!isAdmin) return null;

  return (
    <AdminShell>
      <header className="mb-6">
        <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
          <BedDouble className="h-3.5 w-3.5" aria-hidden="true" />
          وحدة المستشفى · HIS
        </div>
        <h1 className="text-3xl font-bold tracking-tight">إدارة المرضى الداخليين والأسرة</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          مراقبة الطاقة الاستيعابية للأجنحة، قيد الإدخال والخروج، وتقارير الإشغال.
        </p>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="إحصائيات الأسرة">
        {BED_STATS.map(({ icon: Icon, label, value, sub, tone }) => {
          const toneClass = {
            primary: "bg-primary/10 text-primary",
            emerald: "bg-emerald-500/10 text-emerald-600",
            amber: "bg-amber-500/10 text-amber-600",
            rose: "bg-rose-500/10 text-rose-600",
          }[tone];
          return (
            <div key={label} className="rounded-xl border border-border bg-card p-4">
              <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${toneClass}`}>
                <Icon className="h-5 w-5" aria-hidden="true" />
              </div>
              <p className="mt-4 text-2xl font-bold tabular-nums text-muted-foreground">{value}</p>
              <p className="mt-1 text-sm font-medium text-foreground">{label}</p>
              <p className="mt-1 text-xs text-muted-foreground">{sub}</p>
            </div>
          );
        })}
      </section>

      <section className="mt-8">
        <div className="mb-4 flex items-center gap-2">
          <h2 className="text-lg font-bold">الوحدات المخططة</h2>
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">
            قيد التطوير
          </span>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {PLANNED_MODULES.map(({ icon: Icon, title, desc }) => (
            <div
              key={title}
              className="flex gap-4 rounded-xl border border-dashed border-border bg-muted/30 p-5"
            >
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Icon className="h-5 w-5" aria-hidden="true" />
              </div>
              <div>
                <p className="font-semibold text-foreground">{title}</p>
                <p className="mt-1 text-sm text-muted-foreground">{desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>
    </AdminShell>
  );
}
