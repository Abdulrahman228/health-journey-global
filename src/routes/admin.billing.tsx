import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useAdminGuard } from "@/hooks/useAdminGuard";
import { AdminShell } from "@/components/admin/AdminNav";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { adminProcessRefund } from "@/lib/admin/financial";
import { AdminProcessRefundSchema } from "@/lib/admin/_schemas";
import {
  ReceiptText,
  Loader2,
  Building2,
  FileSpreadsheet,
  BarChart3,
  RotateCcw,
  ShieldAlert,
  AlertTriangle,
  X,
  Undo2,
} from "lucide-react";

export const Route = createFileRoute("/admin/billing")({
  head: () => ({
    meta: [
      { title: "المدفوعات والفواتير — لوحة الأدمن" },
      { name: "description", content: "إدارة مدفوعات Stripe وعمليات الاسترداد ودفتر الأستاذ." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: AdminBillingPage,
});

const PLANNED_MODULES = [
  { icon: Building2, title: "شركاء التأمين", desc: "إدارة عقود شركات التأمين، حدود التغطية، والتعريفات المتفق عليها." },
  { icon: FileSpreadsheet, title: "دفتر الأستاذ (Ledger)", desc: "سجل شامل لجميع الحركات المالية مع تصفية متقدمة." },
  { icon: BarChart3, title: "تقارير الإيرادات", desc: "تحليلات مالية حسب التخصص، الطبيب، وجهة التأمين." },
];

type PaymentRow = {
  id: string;
  user_id: string;
  amount_cents: number;
  currency: string;
  provider: string;
  status: string;
  created_at: string;
  payerName: string | null;
};

function AdminBillingPage() {
  const { isLoading, isAdmin } = useAdminGuard();
  const { user } = useAuth();
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [checkingRole, setCheckingRole] = useState(true);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [loadingPayments, setLoadingPayments] = useState(false);
  const [refundTarget, setRefundTarget] = useState<PaymentRow | null>(null);

  const loadPayments = useCallback(async () => {
    setLoadingPayments(true);
    const { data: pays } = await supabase
      .from("payments")
      .select("id, user_id, amount_cents, currency, provider, status, created_at")
      .order("created_at", { ascending: false })
      .limit(100);
    const list = (pays ?? []) as Omit<PaymentRow, "payerName">[];
    const userIds = Array.from(new Set(list.map((p) => p.user_id)));
    const nameByUser = new Map<string, string | null>();
    if (userIds.length) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("user_id, full_name")
        .in("user_id", userIds);
      (profs ?? []).forEach((p) =>
        nameByUser.set(p.user_id as string, (p.full_name as string | null) ?? null),
      );
    }
    setPayments(list.map((p) => ({ ...p, payerName: nameByUser.get(p.user_id) ?? null })));
    setLoadingPayments(false);
  }, []);

  useEffect(() => {
    if (isLoading || !isAdmin || !user) return;
    let active = true;
    (async () => {
      setCheckingRole(true);
      // super_admin isn't exposed by useAuth (priority resolves to "admin"),
      // so detect it via the user's own user_roles row. Payments RLS + the
      // refund server fn are super_admin-gated regardless.
      const { data } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .eq("role", "super_admin")
        .maybeSingle();
      if (!active) return;
      const su = !!data;
      setIsSuperAdmin(su);
      setCheckingRole(false);
      if (su) void loadPayments();
    })();
    return () => {
      active = false;
    };
  }, [isLoading, isAdmin, user, loadPayments]);

  const markRefunded = useCallback((id: string) => {
    setPayments((prev) => prev.map((p) => (p.id === id ? { ...p, status: "refunded" } : p)));
  }, []);

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
          <ReceiptText className="h-3.5 w-3.5" aria-hidden="true" />
          المدفوعات · Stripe
        </div>
        <h1 className="text-3xl font-bold tracking-tight">المدفوعات والاسترداد</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          مراجعة مدفوعات المنصة وتنفيذ عمليات الاسترداد عبر Stripe.
        </p>
      </header>

      <section className="mb-8">
        <div className="mb-3 flex items-center gap-2">
          <RotateCcw className="h-5 w-5 text-primary" aria-hidden="true" />
          <h2 className="text-lg font-bold">أحدث المدفوعات</h2>
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary">
            Super Admin
          </span>
        </div>

        {checkingRole ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : !isSuperAdmin ? (
          <div className="flex items-center gap-2 rounded-xl border border-dashed border-border bg-muted/30 p-4 text-sm text-muted-foreground">
            <ShieldAlert className="h-4 w-4 shrink-0" />
            إدارة المدفوعات والاسترداد متاحة لِـ Super Admin فقط.
          </div>
        ) : (
          <PaymentsTable payments={payments} loading={loadingPayments} onRefund={setRefundTarget} />
        )}
      </section>

      <section>
        <div className="mb-4 flex items-center gap-2">
          <h2 className="text-lg font-bold">الوحدات المخططة</h2>
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">
            قيد التطوير
          </span>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {PLANNED_MODULES.map(({ icon: Icon, title, desc }) => (
            <div key={title} className="flex gap-4 rounded-xl border border-dashed border-border bg-muted/30 p-5">
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

      {refundTarget && (
        <RefundModal
          payment={refundTarget}
          onClose={() => setRefundTarget(null)}
          onDone={() => {
            markRefunded(refundTarget.id);
            setRefundTarget(null);
          }}
        />
      )}
    </AdminShell>
  );
}

function money(cents: number, currency: string) {
  return `${(cents / 100).toLocaleString("ar-EG", { minimumFractionDigits: 2 })} ${currency}`;
}

function StatusBadge({ status }: { status: string }) {
  const tone =
    status === "refunded"
      ? "bg-muted text-muted-foreground"
      : status === "succeeded" || status === "paid" || status === "captured"
        ? "bg-emerald-500/10 text-emerald-600"
        : status === "pending"
          ? "bg-amber-500/10 text-amber-600"
          : status === "failed"
            ? "bg-destructive/10 text-destructive"
            : "bg-primary/10 text-primary";
  return <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${tone}`}>{status}</span>;
}

function PaymentsTable({
  payments,
  loading,
  onRefund,
}: {
  payments: PaymentRow[];
  loading: boolean;
  onRefund: (p: PaymentRow) => void;
}) {
  if (loading) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }
  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card">
      <table className="w-full text-sm">
        <thead className="border-b border-border bg-muted/40 text-xs font-semibold text-muted-foreground">
          <tr>
            <th className="px-4 py-3 text-start">التاريخ</th>
            <th className="px-4 py-3 text-start">الدافع</th>
            <th className="px-4 py-3 text-start">المبلغ</th>
            <th className="px-4 py-3 text-start">المزود</th>
            <th className="px-4 py-3 text-start">الحالة</th>
            <th className="px-4 py-3 text-end">إجراء</th>
          </tr>
        </thead>
        <tbody>
          {payments.length === 0 ? (
            <tr>
              <td colSpan={6} className="px-4 py-16 text-center text-sm text-muted-foreground">
                لا توجد مدفوعات.
              </td>
            </tr>
          ) : (
            payments.map((p) => (
              <tr key={p.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                <td className="px-4 py-3">{new Date(p.created_at).toLocaleDateString("ar-EG")}</td>
                <td className="px-4 py-3 font-medium">{p.payerName ?? p.user_id.slice(0, 8) + "…"}</td>
                <td className="px-4 py-3 tabular-nums">{money(p.amount_cents, p.currency)}</td>
                <td className="px-4 py-3 text-muted-foreground">{p.provider}</td>
                <td className="px-4 py-3">
                  <StatusBadge status={p.status} />
                </td>
                <td className="px-4 py-3 text-end">
                  {p.status === "refunded" ? (
                    <span className="text-xs text-muted-foreground">تم الاسترداد</span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onRefund(p)}
                      className="inline-flex items-center gap-1 rounded-md border border-destructive/30 px-2.5 py-1 text-xs font-medium text-destructive hover:bg-destructive/10"
                    >
                      <Undo2 className="h-3 w-3" /> استرداد
                    </button>
                  )}
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}

// =====================================================================
// Refund confirmation modal — validates with AdminProcessRefundSchema and
// calls the adminProcessRefund server function (super_admin only).
// =====================================================================
function RefundModal({
  payment,
  onClose,
  onDone,
}: {
  payment: PaymentRow;
  onClose: () => void;
  onDone: () => void;
}) {
  const [reason, setReason] = useState<
    "requested_by_customer" | "duplicate" | "fraudulent" | "other"
  >("requested_by_customer");
  const [partial, setPartial] = useState("");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    let amountMinor: number | undefined;
    if (partial.trim()) {
      const n = Number(partial);
      if (!Number.isFinite(n) || n <= 0) {
        setError("مبلغ غير صالح");
        return;
      }
      amountMinor = Math.round(n * 100);
      if (amountMinor > payment.amount_cents) {
        setError("المبلغ أكبر من قيمة الدفعة");
        return;
      }
    }
    const input = {
      paymentId: payment.id,
      reason,
      ...(amountMinor ? { amountMinor } : {}),
      ...(note.trim() ? { note: note.trim() } : {}),
    };
    const parsed = AdminProcessRefundSchema.safeParse(input);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "بيانات غير صالحة");
      return;
    }

    setBusy(true);
    try {
      await adminProcessRefund({ data: parsed.data });
      toast.success("تم تنفيذ الاسترداد");
      onDone();
    } catch (e) {
      toast.error("فشل الاسترداد: " + (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="استرداد دفعة"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div className="w-full max-w-md overflow-hidden rounded-xl bg-card shadow-xl" onClick={(e) => e.stopPropagation()}>
        <header className="flex items-center justify-between border-b border-border px-5 py-3">
          <h2 className="text-lg font-bold">استرداد دفعة</h2>
          <button type="button" onClick={onClose} aria-label="إغلاق" className="rounded-md p-1 hover:bg-muted">
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="space-y-4 p-5">
          <div className="flex gap-2 rounded-lg bg-muted/50 p-3 text-sm">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
            <p className="text-muted-foreground">
              سيتم استرداد{" "}
              <span className="font-semibold text-foreground">
                {partial.trim() ? `${partial} ${payment.currency}` : money(payment.amount_cents, payment.currency)}
              </span>{" "}
              عبر {payment.provider}. لا يمكن التراجع.
            </p>
          </div>

          <label className="block text-sm">
            <span className="font-medium text-foreground">السبب</span>
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value as typeof reason)}
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
            >
              <option value="requested_by_customer">طلب العميل</option>
              <option value="duplicate">دفعة مكررة</option>
              <option value="fraudulent">احتيال</option>
              <option value="other">أخرى</option>
            </select>
          </label>

          <label className="block text-sm">
            <span className="font-medium text-foreground">
              مبلغ جزئي ({payment.currency}) — اتركه فارغاً لاسترداد كامل
            </span>
            <input
              type="number"
              min={0}
              step="0.01"
              value={partial}
              onChange={(e) => setPartial(e.target.value)}
              placeholder={(payment.amount_cents / 100).toString()}
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
            />
          </label>

          <label className="block text-sm">
            <span className="font-medium text-foreground">ملاحظة (اختياري)</span>
            <textarea
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
            />
          </label>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <footer className="flex justify-end gap-2 border-t border-border px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-muted disabled:opacity-60"
          >
            إلغاء
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={busy}
            className="inline-flex items-center gap-2 rounded-md bg-destructive px-4 py-2 text-sm font-semibold text-white hover:bg-destructive/90 disabled:opacity-60"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Undo2 className="h-4 w-4" />}
            تأكيد الاسترداد
          </button>
        </footer>
      </div>
    </div>
  );
}
