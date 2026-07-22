import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useAuth } from "@/hooks/useAuth";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { supabase } from "@/integrations/supabase/client";
import { AdminShell } from "@/components/admin/AdminNav";
import {
  Activity,
  CalendarDays,
  CheckCircle2,
  CreditCard,
  Loader2,
  ShieldAlert,
  ShieldCheck,
  Stethoscope,
  UserRound,
  Users,
} from "lucide-react";

export const Route = createFileRoute("/admin/")({
  head: () => ({
    meta: [
      { title: "Super Admin Dashboard — Tabibi" },
      { name: "description", content: "Central platform administration dashboard for Tabibi." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: AdminHomePage,
});

type Stats = {
  doctors: number;
  patients: number;
  todayAppointments: number;
  activeSubscriptions: number;
  pendingDoctors: number;
  activeRevenueEgp: number;
};

type GrowthPoint = {
  label: string;
  doctors: number;
  patients: number;
};

type RecentDoctor = {
  id: string;
  profile_id: string;
  specialty: string | null;
  is_verified: boolean | null;
  verification_status: string | null;
  updated_at: string;
  profile?: { full_name: string | null; city: string | null } | null;
};

const emptyStats: Stats = {
  doctors: 0,
  patients: 0,
  todayAppointments: 0,
  activeSubscriptions: 0,
  pendingDoctors: 0,
  activeRevenueEgp: 0,
};

function AdminHomePage() {
  const { user, profile, isLoading: authLoading } = useAuth();
  const { isAdmin, isLoading: roleLoading } = useIsAdmin();
  const navigate = useNavigate();
  const [stats, setStats] = useState<Stats>(emptyStats);
  const [growth, setGrowth] = useState<GrowthPoint[]>([]);
  const [recentDoctors, setRecentDoctors] = useState<RecentDoctor[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading || roleLoading) return;
    if (!user) navigate({ to: "/login" });
  }, [authLoading, roleLoading, user, navigate]);

  useEffect(() => {
    if (!isAdmin) return;
    let cancelled = false;

    async function loadDashboard() {
      setLoading(true);
      const now = new Date();
      const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const todayEnd = new Date(todayStart.getTime() + 86_400_000);
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const head = { count: "exact" as const, head: true };

      const [
        doctors,
        patients,
        todayAppointments,
        activeSubscriptions,
        pendingDoctors,
        activeSubscriptionRows,
        planRows,
        profileRows,
        doctorRows,
        recentRows,
      ] = await Promise.all([
        supabase.from("doctor_details").select("id", head),
        supabase.from("user_roles").select("id", head).eq("role", "patient"),
        supabase
          .from("appointments")
          .select("id", head)
          .gte("scheduled_at", todayStart.toISOString())
          .lt("scheduled_at", todayEnd.toISOString()),
        supabase.from("subscriptions").select("id", head).in("status", ["active", "trialing"]),
        supabase
          .from("doctor_details")
          .select("id", head)
          .or("is_verified.is.false,verification_status.eq.pending"),
        supabase
          .from("subscriptions")
          .select("plan_code,status")
          .in("status", ["active", "trialing"]),
        supabase.from("subscription_plans").select("code, price_cents, currency"),
        supabase
          .from("profiles")
          .select("id, created_at")
          .gte("created_at", monthStart.toISOString()),
        supabase.from("doctor_details").select("id, profile_id, created_at"),
        supabase
          .from("doctor_details")
          .select("id, profile_id, specialty, is_verified, verification_status, updated_at")
          .order("updated_at", { ascending: false })
          .limit(6),
      ]);

      const recentProfileIds = (recentRows.data ?? []).map((row) => row.profile_id);
      const { data: recentProfiles } = recentProfileIds.length
        ? await supabase.from("profiles").select("id, full_name, city").in("id", recentProfileIds)
        : { data: [] };

      if (cancelled) return;

      const planByCode = new Map(
        (planRows.data ?? []).map((plan) => [
          plan.code,
          { priceCents: Number(plan.price_cents ?? 0), currency: plan.currency ?? "EGP" },
        ]),
      );
      const activeRevenueEgp = (activeSubscriptionRows.data ?? []).reduce((sum, row) => {
        const plan = row.plan_code ? planByCode.get(row.plan_code) : null;
        return sum + (plan?.currency === "EGP" ? plan.priceCents / 100 : 0);
      }, 0);

      const doctorProfileIds = new Set((doctorRows.data ?? []).map((row) => row.profile_id));
      const dailyGrowth = buildGrowthSeries(
        monthStart,
        now,
        (profileRows.data ?? []).map((row) => ({
          id: row.id,
          created_at: row.created_at,
          isDoctor: doctorProfileIds.has(row.id),
        })),
      );

      const profileById = new Map((recentProfiles ?? []).map((p) => [p.id, p]));

      setStats({
        doctors: doctors.count ?? 0,
        patients: patients.count ?? 0,
        todayAppointments: todayAppointments.count ?? 0,
        activeSubscriptions: activeSubscriptions.count ?? 0,
        pendingDoctors: pendingDoctors.count ?? 0,
        activeRevenueEgp,
      });
      setGrowth(dailyGrowth);
      setRecentDoctors(
        ((recentRows.data ?? []) as RecentDoctor[]).map((doctor) => ({
          ...doctor,
          profile: profileById.get(doctor.profile_id) ?? null,
        })),
      );
      setLoading(false);
    }

    void loadDashboard();
    return () => {
      cancelled = true;
    };
  }, [isAdmin]);

  const greeting = useMemo(() => {
    const name = profile?.full_name?.trim();
    return name ? `أهلاً ${name}` : "أهلاً بمالك النظام";
  }, [profile]);

  if (authLoading || roleLoading || (isAdmin && loading)) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" aria-hidden="true" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="mx-auto max-w-md px-4 py-24 text-center" dir="rtl">
        <ShieldAlert className="mx-auto h-12 w-12 text-destructive" aria-hidden="true" />
        <h1 className="mt-3 text-xl font-bold">صلاحيات غير كافية</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          هذه الصفحة مخصصة لمشرفي المنصة فقط.
        </p>
      </div>
    );
  }

  return (
    <AdminShell>
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
            <Activity className="h-3.5 w-3.5" aria-hidden="true" />
            مركز قيادة المنصة
          </div>
          <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">{greeting}</h1>
          <p className="mt-2 text-sm text-muted-foreground sm:text-base">
            متابعة التشغيل، التوثيق، الاشتراكات، ونمو المستخدمين من شاشة واحدة.
          </p>
        </div>
        <Link
          to="/admin/doctors"
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
        >
          <ShieldCheck className="h-4 w-4" aria-hidden="true" />
          مراجعة الأطباء
        </Link>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="إحصائيات المنصة">
        <StatCard icon={Stethoscope} label="إجمالي الأطباء" value={stats.doctors} helper={`${stats.pendingDoctors} بانتظار الاعتماد`} tone="primary" />
        <StatCard icon={UserRound} label="إجمالي المرضى" value={stats.patients} helper="حسب user_roles" tone="blue" />
        <StatCard icon={CalendarDays} label="حجوزات اليوم" value={stats.todayAppointments} helper="من جدول appointments" tone="emerald" />
        <StatCard icon={CreditCard} label="اشتراكات نشطة" value={stats.activeSubscriptions} helper={`${Math.round(stats.activeRevenueEgp).toLocaleString("ar-EG")} ج.م شهرياً`} tone="amber" />
      </section>

      <section className="mt-6 grid gap-5 xl:grid-cols-[minmax(0,1.6fr)_minmax(22rem,1fr)]">
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold">نمو المستخدمين هذا الشهر</h2>
              <p className="text-sm text-muted-foreground">تراكم المرضى والأطباء يومياً</p>
            </div>
            <Users className="h-5 w-5 text-primary" aria-hidden="true" />
          </div>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={growth} margin={{ left: 4, right: 8, top: 8, bottom: 0 }}>
                <defs>
                  <linearGradient id="patientsGrowth" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0.02} />
                  </linearGradient>
                  <linearGradient id="doctorsGrowth" x1="0" x2="0" y1="0" y2="1">
                    <stop offset="0%" stopColor="#10b981" stopOpacity={0.32} />
                    <stop offset="100%" stopColor="#10b981" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 12 }} />
                <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 12 }} allowDecimals={false} />
                <Tooltip />
                <Area type="monotone" dataKey="patients" name="المرضى" stroke="hsl(var(--primary))" fill="url(#patientsGrowth)" strokeWidth={2} />
                <Area type="monotone" dataKey="doctors" name="الأطباء" stroke="#10b981" fill="url(#doctorsGrowth)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold">آخر تحديثات الأطباء</h2>
              <p className="text-sm text-muted-foreground">مراجعة سريعة لحالة التوثيق</p>
            </div>
            <CheckCircle2 className="h-5 w-5 text-emerald-600" aria-hidden="true" />
          </div>
          <div className="space-y-3">
            {recentDoctors.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border py-8 text-center text-sm text-muted-foreground">
                لا توجد بيانات أطباء بعد.
              </p>
            ) : (
              recentDoctors.map((doctor) => (
                <Link
                  key={doctor.id}
                  to="/admin/doctors"
                  className="flex items-center justify-between gap-3 rounded-lg border border-border p-3 hover:bg-muted/50"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">
                      {doctor.profile?.full_name ?? "طبيب بدون اسم"}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {doctor.specialty ?? "تخصص غير محدد"}
                      {doctor.profile?.city ? ` · ${doctor.profile.city}` : ""}
                    </p>
                  </div>
                  <StatusBadge verified={!!doctor.is_verified} status={doctor.verification_status} />
                </Link>
              ))
            )}
          </div>
        </div>
      </section>
    </AdminShell>
  );
}

function buildGrowthSeries(
  monthStart: Date,
  now: Date,
  rows: Array<{ id: string; created_at: string; isDoctor: boolean }>,
): GrowthPoint[] {
  const result: GrowthPoint[] = [];
  const days = now.getDate();
  let doctors = 0;
  let patients = 0;

  for (let day = 1; day <= days; day += 1) {
    const cursorStart = new Date(monthStart.getFullYear(), monthStart.getMonth(), day);
    const cursorEnd = new Date(monthStart.getFullYear(), monthStart.getMonth(), day + 1);
    for (const row of rows) {
      const createdAt = new Date(row.created_at);
      if (createdAt >= cursorStart && createdAt < cursorEnd) {
        if (row.isDoctor) doctors += 1;
        else patients += 1;
      }
    }
    result.push({ label: day.toString(), doctors, patients });
  }

  return result;
}

function StatCard({
  icon: Icon,
  label,
  value,
  helper,
  tone,
}: {
  icon: typeof Users;
  label: string;
  value: number;
  helper: string;
  tone: "primary" | "blue" | "emerald" | "amber";
}) {
  const toneClass = {
    primary: "bg-primary/10 text-primary",
    blue: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
    emerald: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    amber: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  }[tone];
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${toneClass}`}>
          <Icon className="h-5 w-5" aria-hidden="true" />
        </div>
      </div>
      <p className="mt-4 text-2xl font-bold tabular-nums">{value.toLocaleString("ar-EG")}</p>
      <p className="mt-1 text-sm font-medium text-foreground">{label}</p>
      <p className="mt-1 text-xs text-muted-foreground">{helper}</p>
    </div>
  );
}

function StatusBadge({ verified, status }: { verified: boolean; status: string | null }) {
  if (verified || status === "approved" || status === "verified") {
    return (
      <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
        معتمد
      </span>
    );
  }
  return (
    <span className="rounded-full bg-amber-500/10 px-2 py-0.5 text-xs font-semibold text-amber-700 dark:text-amber-400">
      مراجعة
    </span>
  );
}
