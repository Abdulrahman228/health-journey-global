import { useCallback, useEffect, useMemo, useState } from "react";
import { TrendingUp, TrendingDown, Loader2, Download, Wallet } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

interface ReportRow {
  direction: "income" | "expense";
  category: string;
  amount: number;
}

const CATEGORY_LABEL: Record<string, string> = {
  consultation_online: "كشوفات أونلاين",
  consultation_clinic: "كشوفات العيادة",
  rent: "إيجار",
  salaries: "رواتب",
  staff: "رواتب",
  supplies: "مستلزمات",
  utilities: "مرافق وفواتير",
  marketing: "تسويق",
  equipment: "معدات",
  tax: "ضرائب",
  software: "برامج",
  training: "تدريب",
  other: "أخرى",
};

function labelFor(category: string): string {
  if (CATEGORY_LABEL[category]) return CATEGORY_LABEL[category];
  if (category.startsWith("other_")) return "إيراد آخر — " + category.slice(6);
  return category;
}

const money = (n: number, cur = "EGP") =>
  `${n.toLocaleString("ar-EG", { minimumFractionDigits: 0, maximumFractionDigits: 2 })} ${cur}`;

/**
 * Professional monthly financial report from the unified ledger
 * (doctor_financial_report): income by category + expenses by category + net
 * profit, with a CSV export. Mirrors the clinic P&L a doctor's accountant expects.
 */
export function FinancialReportCard({ year, month }: { year: number; month: number }) {
  const { profile, isLoading: authLoading } = useAuth();
  const [rows, setRows] = useState<ReportRow[]>([]);
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
      const { data, error: rpcErr } = await supabase.rpc("doctor_financial_report", {
        _doctor_details_id: dd.id,
        _year: year,
        _month: month,
      });
      if (rpcErr) throw rpcErr;
      setRows(
        (data ?? []).map((r) => ({
          direction: r.direction === "expense" ? "expense" : "income",
          category: r.category,
          amount: Number(r.amount),
        })),
      );
    } catch (e) {
      setRows([]);
      setError(
        "تعذّر تحميل التقرير المالي" +
          (e && typeof e === "object" && "message" in e ? ` — ${String(e.message)}` : ""),
      );
    } finally {
      setLoading(false);
    }
  }, [profile?.id, authLoading, year, month]);

  useEffect(() => {
    void load();
  }, [load]);

  const income = useMemo(() => rows.filter((r) => r.direction === "income"), [rows]);
  const expenses = useMemo(() => rows.filter((r) => r.direction === "expense"), [rows]);
  const totalIncome = useMemo(() => income.reduce((s, r) => s + Number(r.amount), 0), [income]);
  const totalExpenses = useMemo(() => expenses.reduce((s, r) => s + Number(r.amount), 0), [expenses]);
  const net = totalIncome - totalExpenses;

  const downloadCsv = () => {
    const lines = [
      "النوع,البند,المبلغ",
      ...income.map((r) => `إيراد,${labelFor(r.category)},${Number(r.amount).toFixed(2)}`),
      `إجمالي,إجمالي الإيرادات,${totalIncome.toFixed(2)}`,
      ...expenses.map((r) => `مصروف,${labelFor(r.category)},${Number(r.amount).toFixed(2)}`),
      `إجمالي,إجمالي المصروفات,${totalExpenses.toFixed(2)}`,
      `صافي,صافي الربح,${net.toFixed(2)}`,
    ];
    const blob = new Blob(["﻿" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `tebana-financial-report-${year}-${String(month).padStart(2, "0")}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  if (loading) {
    return (
      <div className="rounded-2xl border border-border bg-card p-6">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-6">
      <div className="mb-4 flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-lg font-bold text-foreground">
          <Wallet className="h-5 w-5 text-primary" />
          التقرير المالي — {month}/{year}
        </h3>
        <button
          type="button"
          onClick={downloadCsv}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium hover:bg-accent"
        >
          <Download className="h-3.5 w-3.5" />
          CSV
        </button>
      </div>

      {error && (
        <p role="alert" className="mb-4 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {/* Income */}
        <section className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
          <div className="mb-3 flex items-center gap-2 text-emerald-700 dark:text-emerald-400">
            <TrendingUp className="h-4 w-4" />
            <h4 className="text-sm font-bold">الإيرادات</h4>
          </div>
          {income.length === 0 ? (
            <p className="text-sm text-muted-foreground">لا إيرادات هذا الشهر.</p>
          ) : (
            <ul className="space-y-1.5">
              {income.map((r) => (
                <li key={r.category} className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{labelFor(r.category)}</span>
                  <span className="font-medium tabular-nums text-foreground">{money(Number(r.amount))}</span>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-3 flex items-center justify-between border-t border-emerald-500/20 pt-2 text-sm font-bold">
            <span>إجمالي الإيرادات</span>
            <span className="tabular-nums text-emerald-700 dark:text-emerald-400">{money(totalIncome)}</span>
          </div>
        </section>

        {/* Expenses */}
        <section className="rounded-xl border border-rose-500/20 bg-rose-500/5 p-4">
          <div className="mb-3 flex items-center gap-2 text-rose-700 dark:text-rose-400">
            <TrendingDown className="h-4 w-4" />
            <h4 className="text-sm font-bold">المصروفات</h4>
          </div>
          {expenses.length === 0 ? (
            <p className="text-sm text-muted-foreground">لا مصروفات هذا الشهر.</p>
          ) : (
            <ul className="space-y-1.5">
              {expenses.map((r) => (
                <li key={r.category} className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{labelFor(r.category)}</span>
                  <span className="font-medium tabular-nums text-foreground">{money(Number(r.amount))}</span>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-3 flex items-center justify-between border-t border-rose-500/20 pt-2 text-sm font-bold">
            <span>إجمالي المصروفات</span>
            <span className="tabular-nums text-rose-700 dark:text-rose-400">{money(totalExpenses)}</span>
          </div>
        </section>
      </div>

      {/* Net profit */}
      <div
        className={`mt-4 flex items-center justify-between rounded-xl border p-4 ${
          net >= 0
            ? "border-emerald-500/30 bg-emerald-500/10"
            : "border-rose-500/30 bg-rose-500/10"
        }`}
      >
        <span className="text-sm font-bold text-foreground">صافي الربح</span>
        <span
          className={`text-xl font-extrabold tabular-nums ${
            net >= 0 ? "text-emerald-700 dark:text-emerald-400" : "text-rose-700 dark:text-rose-400"
          }`}
        >
          {money(net)}
        </span>
      </div>
    </div>
  );
}
