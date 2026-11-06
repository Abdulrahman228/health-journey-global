/**
 * /admin/onboarding — doctor onboarding & growth funnel (admin only).
 * Seeded directory → claimed, doctors → verified → new, + attributed referrals.
 */
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { hasAdminRole, homePathForRoles, useAuth } from "@/hooks/useAuth";
import { adminOnboardingFunnel, type OnboardingFunnel } from "@/lib/admin/onboarding";
import {
  Loader2,
  Users,
  BadgeCheck,
  UserPlus,
  Share2,
  FolderInput,
  CheckCircle2,
  Ban,
  RefreshCw,
} from "lucide-react";

export const Route = createFileRoute("/admin/onboarding")({
  head: () => ({
    meta: [
      { title: "قُمع التسجيل — أدمن طبانا" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: OnboardingFunnelPage,
});

function OnboardingFunnelPage() {
  const { user, roles, isLoading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState<OnboardingFunnel | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      navigate({ to: "/login" });
      return;
    }
    // Decide from ALL roles: a doctor+admin's primary role is "doctor".
    if (roles.length > 0 && !hasAdminRole(roles)) {
      navigate({ to: homePathForRoles(roles) });
      return;
    }
    setLoading(true);
    setLoadError(null);
    adminOnboardingFunnel()
      .then((d) => setData(d))
      .catch((e: unknown) => {
        setData(null);
        setLoadError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => setLoading(false));
  }, [authLoading, user, roles, navigate, refreshKey]);

  const claimRate =
    data && data.seededTotal > 0
      ? Math.round((data.seededClaimed / data.seededTotal) * 100)
      : 0;
  const verifyRate =
    data && data.totalDoctors > 0
      ? Math.round((data.verifiedDoctors / data.totalDoctors) * 100)
      : 0;

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <header className="mb-8 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-foreground">قُمع التسجيل</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            نظرة على نمو الأطباء: الدليل المبذور، التسجيل، التوثيق، والإحالات.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setRefreshKey((k) => k + 1)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium text-foreground transition hover:bg-accent"
        >
          <RefreshCw className="h-4 w-4" /> تحديث
        </button>
      </header>

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : !data ? (
        <p className="rounded-xl border border-dashed border-border bg-card p-8 text-center text-sm text-muted-foreground">
          تعذّر تحميل البيانات.
          {loadError && <span className="mt-1 block text-xs">{loadError}</span>}
        </p>
      ) : (
        <div className="space-y-8">
          {/* Top metrics */}
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <StatCard icon={<Users className="h-5 w-5" />} label="إجمالي الأطباء" value={data.totalDoctors} />
            <StatCard icon={<BadgeCheck className="h-5 w-5" />} label="موثّقون" value={data.verifiedDoctors} hint={`${verifyRate}%`} />
            <StatCard icon={<UserPlus className="h-5 w-5" />} label="جدد (٣٠ يوم)" value={data.newDoctors30} />
            <StatCard icon={<Share2 className="h-5 w-5" />} label="إحالات مُنسَبة" value={data.totalReferrals} />
          </div>

          {/* Seeded directory funnel */}
          <section className="rounded-2xl border border-border bg-card p-6">
            <h2 className="mb-4 text-lg font-semibold text-foreground">الدليل المبذور (Seed → Claim)</h2>
            <div className="grid gap-3 sm:grid-cols-3">
              <FunnelStage icon={<FolderInput className="h-5 w-5" />} label="مبذورة" value={data.seededTotal} tone="neutral" />
              <FunnelStage icon={<CheckCircle2 className="h-5 w-5" />} label={`مُطالَب بها (${claimRate}%)`} value={data.seededClaimed} tone="good" />
              <FunnelStage icon={<Ban className="h-5 w-5" />} label="رافضون" value={data.seededOptedOut} tone="bad" />
            </div>
            <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
              تُبذَر الملفات من مصادر مشروعة (نقابة بإذن / معلومة مهنية عامة) والطبيب يطالب بها أو
              يرفضها — لا حصاد من خرائط جوجل.
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Link
                to="/admin/seed-directory"
                className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
              >
                إدارة الدليل
              </Link>
              <Link
                to="/admin/doctors"
                className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-medium text-foreground hover:bg-accent"
              >
                الأطباء
              </Link>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  hint,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  hint?: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-2 text-muted-foreground">
        {icon}
        <span className="text-xs">{label}</span>
      </div>
      <div className="mt-2 flex items-baseline gap-2">
        <span className="text-2xl font-bold text-foreground">{value.toLocaleString("ar-EG")}</span>
        {hint ? <span className="text-xs text-muted-foreground">{hint}</span> : null}
      </div>
    </div>
  );
}

function FunnelStage({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  tone: "neutral" | "good" | "bad";
}) {
  const toneClass =
    tone === "good"
      ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700"
      : tone === "bad"
        ? "border-red-500/30 bg-red-500/10 text-red-700"
        : "border-border bg-muted/40 text-foreground";
  return (
    <div className={`rounded-xl border p-4 ${toneClass}`}>
      <div className="flex items-center gap-2 text-sm">
        {icon}
        <span>{label}</span>
      </div>
      <div className="mt-2 text-2xl font-bold">{value.toLocaleString("ar-EG")}</div>
    </div>
  );
}
