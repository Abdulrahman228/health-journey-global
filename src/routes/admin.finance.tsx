import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Coins, CreditCard, Loader2, ShieldAlert, Wallet, Receipt, Landmark, BadgePercent } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { AdminShell } from "@/components/admin/AdminNav";
import { adminFinanceOverview } from "@/lib/admin/finance";

export const Route = createFileRoute("/admin/finance")({
  head: () => ({
    meta: [
      { title: "المالية — لوحة الأدمن | طبانا" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: AdminFinancePage,
});

const egp = (n: number) => `${Math.round(n).toLocaleString("ar-EG")} ج.م`;

function Kpi({ icon: Icon, label, value, hint, tone = "default" }: { icon: typeof Coins; label: string; value: string; hint?: string; tone?: "default" | "primary" | "warn" }) {
  return (
    <div className={`rounded-2xl border p-4 ${tone === "primary" ? "border-primary/30 bg-primary/5" : tone === "warn" ? "border-warning/40 bg-warning-soft" : "border-border bg-card"}`}>
      <div className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
        <Icon className="h-4 w-4 text-primary" /> {label}
      </div>
      <p className="mt-2 text-2xl font-bold tabular-nums text-foreground">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function AdminFinancePage() {
  const { user, isLoading: authLoading } = useAuth();
  const { isAdmin, isLoading: roleLoading } = useIsAdmin();
  const navigate = useNavigate();
  const [months, setMonths] = useState(12);

  useEffect(() => {
    if (authLoading || roleLoading) return;
    if (!user) navigate({ to: "/login" });
  }, [authLoading, roleLoading, user, navigate]);

  const q = useQuery({
    queryKey: ["admin-finance", months],
    queryFn: () => adminFinanceOverview({ data: { months } }),
    enabled: isAdmin,
    staleTime: 60_000,
  });

  if (authLoading || roleLoading) {
    return <div className="flex min-h-[50vh] items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }
  if (!isAdmin) {
    return (
      <div className="mx-auto max-w-md p-10 text-center">
        <ShieldAlert className="mx-auto h-10 w-10 text-destructive" />
        <p className="mt-3 font-semibold">هذه الصفحة للأدمن فقط.</p>
      </div>
    );
  }

  const k = q.data?.kpis;

  return (
    <AdminShell>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground"><Landmark className="h-6 w-6 text-primary" /> المالية — نظرة عامة</h1>
          <p className="mt-1 text-sm text-muted-foreground">أرباح المنصة = عمولات الاستشارات أونلاين + اشتراكات Gold المدفوعة. كل الأرقام من نفس دفتر الأطباء.</p>
        </div>
        <label className="text-sm text-muted-foreground">
          الفترة{" "}
          <select value={months} onChange={(e) => setMonths(Number(e.target.value))} className="h-9 rounded-lg border border-input bg-background px-2 text-sm">
            {[3, 6, 12, 24].map((m) => <option key={m} value={m}>{m} شهر</option>)}
          </select>
        </label>
      </div>

      {q.isLoading ? (
        <div className="flex min-h-[30vh] items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : q.isError ? (
        <p className="mt-6 text-destructive">{(q.error as Error).message}</p>
      ) : q.data && k ? (
        <>
          <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi icon={Coins} label="أرباح المنصة" value={egp(k.platform_revenue)} hint={`عمولات ${egp(k.commission)} + اشتراكات ${egp(k.subscription_revenue)}`} tone="primary" />
            <Kpi icon={BadgePercent} label="إجمالي كشوفات أونلاين" value={egp(k.online_gross)} hint={`صافي الأطباء ${egp(k.doctor_net)}`} />
            <Kpi icon={Receipt} label="إجمالي كشوفات العيادات" value={egp(k.clinic_gross)} hint="تُدفع في العيادة — 0% عمولة" />
            <Kpi icon={CreditCard} label="Gold نشط" value={`${k.active_gold.toLocaleString("ar-EG")} مدفوع`} hint={`${k.comp_gold} ممنوح · ${k.lifetime_gold} مدى الحياة`} />
            <Kpi icon={Wallet} label="سحوبات مدفوعة" value={egp(k.payouts_paid)} />
            <Kpi icon={Wallet} label="سحوبات معلّقة" value={egp(k.payouts_pending)} hint={`${k.payouts_pending_count} طلب`} tone={k.payouts_pending_count ? "warn" : "default"} />
            <Kpi icon={Receipt} label="إيصالات اشتراك بانتظار المراجعة" value={k.receipts_pending.toLocaleString("ar-EG")} tone={k.receipts_pending ? "warn" : "default"} />
            <Kpi icon={CreditCard} label="مدفوعات بالكارت (Paymob)" value={egp(k.card_paid)} hint={`${k.card_count} عملية`} />
          </div>

          <div className="mt-6 rounded-2xl border border-border bg-card p-4">
            <h2 className="text-sm font-bold text-foreground">شهريًا</h2>
            <div className="mt-3 h-72" dir="ltr">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={q.data.months} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v: number) => egp(v)} />
                  <Legend />
                  <Bar dataKey="commission" name="عمولة" fill="var(--color-primary)" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="subscriptions" name="اشتراكات" fill="var(--color-coral)" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="doctor_net" name="صافي الأطباء (أونلاين)" fill="var(--color-teal)" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="payouts_paid" name="سحوبات مدفوعة" fill="var(--color-muted-foreground)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="mt-6 overflow-x-auto rounded-2xl border border-border bg-card">
            <div className="flex items-center justify-between px-4 py-3">
              <h2 className="text-sm font-bold text-foreground">الأطباء — تقرير العمولات</h2>
              <div className="flex gap-3 text-xs">
                <Link to="/admin/withdrawals" className="text-primary hover:underline">السحوبات</Link>
                <Link to="/admin/subscription-requests" className="text-primary hover:underline">إيصالات الاشتراك</Link>
                <Link to="/admin/data/$entity" params={{ entity: "doctor_transactions" }} search={{ id: undefined, user_id: undefined, q: undefined }} className="text-primary hover:underline">كل المعاملات</Link>
                <Link to="/admin/data/$entity" params={{ entity: "coupons" }} search={{ id: undefined, user_id: undefined, q: undefined }} className="text-primary hover:underline">الكوبونات</Link>
                <Link to="/admin/data/$entity" params={{ entity: "subscription_plans" }} search={{ id: undefined, user_id: undefined, q: undefined }} className="text-primary hover:underline">الباقات</Link>
              </div>
            </div>
            <table className="w-full min-w-[820px] text-sm">
              <thead className="bg-surface text-xs text-muted-foreground">
                <tr>
                  {["الطبيب", "الباقة", "أونلاين", "عيادة", "عمولة المنصة", "صافي الطبيب", "سحوبات مدفوعة", "معلّق", ""].map((h) => (
                    <th key={h} className="px-3 py-2 text-start font-semibold">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {q.data.doctors.length === 0 ? (
                  <tr><td colSpan={9} className="px-3 py-8 text-center text-muted-foreground">لا توجد معاملات في الفترة</td></tr>
                ) : q.data.doctors.map((d) => (
                  <tr key={d.doctor_details_id} className="hover:bg-accent/40">
                    <td className="px-3 py-2 font-medium text-foreground">{d.name || "—"}<span className="block text-xs text-muted-foreground">{d.specialty ?? ""}</span></td>
                    <td className="px-3 py-2"><span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${d.tier === "gold" ? "bg-sand text-sand-foreground" : "bg-secondary text-secondary-foreground"}`}>{d.tier}</span></td>
                    <td className="px-3 py-2 tabular-nums">{egp(d.online_gross)}</td>
                    <td className="px-3 py-2 tabular-nums">{egp(d.clinic_gross)}</td>
                    <td className="px-3 py-2 tabular-nums font-semibold text-primary">{egp(d.commission)}</td>
                    <td className="px-3 py-2 tabular-nums">{egp(d.doctor_net)}</td>
                    <td className="px-3 py-2 tabular-nums">{egp(d.payouts_paid)}</td>
                    <td className="px-3 py-2 tabular-nums">{d.payouts_pending ? egp(d.payouts_pending) : "—"}</td>
                    <td className="px-3 py-2">
                      <Link to="/admin/data/$entity" params={{ entity: "doctor_details" }} search={{ id: d.doctor_details_id, user_id: undefined, q: undefined }} className="text-xs text-primary hover:underline">فتح</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}
    </AdminShell>
  );
}
