/**
 * /admin/withdrawals — admin queue for processing payout requests.
 *
 * Admin sees pending withdrawals + payout details snapshot + can
 * mark as approved/processing/paid/rejected with optional reference.
 *
 * Private — noindex, nofollow.
 */
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { AdminNav } from "@/components/admin/AdminNav";
import {
  adminListWithdrawals,
  adminUpdateWithdrawal,
  type AdminWithdrawalRow,
} from "@/lib/accounting.functions";
import { Loader2, ShieldAlert, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/withdrawals")({
  head: () => ({
    meta: [
      { title: "إدارة السحوبات | الأدمن — طبيبي" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: AdminWithdrawalsPage,
});

type StatusFilter =
  | "requested"
  | "approved"
  | "processing"
  | "paid"
  | "rejected"
  | "cancelled"
  | "all";

function AdminWithdrawalsPage() {
  const { user, isLoading: authLoading } = useAuth();
  const { isAdmin, isLoading: roleLoading } = useIsAdmin();
  const navigate = useNavigate();
  const [filter, setFilter] = useState<StatusFilter>("requested");
  const [rows, setRows] = useState<AdminWithdrawalRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const r = await adminListWithdrawals({
      data: { userId: user.id, status: filter },
    });
    setRows(r as AdminWithdrawalRow[]);
    setLoading(false);
  }, [user, filter]);

  useEffect(() => {
    if (authLoading || roleLoading) return;
    if (!user) {
      navigate({ to: "/login" });
      return;
    }
    if (!isAdmin) return;
    load();
  }, [authLoading, roleLoading, user, isAdmin, navigate, load]);

  if (authLoading || roleLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }
  if (!isAdmin) {
    return (
      <div className="mx-auto max-w-md px-4 py-24 text-center">
        <ShieldAlert className="mx-auto h-12 w-12 text-destructive" aria-hidden="true" />
        <h1 className="mt-3 text-xl font-bold">صلاحية الأدمن مطلوبة</h1>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-8" dir="rtl">
      <AdminNav />
      <header className="mb-5 flex items-center gap-2">
        <ShieldCheck className="h-6 w-6 text-primary" aria-hidden="true" />
        <h1 className="text-2xl font-bold text-foreground">إدارة طلبات السحب</h1>
      </header>

      <nav
        className="mb-5 flex flex-wrap gap-1 border-b border-border"
        role="tablist"
        aria-label="فلتر الحالة"
      >
        {(
          [
            { id: "requested", label: "قيد المراجعة" },
            { id: "approved", label: "معتمد" },
            { id: "processing", label: "قيد التحويل" },
            { id: "paid", label: "مدفوع" },
            { id: "rejected", label: "مرفوض" },
            { id: "all", label: "الكل" },
          ] as const
        ).map((it) => (
          <button
            key={it.id}
            type="button"
            role="tab"
            aria-selected={filter === it.id}
            onClick={() => setFilter(it.id)}
            className={
              "border-b-2 px-4 py-2 text-sm font-medium transition focus:outline-none focus:ring-2 focus:ring-primary/40 " +
              (filter === it.id
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground")
            }
          >
            {it.label}
          </button>
        ))}
      </nav>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : rows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-border p-12 text-center text-muted-foreground">
          لا توجد طلبات في هذه الحالة.
        </p>
      ) : (
        <div className="space-y-3">
          {rows.map((w) => (
            <WithdrawalCard key={w.id} w={w} onChange={load} />
          ))}
        </div>
      )}
    </div>
  );
}

function WithdrawalCard({
  w,
  onChange,
}: {
  w: AdminWithdrawalRow;
  onChange: () => void;
}) {
  const { user } = useAuth();
  const [reference, setReference] = useState(w.reference ?? "");
  const [adminNote, setAdminNote] = useState(w.adminNote ?? "");
  const [busy, setBusy] = useState<string | null>(null);

  const handle = async (status: "approved" | "processing" | "paid" | "rejected") => {
    if (!user) return;
    setBusy(status);
    const res = await adminUpdateWithdrawal({
      data: {
        userId: user.id,
        withdrawalId: w.id,
        status,
        reference: reference || undefined,
        adminNote: adminNote || undefined,
      },
    });
    setBusy(null);
    if (!res.ok) {
      toast.error(res.error);
      return;
    }
    toast.success("تم التحديث");
    onChange();
  };

  return (
    <article className="rounded-xl border border-border bg-card p-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-lg font-bold text-foreground">
            د. {w.doctorName ?? "—"}
            {w.doctorSpecialty && (
              <span className="ms-2 text-sm font-normal text-muted-foreground">
                · {w.doctorSpecialty}
              </span>
            )}
          </div>
          <div className="mt-1 text-sm text-muted-foreground">
            طلب بتاريخ{" "}
            {new Date(w.requestedAt).toLocaleDateString("ar-EG", {
              year: "numeric",
              month: "short",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </div>
        </div>
        <div className="text-end">
          <div className="text-2xl font-extrabold text-primary">
            {w.amount.toLocaleString("ar-EG")}{" "}
            <span className="text-sm font-medium text-muted-foreground">{w.currency}</span>
          </div>
          <div className="text-xs text-muted-foreground">{methodLabel(w.method)}</div>
        </div>
      </header>

      {/* Payout details */}
      {w.payoutDetails && (
        <details className="mt-3">
          <summary className="cursor-pointer text-sm font-medium text-primary">
            بيانات التحويل (للنسخ)
          </summary>
          <dl className="mt-2 grid gap-1 rounded-lg bg-muted/40 p-3 text-xs sm:grid-cols-2" dir="ltr">
            {Object.entries(w.payoutDetails).map(([k, v]) =>
              v ? (
                <div key={k} className="flex gap-2">
                  <dt className="font-semibold">{k}:</dt>
                  <dd className="font-mono text-foreground">{String(v)}</dd>
                </div>
              ) : null,
            )}
          </dl>
        </details>
      )}

      {w.doctorNote && (
        <p className="mt-3 rounded-lg bg-muted/40 p-3 text-sm">
          <span className="font-semibold">ملاحظة الطبيب: </span>
          {w.doctorNote}
        </p>
      )}

      {/* Action form */}
      {(w.status === "requested" || w.status === "approved" || w.status === "processing") && (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="font-medium text-foreground">مرجع التحويل</span>
            <input
              type="text"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="رقم التحويل البنكي أو InstaPay"
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
          </label>
          <label className="block text-sm">
            <span className="font-medium text-foreground">ملاحظة الأدمن</span>
            <input
              type="text"
              value={adminNote}
              onChange={(e) => setAdminNote(e.target.value)}
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
          </label>
          <div className="flex flex-wrap gap-2 sm:col-span-2">
            {w.status === "requested" && (
              <>
                <ActionButton
                  onClick={() => handle("approved")}
                  busy={busy === "approved"}
                  cls="bg-sky-600 hover:bg-sky-700"
                >
                  اعتماد
                </ActionButton>
                <ActionButton
                  onClick={() => handle("rejected")}
                  busy={busy === "rejected"}
                  cls="bg-rose-600 hover:bg-rose-700"
                >
                  رفض
                </ActionButton>
              </>
            )}
            {(w.status === "approved" || w.status === "requested") && (
              <ActionButton
                onClick={() => handle("processing")}
                busy={busy === "processing"}
                cls="bg-indigo-600 hover:bg-indigo-700"
              >
                وضع قيد التحويل
              </ActionButton>
            )}
            <ActionButton
              onClick={() => handle("paid")}
              busy={busy === "paid"}
              cls="bg-emerald-600 hover:bg-emerald-700"
            >
              تأكيد الدفع
            </ActionButton>
          </div>
        </div>
      )}

      {(w.status === "paid" || w.status === "rejected" || w.status === "cancelled") && (
        <div className="mt-3 rounded-lg bg-muted/40 p-3 text-sm">
          <span className="font-semibold">الحالة النهائية:</span>{" "}
          {statusLabel(w.status)}
          {w.reference && (
            <span className="ms-2 font-mono text-xs">— مرجع: {w.reference}</span>
          )}
          {w.adminNote && (
            <div className="mt-1 text-xs text-muted-foreground">{w.adminNote}</div>
          )}
        </div>
      )}
    </article>
  );
}

function ActionButton({
  children,
  onClick,
  busy,
  cls,
}: {
  children: React.ReactNode;
  onClick: () => void;
  busy: boolean;
  cls: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className={`inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold text-white disabled:opacity-60 ${cls}`}
    >
      {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
      {children}
    </button>
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

function statusLabel(s: string): string {
  return (
    {
      paid: "تم الدفع",
      rejected: "مرفوض",
      cancelled: "ملغى",
      approved: "معتمد",
      processing: "قيد التحويل",
      requested: "قيد المراجعة",
    }[s] ?? s
  );
}
