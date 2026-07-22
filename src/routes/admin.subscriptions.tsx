import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AdminShell } from "@/components/admin/AdminNav";
import { useAuth } from "@/hooks/useAuth";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { supabase } from "@/integrations/supabase/client";
import { CreditCard, Loader2, Search, ShieldAlert, TrendingUp } from "lucide-react";

export const Route = createFileRoute("/admin/subscriptions")({
  head: () => ({
    meta: [
      { title: "إدارة الاشتراكات — Super Admin | طبيبي" },
      { name: "description", content: "متابعة اشتراكات الأطباء والمدفوعات المتكررة في طبيبي." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: AdminSubscriptionsPage,
});

type SubscriptionRow = {
  id: string;
  user_id: string;
  plan_code: string | null;
  status: string;
  current_period_start: string | null;
  current_period_end: string | null;
  created_at: string;
  environment: string;
  profile?: { full_name: string | null; city: string | null } | null;
  plan?: { name_ar: string; price_cents: number; currency: string } | null;
};

function AdminSubscriptionsPage() {
  const { user, isLoading: authLoading } = useAuth();
  const { isAdmin, isLoading: roleLoading } = useIsAdmin();
  const navigate = useNavigate();
  const [rows, setRows] = useState<SubscriptionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const { data: subscriptions } = await supabase
      .from("subscriptions")
      .select("id, user_id, plan_code, status, current_period_start, current_period_end, created_at, environment")
      .order("created_at", { ascending: false })
      .limit(200);

    const userIds = Array.from(new Set((subscriptions ?? []).map((row) => row.user_id)));
    const planCodes = Array.from(new Set((subscriptions ?? []).map((row) => row.plan_code).filter(Boolean))) as string[];

    const [{ data: profiles }, { data: plans }] = await Promise.all([
      userIds.length
        ? supabase.from("profiles").select("user_id, full_name, city").in("user_id", userIds)
        : Promise.resolve({ data: [] }),
      planCodes.length
        ? supabase.from("subscription_plans").select("code, name_ar, price_cents, currency").in("code", planCodes)
        : Promise.resolve({ data: [] }),
    ]);

    const profileByUserId = new Map((profiles ?? []).map((profile) => [profile.user_id, profile]));
    const planByCode = new Map((plans ?? []).map((plan) => [plan.code, plan]));

    setRows(
      ((subscriptions ?? []) as SubscriptionRow[]).map((row) => ({
        ...row,
        profile: profileByUserId.get(row.user_id) ?? null,
        plan: row.plan_code ? planByCode.get(row.plan_code) ?? null : null,
      })),
    );
    setLoading(false);
  }, []);

  useEffect(() => {
    if (authLoading || roleLoading) return;
    if (!user) {
      navigate({ to: "/login" });
      return;
    }
    if (isAdmin) void load();
  }, [authLoading, roleLoading, user, isAdmin, navigate, load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) =>
      [row.profile?.full_name, row.profile?.city, row.plan_code, row.status, row.environment, row.user_id]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [rows, search]);

  const activeRows = rows.filter((row) => row.status === "active" || row.status === "trialing");
  const monthlyRevenue = activeRows.reduce((sum, row) => {
    if (!row.plan || row.plan.currency !== "EGP") return sum;
    return sum + row.plan.price_cents / 100;
  }, 0);

  if (authLoading || roleLoading || loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="mx-auto max-w-md px-4 py-24 text-center" dir="rtl">
        <ShieldAlert className="mx-auto h-12 w-12 text-destructive" />
        <h1 className="mt-3 text-xl font-bold">صلاحيات غير كافية</h1>
      </div>
    );
  }

  return (
    <AdminShell>
      <header className="mb-6">
        <h1 className="text-3xl font-bold">إدارة الاشتراكات</h1>
        <p className="mt-1 text-sm text-muted-foreground">متابعة خطط الأطباء، الحالات، والإيراد المتكرر.</p>
      </header>

      <div className="mb-5 grid gap-3 sm:grid-cols-2">
        <SummaryCard icon={CreditCard} label="اشتراكات نشطة" value={activeRows.length.toLocaleString("ar-EG")} />
        <SummaryCard icon={TrendingUp} label="إيراد شهري نشط" value={`${Math.round(monthlyRevenue).toLocaleString("ar-EG")} ج.م`} />
      </div>

      <div className="mb-5 relative">
        <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="بحث باسم الطبيب أو الخطة أو الحالة..."
          className="w-full rounded-lg border border-border bg-card py-2 ps-10 pe-3 text-sm outline-none focus:border-primary"
        />
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-muted/40 text-xs font-semibold text-muted-foreground">
            <tr>
              <th className="px-4 py-3 text-start">المستخدم</th>
              <th className="px-4 py-3 text-start">الخطة</th>
              <th className="px-4 py-3 text-start">الحالة</th>
              <th className="px-4 py-3 text-start">القيمة</th>
              <th className="px-4 py-3 text-start">بداية الفترة</th>
              <th className="px-4 py-3 text-start">نهاية الفترة</th>
              <th className="px-4 py-3 text-start">البيئة</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-16 text-center text-sm text-muted-foreground">
                  {search ? "لا توجد نتائج تطابق بحثك." : "لا توجد اشتراكات بعد."}
                </td>
              </tr>
            ) : filtered.map((row) => (
              <tr key={row.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                <td className="px-4 py-3">
                  <div className="font-semibold">{row.profile?.full_name ?? "مستخدم بدون ملف"}</div>
                  <div className="font-mono text-xs text-muted-foreground">{row.user_id.slice(0, 8)}...</div>
                </td>
                <td className="px-4 py-3">{row.plan?.name_ar ?? row.plan_code ?? "—"}</td>
                <td className="px-4 py-3">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${statusClass(row.status)}`}>
                    {row.status}
                  </span>
                </td>
                <td className="px-4 py-3">
                  {row.plan ? `${(row.plan.price_cents / 100).toLocaleString("ar-EG")} ${row.plan.currency}` : "—"}
                </td>
                <td className="px-4 py-3">{formatDate(row.current_period_start)}</td>
                <td className="px-4 py-3">{formatDate(row.current_period_end)}</td>
                <td className="px-4 py-3">{row.environment}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </AdminShell>
  );
}

function SummaryCard({ icon: Icon, label, value }: { icon: typeof CreditCard; label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <p className="text-2xl font-bold">{value}</p>
          <p className="text-sm text-muted-foreground">{label}</p>
        </div>
      </div>
    </div>
  );
}

function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleDateString("ar-EG") : "—";
}

function statusClass(status: string) {
  if (status === "active" || status === "trialing") return "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400";
  if (status === "past_due" || status === "unpaid") return "bg-amber-500/10 text-amber-700 dark:text-amber-400";
  return "bg-muted text-muted-foreground";
}
