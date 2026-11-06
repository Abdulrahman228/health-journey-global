import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
} from "recharts";
import { Loader2, TrendingUp, CalendarCheck, Coins, Wallet } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

interface SeriesRow {
  ym: string;
  bookings: number;
  net_income: number;
  expenses: number;
  profit: number;
  /** Arabic month label for the chart X axis. */
  label: string;
}

const AR_MONTHS = ["ين", "فبر", "مار", "أبر", "ماي", "يون", "يول", "أغس", "سبت", "أكت", "نوف", "ديس"];
function monthLabel(ym: string): string {
  const [, m] = ym.split("-");
  const idx = Number(m) - 1;
  return AR_MONTHS[idx] ?? ym;
}
const money = (n: number) => n.toLocaleString("ar-EG", { maximumFractionDigits: 0 });

/**
 * Professional revenue analytics from the unified ledger (doctor_revenue_series):
 * 12-month income/profit trend + bookings-per-month, with headline KPIs. Always
 * consistent with the financial report (same ledger source).
 */
export function RevenueAnalytics() {
  const { profile, isLoading: authLoading } = useAuth();
  const [rows, setRows] = useState<SeriesRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!profile?.id) {
      if (!authLoading) setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const { data: dd, error: ddErr } = await supabase
        .from("doctor_details")
        .select("id")
        .eq("profile_id", profile.id)
        .maybeSingle();
      if (ddErr) throw ddErr;
      if (!dd) {
        setRows([]);
        return;
      }
      const { data, error: rpcErr } = await supabase.rpc("doctor_revenue_series", {
        _doctor_details_id: dd.id,
        _months: 12,
      });
      if (rpcErr) throw rpcErr;
      setRows(
        (data ?? []).map((r) => ({
          ym: r.ym,
          net_income: Number(r.net_income),
          expenses: Number(r.expenses),
          profit: Number(r.profit),
          bookings: Number(r.bookings),
          label: monthLabel(r.ym),
        })),
      );
    } catch (e) {
      setRows([]);
      setError(
        "تعذّر تحميل تحليلات الإيرادات" +
          (e && typeof e === "object" && "message" in e ? ` — ${String(e.message)}` : ""),
      );
    } finally {
      setLoading(false);
    }
  }, [profile?.id, authLoading]);

  useEffect(() => {
    void load();
  }, [load]);

  const kpis = useMemo(() => {
    const income = rows.reduce((s, r) => s + r.net_income, 0);
    const bookings = rows.reduce((s, r) => s + r.bookings, 0);
    const profit = rows.reduce((s, r) => s + r.profit, 0);
    const thisMonth = rows[rows.length - 1];
    return {
      income,
      bookings,
      profit,
      avg: bookings > 0 ? income / bookings : 0,
      thisMonthProfit: thisMonth?.profit ?? 0,
    };
  }, [rows]);

  if (loading) {
    return (
      <div className="rounded-2xl border border-border bg-card p-6">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
      </div>
    );
  }

  const chartData = rows;

  if (error) {
    return (
      <p role="alert" className="rounded-2xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
        {error}
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi icon={<Coins className="h-4 w-4" />} label="إجمالي الدخل (12 شهر)" value={`${money(kpis.income)} ج.م`} accent="emerald" />
        <Kpi icon={<CalendarCheck className="h-4 w-4" />} label="إجمالي الحجوزات" value={money(kpis.bookings)} accent="indigo" />
        <Kpi icon={<Wallet className="h-4 w-4" />} label="متوسط الدخل / حجز" value={`${money(kpis.avg)} ج.م`} accent="teal" />
        <Kpi icon={<TrendingUp className="h-4 w-4" />} label="صافي ربح الشهر" value={`${money(kpis.thisMonthProfit)} ج.م`} accent="amber" />
      </div>

      {/* Income + profit trend */}
      <div className="rounded-2xl border border-border bg-card p-5">
        <h3 className="mb-3 text-sm font-bold text-foreground">الدخل وصافي الربح — آخر 12 شهرًا</h3>
        <div className="h-64 w-full" dir="ltr">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 6, right: 8, left: -12, bottom: 0 }}>
              <defs>
                <linearGradient id="gIncome" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#0e8578" stopOpacity={0.35} />
                  <stop offset="95%" stopColor="#0e8578" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gProfit" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-border" opacity={0.4} />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="currentColor" className="text-muted-foreground" />
              <YAxis tick={{ fontSize: 11 }} width={44} stroke="currentColor" className="text-muted-foreground" />
              <Tooltip
                contentStyle={{ borderRadius: 12, border: "1px solid var(--border)", background: "var(--card)", fontSize: 12 }}
                formatter={(v: number, n: string) => [`${money(Number(v))} ج.م`, n === "net_income" ? "الدخل" : "صافي الربح"]}
              />
              <Legend formatter={(v) => (v === "net_income" ? "الدخل" : "صافي الربح")} wrapperStyle={{ fontSize: 12 }} />
              <Area type="monotone" dataKey="net_income" stroke="#0e8578" strokeWidth={2} fill="url(#gIncome)" />
              <Area type="monotone" dataKey="profit" stroke="#10b981" strokeWidth={2} fill="url(#gProfit)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Bookings per month */}
      <div className="rounded-2xl border border-border bg-card p-5">
        <h3 className="mb-3 text-sm font-bold text-foreground">الحجوزات المكتملة شهريًا</h3>
        <div className="h-56 w-full" dir="ltr">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 6, right: 8, left: -12, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="currentColor" className="text-border" opacity={0.4} vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke="currentColor" className="text-muted-foreground" />
              <YAxis tick={{ fontSize: 11 }} width={44} allowDecimals={false} stroke="currentColor" className="text-muted-foreground" />
              <Tooltip
                contentStyle={{ borderRadius: 12, border: "1px solid var(--border)", background: "var(--card)", fontSize: 12 }}
                formatter={(v: number) => [money(Number(v)), "حجوزات"]}
              />
              <Bar dataKey="bookings" fill="#6366f1" radius={[6, 6, 0, 0]} maxBarSize={38} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

function Kpi({
  icon,
  label,
  value,
  accent,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  accent: "emerald" | "indigo" | "teal" | "amber";
}) {
  const accents: Record<string, string> = {
    emerald: "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10",
    indigo: "text-indigo-600 dark:text-indigo-400 bg-indigo-500/10",
    teal: "text-teal-600 dark:text-teal-400 bg-teal-500/10",
    amber: "text-amber-600 dark:text-amber-400 bg-amber-500/10",
  };
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <div className={`mb-2 inline-flex h-8 w-8 items-center justify-center rounded-lg ${accents[accent]}`}>{icon}</div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-0.5 text-lg font-extrabold tabular-nums text-foreground">{value}</p>
    </div>
  );
}
