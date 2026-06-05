/**
 * /dashboard/expenses — Premium/Gold expense tracking + monthly P&L report.
 *
 * Lets doctors:
 *   • log practice expenses (rent, utilities, staff, …)
 *   • view monthly P&L (revenue – fees – expenses = net profit)
 *   • download CSV report for accountant
 *
 * Free-tier doctors see an upsell.
 */
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/hooks/useLanguage";
import { useCurrency } from "@/hooks/useCurrency";
import {
  addMyExpense,
  deleteMyExpense,
  getMyMonthlyPnL,
  listMyExpenses,
  EXPENSE_CATEGORIES,
  type DoctorExpense,
  type ExpenseCategory,
  type MonthlyPnL,
} from "@/lib/expenses.functions";
import {
  ArrowUpRight,
  Crown,
  Download,
  FileSpreadsheet,
  Loader2,
  Plus,
  Sparkles,
  Trash2,
  TrendingUp,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/dashboard/expenses")({
  head: () => ({
    meta: [
      { title: "المصاريف والتقارير | لوحة الطبيب — طبيبي" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: ExpensesPage,
});

function ExpensesPage() {
  const { user, isLoading: authLoading } = useAuth();
  const { t, isRTL } = useLanguage();
  const { formatPrice } = useCurrency();
  const navigate = useNavigate();
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [expenses, setExpenses] = useState<DoctorExpense[]>([]);
  const [pnl, setPnl] = useState<MonthlyPnL | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [accessDenied, setAccessDenied] = useState(false);

  // form state
  const [fDate, setFDate] = useState(today.toISOString().slice(0, 10));
  const [fCategory, setFCategory] = useState<ExpenseCategory>("rent");
  const [fAmount, setFAmount] = useState("");
  const [fVendor, setFVendor] = useState("");
  const [fDesc, setFDesc] = useState("");

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const [exps, p] = await Promise.all([
        listMyExpenses({ data: { userId: user.id, year, month } }),
        getMyMonthlyPnL({ data: { userId: user.id, year, month } }),
      ]);
      setExpenses(exps);
      setPnl(p);
      setAccessDenied(p === null);
    } finally {
      setLoading(false);
    }
  }, [user, year, month]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      navigate({ to: "/login" });
      return;
    }
    load();
  }, [authLoading, user, navigate, load]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const amt = Number(fAmount);
    if (!Number.isFinite(amt) || amt <= 0) {
      toast.error(t("Enter a valid amount", "أدخل مبلغًا صحيحًا"));
      return;
    }
    setSubmitting(true);
    try {
      await addMyExpense({
        data: {
          userId: user.id,
          expenseDate: fDate,
          category: fCategory,
          amount: amt,
          currency: pnl?.currency ?? "EGP",
          vendor: fVendor || undefined,
          description: fDesc || undefined,
        },
      });
      toast.success(t("Expense added", "تمت إضافة المصروف"));
      setFAmount("");
      setFVendor("");
      setFDesc("");
      await load();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "error";
      if (msg === "PREMIUM_REQUIRED") {
        toast.error(t("Premium plan required", "هذه الميزة لباقتي بريميوم وجولد فقط"));
        setAccessDenied(true);
      } else {
        toast.error(msg);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const removeExp = async (id: string) => {
    if (!user) return;
    if (!confirm(t("Delete this expense?", "حذف هذا المصروف؟"))) return;
    try {
      await deleteMyExpense({ data: { userId: user.id, id } });
      toast.success(t("Deleted", "تم الحذف"));
      await load();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "error";
      toast.error(msg);
    }
  };

  const downloadCsv = () => {
    if (!pnl) return;
    const blob = new Blob([pnl.csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `mytabibi-monthly-pnl-${pnl.year}-${String(pnl.month).padStart(2, "0")}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const months = useMemo(
    () => [
      t("Jan", "يناير"),
      t("Feb", "فبراير"),
      t("Mar", "مارس"),
      t("Apr", "أبريل"),
      t("May", "مايو"),
      t("Jun", "يونيو"),
      t("Jul", "يوليو"),
      t("Aug", "أغسطس"),
      t("Sep", "سبتمبر"),
      t("Oct", "أكتوبر"),
      t("Nov", "نوفمبر"),
      t("Dec", "ديسمبر"),
    ],
    [t],
  );

  const categoryLabel = (c: ExpenseCategory): string =>
    ({
      rent: t("Rent", "إيجار"),
      utilities: t("Utilities", "مرافق"),
      staff: t("Staff", "رواتب"),
      equipment: t("Equipment", "معدات"),
      supplies: t("Supplies", "مستلزمات"),
      marketing: t("Marketing", "تسويق"),
      tax: t("Tax", "ضرائب"),
      software: t("Software", "برامج"),
      training: t("Training", "تدريب"),
      other: t("Other", "أخرى"),
    })[c];

  if (loading || authLoading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  // ---- Free-tier upsell ----
  if (accessDenied) {
    return (
      <div className="container mx-auto px-4 py-10 max-w-3xl">
        <h1 className="text-2xl font-bold mb-2 flex items-center gap-2">
          <Sparkles className="h-6 w-6 text-amber-500" />
          {t("Expenses & Reports", "المصاريف والتقارير")}
        </h1>
        <div className="bg-linear-to-br from-amber-50 to-yellow-100 dark:from-amber-950/30 dark:to-yellow-900/20 border border-amber-200 dark:border-amber-800 rounded-2xl p-6 mt-4">
          <div className="flex items-start gap-3 mb-4">
            <Crown className="h-7 w-7 text-amber-600 shrink-0" />
            <div>
              <h2 className="text-lg font-bold mb-1">
                {t("Premium feature", "ميزة بريميوم")}
              </h2>
              <p className="text-sm text-muted-foreground">
                {t(
                  "Track practice expenses, get monthly P&L, and export CSV for your accountant.",
                  "تتبّع مصاريف العيادة، تقرير شهري للأرباح والخسائر، وتصدير CSV للمحاسب.",
                )}
              </p>
            </div>
          </div>
          <Link
            to="/pricing"
            className="inline-flex items-center gap-2 bg-amber-600 hover:bg-amber-700 text-white font-semibold px-5 py-3 rounded-xl transition"
          >
            <Crown className="h-4 w-4" />
            {t("Upgrade now", "ترقية الباقة الآن")}
            <ArrowUpRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    );
  }

  const ccy = pnl?.currency ?? "EGP";

  return (
    <div className="container mx-auto px-4 py-8 max-w-5xl" dir={isRTL ? "rtl" : "ltr"}>
      <div className="flex items-center justify-between mb-6 flex-wrap gap-2">
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <FileSpreadsheet className="h-6 w-6 text-primary" />
          {t("Expenses & Reports", "المصاريف والتقارير")}
        </h1>
        <button
          onClick={downloadCsv}
          disabled={!pnl}
          className="inline-flex items-center gap-2 bg-primary text-primary-foreground rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50"
        >
          <Download className="h-4 w-4" />
          {t("Download CSV", "تنزيل CSV")}
        </button>
      </div>

      {/* Month selector */}
      <div className="flex gap-2 mb-6">
        <select
          className="border border-border rounded-lg px-3 py-2 bg-card"
          value={month}
          onChange={(e) => setMonth(Number(e.target.value))}
        >
          {months.map((m, i) => (
            <option key={i} value={i + 1}>
              {m}
            </option>
          ))}
        </select>
        <select
          className="border border-border rounded-lg px-3 py-2 bg-card"
          value={year}
          onChange={(e) => setYear(Number(e.target.value))}
        >
          {[year - 2, year - 1, year, year + 1].map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
      </div>

      {/* P&L summary */}
      {pnl && (
        <section className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
          <Stat
            label={t("Gross revenue", "إجمالي الإيرادات")}
            value={formatPrice(pnl.grossRevenue, ccy)}
          />
          <Stat
            label={t("Platform fees", "عمولة المنصة")}
            value={`- ${formatPrice(pnl.platformFees, ccy)}`}
            negative
          />
          <Stat
            label={t("Total expenses", "إجمالي المصاريف")}
            value={`- ${formatPrice(pnl.totalExpenses, ccy)}`}
            negative
          />
          <Stat
            label={t("Net profit", "صافي الربح")}
            value={formatPrice(pnl.netProfit, ccy)}
            highlight
          />
        </section>
      )}

      {/* Add expense form */}
      <section className="bg-card border border-border rounded-2xl p-4 mb-6">
        <h2 className="font-semibold mb-3 flex items-center gap-2">
          <Plus className="h-4 w-4" />
          {t("Add expense", "إضافة مصروف")}
        </h2>
        <form onSubmit={submit} className="grid grid-cols-1 sm:grid-cols-6 gap-2">
          <input
            type="date"
            value={fDate}
            onChange={(e) => setFDate(e.target.value)}
            className="border border-border rounded px-2 py-2 bg-background sm:col-span-1"
            required
          />
          <select
            value={fCategory}
            onChange={(e) => setFCategory(e.target.value as ExpenseCategory)}
            className="border border-border rounded px-2 py-2 bg-background sm:col-span-1"
          >
            {EXPENSE_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {categoryLabel(c)}
              </option>
            ))}
          </select>
          <input
            type="number"
            step="0.01"
            min="0"
            placeholder={t("Amount", "المبلغ")}
            value={fAmount}
            onChange={(e) => setFAmount(e.target.value)}
            className="border border-border rounded px-2 py-2 bg-background sm:col-span-1"
            required
          />
          <input
            type="text"
            placeholder={t("Vendor", "الجهة")}
            value={fVendor}
            onChange={(e) => setFVendor(e.target.value)}
            className="border border-border rounded px-2 py-2 bg-background sm:col-span-1"
            maxLength={120}
          />
          <input
            type="text"
            placeholder={t("Description", "الوصف")}
            value={fDesc}
            onChange={(e) => setFDesc(e.target.value)}
            className="border border-border rounded px-2 py-2 bg-background sm:col-span-1"
            maxLength={500}
          />
          <button
            type="submit"
            disabled={submitting}
            className="bg-primary text-primary-foreground rounded px-4 py-2 font-semibold disabled:opacity-50 sm:col-span-1"
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin mx-auto" /> : t("Add", "إضافة")}
          </button>
        </form>
      </section>

      {/* Expenses list */}
      <section className="bg-card border border-border rounded-2xl p-4">
        <h2 className="font-semibold mb-3 flex items-center gap-2">
          <TrendingUp className="h-4 w-4" />
          {t("Expenses this month", "مصاريف هذا الشهر")}
        </h2>
        {expenses.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">
            {t("No expenses recorded.", "لم تُسجَّل مصاريف بعد.")}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground border-b border-border">
                <tr>
                  <th className="text-start py-2">{t("Date", "التاريخ")}</th>
                  <th className="text-start py-2">{t("Category", "البند")}</th>
                  <th className="text-start py-2 hidden sm:table-cell">{t("Vendor", "الجهة")}</th>
                  <th className="text-start py-2 hidden sm:table-cell">{t("Description", "الوصف")}</th>
                  <th className="text-end py-2">{t("Amount", "المبلغ")}</th>
                  <th className="py-2"></th>
                </tr>
              </thead>
              <tbody>
                {expenses.map((e) => (
                  <tr key={e.id} className="border-b border-border/50 last:border-0">
                    <td className="py-2 tabular-nums">{e.expenseDate}</td>
                    <td className="py-2">{categoryLabel(e.category)}</td>
                    <td className="py-2 hidden sm:table-cell text-muted-foreground">{e.vendor ?? "—"}</td>
                    <td className="py-2 hidden sm:table-cell text-muted-foreground truncate max-w-[200px]">{e.description ?? "—"}</td>
                    <td className="py-2 text-end font-semibold tabular-nums">{formatPrice(e.amount, e.currency)}</td>
                    <td className="py-2 text-end">
                      <button
                        onClick={() => removeExp(e.id)}
                        className="text-rose-600 hover:text-rose-700"
                        aria-label={t("Delete", "حذف")}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

function Stat({
  label,
  value,
  negative,
  highlight,
}: {
  label: string;
  value: string;
  negative?: boolean;
  highlight?: boolean;
}) {
  const cls = highlight
    ? "border-emerald-200 bg-emerald-50 text-emerald-900 dark:bg-emerald-950/30 dark:border-emerald-800 dark:text-emerald-100"
    : negative
    ? "border-rose-200 bg-rose-50 text-rose-800 dark:bg-rose-950/30 dark:border-rose-800 dark:text-rose-200"
    : "border-border bg-card";
  return (
    <div className={`border rounded-xl p-3 ${cls}`}>
      <div className="text-xs opacity-80 mb-1">{label}</div>
      <div className="text-lg font-bold tabular-nums">{value}</div>
    </div>
  );
}
