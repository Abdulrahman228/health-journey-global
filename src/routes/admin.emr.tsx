import { createFileRoute } from "@tanstack/react-router";
import { useAdminGuard } from "@/hooks/useAdminGuard";
import { AdminShell } from "@/components/admin/AdminNav";
import {
  Archive,
  Loader2,
  FileText,
  Search,
  Lock,
  RefreshCw,
  Users,
  ClipboardList,
  GitMerge,
} from "lucide-react";

export const Route = createFileRoute("/admin/emr")({
  head: () => ({
    meta: [
      { title: "السجل الطبي المركزي — لوحة الأدمن" },
      { name: "description", content: "أرشيف السجلات الطبية الإلكترونية المركزية للمستشفى." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: AdminEmrPage,
});

type EmrStatCard = {
  icon: typeof Archive;
  label: string;
  value: string;
  sub: string;
  tone: "primary" | "blue" | "emerald" | "amber";
};

const EMR_STATS: EmrStatCard[] = [
  { icon: FileText, label: "إجمالي السجلات", value: "—", sub: "ملفات المرضى المؤرشفة", tone: "primary" },
  { icon: Users, label: "مرضى موثَّقون", value: "—", sub: "لديهم سجل إلكتروني مكتمل", tone: "blue" },
  { icon: RefreshCw, label: "تحديثات الأسبوع", value: "—", sub: "سجلات مُعدَّلة هذا الأسبوع", tone: "emerald" },
  { icon: Lock, label: "سجلات مُؤمَّنة", value: "—", sub: "محمية بصلاحيات الطبيب", tone: "amber" },
];

const PLANNED_MODULES = [
  {
    icon: Search,
    title: "البحث المتقدم في الأرشيف",
    desc: "البحث عبر ملايين السجلات بالاسم، الرقم القومي، التشخيص، أو الدواء.",
  },
  {
    icon: ClipboardList,
    title: "ملف المريض الموحَّد",
    desc: "عرض كامل لتاريخ المريض عبر جميع الأقسام والزيارات في صفحة واحدة.",
  },
  {
    icon: GitMerge,
    title: "دمج السجلات المكررة",
    desc: "اكتشاف وتوحيد الملفات المكررة لنفس المريض من مصادر مختلفة.",
  },
  {
    icon: Lock,
    title: "إدارة الصلاحيات والتدقيق",
    desc: "سجل كامل لكل عملية وصول أو تعديل مع تحديد الهوية والوقت.",
  },
];

function AdminEmrPage() {
  const { isLoading, isAdmin } = useAdminGuard();

  if (isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" aria-hidden="true" />
      </div>
    );
  }

  if (!isAdmin) return null;

  return (
    <AdminShell>
      <header className="mb-6">
        <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
          <Archive className="h-3.5 w-3.5" aria-hidden="true" />
          وحدة المستشفى · HIS
        </div>
        <h1 className="text-3xl font-bold tracking-tight">السجل الطبي الإلكتروني المركزي</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          أرشيف موحَّد لجميع السجلات الطبية عبر الأقسام، مع بحث متقدم وضبط دقيق للصلاحيات.
        </p>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="إحصائيات السجل الطبي">
        {EMR_STATS.map(({ icon: Icon, label, value, sub, tone }) => {
          const toneClass = {
            primary: "bg-primary/10 text-primary",
            blue: "bg-blue-500/10 text-blue-600",
            emerald: "bg-emerald-500/10 text-emerald-600",
            amber: "bg-amber-500/10 text-amber-600",
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
