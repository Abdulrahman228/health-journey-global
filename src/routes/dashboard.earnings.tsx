/**
 * /dashboard/earnings — doctor's financial dashboard.
 *
 * Sections:
 *   1. Balance cards (available, pending, lifetime, withdrawn)
 *   2. Withdraw request form
 *   3. Recent transactions
 *   4. Withdrawal history
 *
 * Private — noindex, nofollow.
 */
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import {
  cancelMyWithdrawal,
  getDoctorBalance,
  getDoctorTransactions,
  getDoctorWithdrawals,
  requestWithdrawal,
  type DoctorBalance,
  type DoctorTransaction,
  type DoctorWithdrawal,
} from "@/lib/accounting.functions";
import {
  ArrowDownToLine,
  Banknote,
  ClipboardList,
  Loader2,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/dashboard/earnings")({
  head: () => ({
    meta: [
      { title: "إيراداتي | لوحة الطبيب — طبيبي" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: EarningsPage,
});

function EarningsPage() {
  const { user, isLoading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [balance, setBalance] = useState<DoctorBalance | null>(null);
  const [txs, setTxs] = useState<DoctorTransaction[]>([]);
  const [wds, setWds] = useState<DoctorWithdrawal[]>([]);
  const [loading, setLoading] = useState(true);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const [b, t, w] = await Promise.all([
      getDoctorBalance({ data: { userId: user.id } }),
      getDoctorTransactions({ data: { userId: user.id, limit: 50 } }),
      getDoctorWithdrawals({ data: { userId: user.id } }),
    ]);
    setBalance(b);
    setTxs(t);
    setWds(w);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      navigate({ to: "/login" });
      return;
    }
    load();
  }, [authLoading, user, navigate, load]);

  const handleWithdraw = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const amt = Number(amount);
    if (!amt || amt <= 0) {
      toast.error("أدخل مبلغاً صحيحاً");
      return;
    }
    setSubmitting(true);
    const res = await requestWithdrawal({
      data: { userId: user.id, amount: amt, doctorNote: note || undefined },
    });
    setSubmitting(false);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success("تم تقديم طلب السحب — سيُراجَع خلال 48 ساعة");
    setAmount("");
    setNote("");
    await load();
  };

  const handleCancel = async (id: string) => {
    if (!user) return;
    if (!confirm("هل أنت متأكد من إلغاء طلب السحب؟")) return;
    const res = await cancelMyWithdrawal({
      data: { userId: user.id, withdrawalId: id },
    });
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success("تم إلغاء الطلب");
    await load();
  };

  if (authLoading || loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!balance) {
    return (
      <div className="mx-auto max-w-md px-4 py-24 text-center">
        <h1 className="text-xl font-bold">هذه الصفحة للأطباء فقط</h1>
      </div>
    );
  }

  const cur = balance.currency;

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground">
            <Wallet className="h-6 w-6 text-primary" aria-hidden="true" />
            إيراداتي
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            تابع رصيدك، اطلب سحب أرباحك، واطلع على سجل المعاملات.
          </p>
        </div>
        <Link
          to="/dashboard/settings/billing"
          className="text-sm font-medium text-primary hover:underline"
        >
          إعدادات الدفع ↗
        </Link>
      </header>

      {/* Balance cards */}
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <BalanceCard
          icon={Banknote}
          color="emerald"
          label="الرصيد المتاح"
          value={balance.available}
          currency={cur}
          hint={`حد أدنى للسحب: ${balance.minimumPayout.toLocaleString("ar-EG")} ${cur}`}
        />
        <BalanceCard
          icon={Loader2}
          color="amber"
          label="قيد التحصيل"
          value={balance.pending}
          currency={cur}
          hint="من مواعيد مؤكدة لم تكتمل بعد"
        />
        <BalanceCard
          icon={TrendingUp}
          color="primary"
          label="إجمالي الأرباح"
          value={balance.lifetimeEarnings}
          currency={cur}
          hint="مدى الحياة"
        />
        <BalanceCard
          icon={ArrowDownToLine}
          color="slate"
          label="إجمالي السحوبات"
          value={balance.totalWithdrawn}
          currency={cur}
          hint={`عمولة المنصة ${balance.platformFeePct}%`}
        />
      </section>

      {/* Withdraw form */}
      <section className="mt-8 rounded-xl border border-border bg-card p-6">
        <h2 className="mb-3 flex items-center gap-2 text-lg font-bold text-foreground">
          <ArrowDownToLine className="h-5 w-5 text-primary" aria-hidden="true" />
          طلب سحب جديد
        </h2>
        <form onSubmit={handleWithdraw} className="grid gap-3 sm:grid-cols-3">
          <label className="block sm:col-span-1">
            <span className="text-sm font-medium text-foreground">المبلغ ({cur})</span>
            <input
              type="number"
              min={balance.minimumPayout}
              max={balance.available}
              step="1"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              required
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
          </label>
          <label className="block sm:col-span-2">
            <span className="text-sm font-medium text-foreground">ملاحظة (اختياري)</span>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={500}
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
          </label>
          <div className="sm:col-span-3 flex justify-end">
            <button
              type="submit"
              disabled={submitting || balance.available < balance.minimumPayout}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              {submitting && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
              تقديم طلب السحب
            </button>
          </div>
        </form>
        {balance.available < balance.minimumPayout && (
          <p className="mt-3 text-xs text-muted-foreground">
            تحتاج إلى رصيد متاح لا يقل عن {balance.minimumPayout.toLocaleString("ar-EG")} {cur} لتقديم طلب سحب.
          </p>
        )}
      </section>

      {/* Withdrawals history */}
      <section className="mt-8">
        <h2 className="mb-3 flex items-center gap-2 text-lg font-bold text-foreground">
          <ClipboardList className="h-5 w-5 text-primary" aria-hidden="true" />
          سجل السحوبات
        </h2>
        {wds.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            لا توجد طلبات سحب بعد.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border bg-card">
            <table className="w-full text-sm">
              <thead className="bg-muted/40">
                <tr>
                  <th scope="col" className="px-4 py-2 text-start font-semibold">التاريخ</th>
                  <th scope="col" className="px-4 py-2 text-start font-semibold">المبلغ</th>
                  <th scope="col" className="px-4 py-2 text-start font-semibold">الطريقة</th>
                  <th scope="col" className="px-4 py-2 text-start font-semibold">الحالة</th>
                  <th scope="col" className="px-4 py-2 text-start font-semibold">المرجع</th>
                  <th scope="col" className="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {wds.map((w) => (
                  <tr key={w.id} className="border-t border-border">
                    <td className="px-4 py-2 text-muted-foreground">
                      {new Date(w.requestedAt).toLocaleDateString("ar-EG")}
                    </td>
                    <td className="px-4 py-2 font-semibold text-foreground">
                      {w.amount.toLocaleString("ar-EG")} {w.currency}
                    </td>
                    <td className="px-4 py-2">{methodLabel(w.method)}</td>
                    <td className="px-4 py-2">
                      <StatusPill status={w.status} />
                    </td>
                    <td className="px-4 py-2 font-mono text-xs text-muted-foreground">
                      {w.reference ?? "—"}
                    </td>
                    <td className="px-4 py-2 text-end">
                      {w.status === "requested" && (
                        <button
                          type="button"
                          onClick={() => handleCancel(w.id)}
                          className="text-xs font-medium text-destructive hover:underline"
                        >
                          إلغاء
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Transactions */}
      <section className="mt-8">
        <h2 className="mb-3 flex items-center gap-2 text-lg font-bold text-foreground">
          <ClipboardList className="h-5 w-5 text-primary" aria-hidden="true" />
          آخر المعاملات
        </h2>
        {txs.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            لا توجد معاملات بعد.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border bg-card">
            <table className="w-full text-sm">
              <thead className="bg-muted/40">
                <tr>
                  <th scope="col" className="px-4 py-2 text-start font-semibold">التاريخ</th>
                  <th scope="col" className="px-4 py-2 text-start font-semibold">النوع</th>
                  <th scope="col" className="px-4 py-2 text-start font-semibold">الإجمالي</th>
                  <th scope="col" className="px-4 py-2 text-start font-semibold">العمولة</th>
                  <th scope="col" className="px-4 py-2 text-start font-semibold">الصافي</th>
                  <th scope="col" className="px-4 py-2 text-start font-semibold">الوصف</th>
                </tr>
              </thead>
              <tbody>
                {txs.map((t) => (
                  <tr key={t.id} className="border-t border-border">
                    <td className="px-4 py-2 text-muted-foreground">
                      {new Date(t.createdAt).toLocaleDateString("ar-EG")}
                    </td>
                    <td className="px-4 py-2">{typeLabel(t.type)}</td>
                    <td className="px-4 py-2">{t.grossAmount.toLocaleString("ar-EG")}</td>
                    <td className="px-4 py-2 text-muted-foreground">
                      −{t.platformFee.toLocaleString("ar-EG")}
                    </td>
                    <td
                      className={
                        "px-4 py-2 font-semibold " +
                        (t.netAmount < 0 ? "text-destructive" : "text-emerald-700 dark:text-emerald-300")
                      }
                    >
                      {t.netAmount > 0 ? "+" : ""}
                      {t.netAmount.toLocaleString("ar-EG")} {t.currency}
                    </td>
                    <td className="px-4 py-2 text-muted-foreground">
                      {t.description ?? "—"}
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

function BalanceCard({
  icon: Icon,
  color,
  label,
  value,
  currency,
  hint,
}: {
  icon: React.ComponentType<{ className?: string }>;
  color: "emerald" | "amber" | "primary" | "slate";
  label: string;
  value: number;
  currency: string;
  hint?: string;
}) {
  const colorMap = {
    emerald: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300",
    amber: "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
    primary: "bg-primary/10 text-primary",
    slate: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
  };
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-3">
        <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${colorMap[color]}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="flex-1">
          <div className="text-xs text-muted-foreground">{label}</div>
          <div className="mt-0.5 text-xl font-bold text-foreground">
            {value.toLocaleString("ar-EG", { maximumFractionDigits: 2 })}{" "}
            <span className="text-xs font-medium text-muted-foreground">{currency}</span>
          </div>
        </div>
      </div>
      {hint && <p className="mt-2 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function StatusPill({ status }: { status: DoctorWithdrawal["status"] }) {
  const map: Record<DoctorWithdrawal["status"], { cls: string; label: string }> = {
    requested: { cls: "bg-amber-100 text-amber-800", label: "قيد المراجعة" },
    approved: { cls: "bg-sky-100 text-sky-800", label: "معتمد" },
    processing: { cls: "bg-indigo-100 text-indigo-800", label: "قيد التحويل" },
    paid: { cls: "bg-emerald-100 text-emerald-800", label: "تم الدفع" },
    rejected: { cls: "bg-rose-100 text-rose-800", label: "مرفوض" },
    cancelled: { cls: "bg-slate-100 text-slate-700", label: "ملغى" },
  };
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${map[status].cls}`}>
      {map[status].label}
    </span>
  );
}

function methodLabel(m: string): string {
  return (
    {
      bank: "تحويل بنكي",
      instapay: "InstaPay",
      vodafone_cash: "فودافون كاش",
      wise: "Wise",
      manual: "يدوي",
    }[m] ?? m
  );
}

function typeLabel(t: DoctorTransaction["type"]): string {
  return (
    {
      consultation: "كشف",
      refund: "استرداد",
      adjustment: "تعديل",
      withdrawal: "سحب",
      bonus: "مكافأة",
      chargeback: "رد قيد",
    }[t] ?? t
  );
}
