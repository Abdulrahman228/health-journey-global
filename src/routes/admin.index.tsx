/**
 * /admin — Admin landing page.
 *
 * Central dashboard that surfaces all 5 admin sections as clickable cards
 * with live pending-item counts pulled in parallel from Supabase.
 *
 * Private (noindex, nofollow). Guarded client-side via useIsAdmin.
 */
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { supabase } from "@/integrations/supabase/client";
import { AdminNav } from "@/components/admin/AdminNav";
import {
  ShieldCheck,
  Users,
  Wallet,
  Star,
  FileText,
  ArrowLeft,
  Loader2,
  ShieldAlert,
  LayoutDashboard,
} from "lucide-react";

export const Route = createFileRoute("/admin/")({
  head: () => ({
    meta: [
      { title: "لوحة الأدمن — طبيبي" },
      { name: "description", content: "لوحة تحكم المشرف في منصة طبيبي." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: AdminHomePage,
});

interface SectionDef {
  to: string;
  title: string;
  description: string;
  icon: typeof ShieldCheck;
  accent: string;
  iconBg: string;
  iconColor: string;
  countLabel: string;
  countKey: keyof Counts;
}

interface Counts {
  verifications: number | null;
  withdrawals: number | null;
  reviews: number | null;
  articles: number | null;
  doctors: number | null;
}

const SECTIONS: SectionDef[] = [
  {
    to: "/admin/verifications",
    title: "توثيق الأطباء",
    description: "مراجعة طلبات توثيق الأطباء واعتمادهم.",
    icon: ShieldCheck,
    accent: "border-sky-500/40 hover:border-sky-500",
    iconBg: "bg-sky-500/10",
    iconColor: "text-sky-600 dark:text-sky-400",
    countLabel: "قيد المراجعة",
    countKey: "verifications",
  },
  {
    to: "/admin/doctors",
    title: "إدارة الأطباء",
    description: "تحرير ملفات الأطباء وإدارة بياناتهم.",
    icon: Users,
    accent: "border-violet-500/40 hover:border-violet-500",
    iconBg: "bg-violet-500/10",
    iconColor: "text-violet-600 dark:text-violet-400",
    countLabel: "إجمالي الأطباء",
    countKey: "doctors",
  },
  {
    to: "/admin/withdrawals",
    title: "طلبات السحب",
    description: "اعتماد طلبات سحب أرباح الأطباء.",
    icon: Wallet,
    accent: "border-emerald-500/40 hover:border-emerald-500",
    iconBg: "bg-emerald-500/10",
    iconColor: "text-emerald-600 dark:text-emerald-400",
    countLabel: "طلبات جديدة",
    countKey: "withdrawals",
  },
  {
    to: "/admin/reviews",
    title: "إدارة التقييمات",
    description: "مراجعة تقييمات المرضى قبل النشر.",
    icon: Star,
    accent: "border-amber-500/40 hover:border-amber-500",
    iconBg: "bg-amber-500/10",
    iconColor: "text-amber-600 dark:text-amber-400",
    countLabel: "بانتظار الموافقة",
    countKey: "reviews",
  },
  {
    to: "/admin/articles",
    title: "إدارة المقالات",
    description: "كتابة ونشر مقالات SEO لجلب الزيارات.",
    icon: FileText,
    accent: "border-teal-500/40 hover:border-teal-500",
    iconBg: "bg-teal-500/10",
    iconColor: "text-teal-600 dark:text-teal-400",
    countLabel: "مقال منشور",
    countKey: "articles",
  },
];

function AdminHomePage() {
  const { user, profile, isLoading: authLoading } = useAuth();
  const { isAdmin, isLoading: roleLoading } = useIsAdmin();
  const navigate = useNavigate();
  const [counts, setCounts] = useState<Counts>({
    verifications: null,
    withdrawals: null,
    reviews: null,
    articles: null,
    doctors: null,
  });

  useEffect(() => {
    if (authLoading || roleLoading) return;
    if (!user) {
      navigate({ to: "/login" });
      return;
    }
  }, [authLoading, roleLoading, user, navigate]);

  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;

    async function loadCounts() {
      const head = { count: "exact" as const, head: true };
      const [verif, withdraw, rev, art, docs] = await Promise.all([
        supabase
          .from("doctor_details")
          .select("id", head)
          .eq("verification_status", "pending"),
        supabase
          .from("doctor_withdrawals")
          .select("id", head)
          .eq("status", "requested"),
        supabase.from("reviews").select("id", head).eq("status", "pending"),
        supabase.from("articles").select("id", head).eq("is_published", true),
        supabase.from("doctor_details").select("id", head),
      ]);

      if (cancelled) return;
      setCounts({
        verifications: verif.count ?? 0,
        withdrawals: withdraw.count ?? 0,
        reviews: rev.count ?? 0,
        articles: art.count ?? 0,
        doctors: docs.count ?? 0,
      });
    }

    void loadCounts();
    return () => {
      cancelled = true;
    };
  }, [isAdmin]);

  const greeting = useMemo(() => {
    const name = profile?.full_name?.trim();
    return name ? `أهلاً ${name}` : "أهلاً بك";
  }, [profile]);

  if (authLoading || roleLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" aria-hidden="true" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="mx-auto max-w-md px-4 py-24 text-center" dir="rtl">
        <ShieldAlert
          className="mx-auto h-12 w-12 text-destructive"
          aria-hidden="true"
        />
        <h1 className="mt-3 text-xl font-bold">صلاحيات غير كافية</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          هذه الصفحة مخصصة لمشرفي المنصة فقط.
        </p>
      </div>
    );
  }

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:py-12" dir="rtl">
      <AdminNav />

      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="mb-1 inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
            <LayoutDashboard className="h-3.5 w-3.5" aria-hidden="true" />
            لوحة المشرف
          </div>
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
            {greeting}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground sm:text-base">
            من هنا تدير كل أقسام المنصة من مكان واحد.
          </p>
        </div>
      </header>

      <section
        aria-label="أقسام لوحة الأدمن"
        className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3"
      >
        {SECTIONS.map((s) => {
          const Icon = s.icon;
          const count = counts[s.countKey];
          return (
            <Link
              key={s.to}
              to={s.to}
              aria-label={`${s.title}: ${s.description}`}
              className={
                "group relative flex min-h-[180px] flex-col justify-between rounded-2xl border-2 bg-card p-5 transition-all duration-200 " +
                "hover:-translate-y-0.5 hover:shadow-lg focus-visible:-translate-y-0.5 focus-visible:shadow-lg " +
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 " +
                s.accent
              }
            >
              <div className="flex items-start justify-between gap-3">
                <div
                  className={`flex h-12 w-12 items-center justify-center rounded-xl ${s.iconBg}`}
                  aria-hidden="true"
                >
                  <Icon className={`h-6 w-6 ${s.iconColor}`} />
                </div>
                <ArrowLeft
                  className="h-5 w-5 text-muted-foreground transition-transform group-hover:-translate-x-1 group-hover:text-foreground"
                  aria-hidden="true"
                />
              </div>

              <div className="mt-4">
                <h2 className="text-lg font-bold text-foreground">{s.title}</h2>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                  {s.description}
                </p>
              </div>

              <div className="mt-4 flex items-baseline gap-2 border-t border-border pt-3">
                <span
                  className="text-2xl font-bold tabular-nums text-foreground"
                  aria-live="polite"
                >
                  {count === null ? (
                    <span
                      className="inline-block h-6 w-10 animate-pulse rounded bg-muted"
                      aria-label="جاري التحميل"
                    />
                  ) : (
                    count.toLocaleString("ar-EG")
                  )}
                </span>
                <span className="text-xs text-muted-foreground">
                  {s.countLabel}
                </span>
              </div>
            </Link>
          );
        })}
      </section>
    </main>
  );
}
