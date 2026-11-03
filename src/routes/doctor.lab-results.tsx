import { createFileRoute, redirect } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { FlaskConical, Loader2, FileText, Eye, Lock } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/hooks/useLanguage";
import {
  listAuthorizedLabOrders,
  getLabOrderResults,
  type LabOrder,
  type PaymentStatus,
  type LabResultFile,
} from "@/lib/labs";
import { toast } from "sonner";
import { DoctorShell } from "@/components/doctor/DoctorNav";

export const Route = createFileRoute("/doctor/lab-results")({
  component: DoctorLabResultsPage,
  head: () => ({ meta: [{ title: "نتائج التحاليل المُشاركة — Tebana" }] }),
});

const PAYMENT_LABEL: Record<PaymentStatus, { ar: string; en: string; cls: string }> = {
  paid: { ar: "مدفوع", en: "Paid", cls: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" },
  partial: { ar: "مدفوع جزئياً", en: "Partial", cls: "bg-amber-500/15 text-amber-600 dark:text-amber-400" },
  unpaid: { ar: "غير مدفوع", en: "Unpaid", cls: "bg-rose-500/15 text-rose-600 dark:text-rose-400" },
};

function DoctorLabResultsPage() {
  const { user, isAuthenticated, isLoading } = useAuth();
  const { t } = useLanguage();

  const [orders, setOrders] = useState<LabOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [results, setResults] = useState<Record<string, LabResultFile[]>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  if (!isLoading && !isAuthenticated) {
    throw redirect({ to: "/login" });
  }

  const load = useCallback(async () => {
    setLoading(true);
    setOrders(await listAuthorizedLabOrders());
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function viewResults(order: LabOrder) {
    if (!user) return;
    setBusyId(order.id);
    try {
      const files = await getLabOrderResults({ data: { userId: user.id, orderId: order.id } });
      setResults((prev) => ({ ...prev, [order.id]: files }));
      if (files.length === 0) {
        toast.info(t("No results available yet.", "لا توجد نتائج متاحة بعد."));
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("Failed", "فشل"));
    } finally {
      setBusyId(null);
    }
  }

  if (isLoading || loading) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-12">
        <div className="h-64 animate-pulse rounded-2xl bg-muted" />
      </div>
    );
  }

  return (
    <DoctorShell>
      <div>
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-teal/15 text-teal">
          <FlaskConical className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground">{t("Shared lab results", "نتائج التحاليل المُشاركة")}</h1>
          <p className="text-sm text-muted-foreground">{t("Results your patients authorized you to read.", "النتائج التي فوّضك مرضاك بالاطّلاع عليها.")}</p>
        </div>
      </div>

      {orders.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card/50 p-12 text-center text-muted-foreground">
          {t("No shared results yet.", "لا توجد نتائج مُشاركة بعد.")}
        </div>
      ) : (
        <div className="space-y-4">
          {orders.map((o) => {
            const pay = PAYMENT_LABEL[o.payment_status];
            const busy = busyId === o.id;
            const files = results[o.id];
            const locked = o.payment_status !== "paid";
            return (
              <div key={o.id} className="rounded-2xl border border-border bg-card p-5">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-foreground">{o.patient?.full_name || t("Patient", "مريض")}</span>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${pay.cls}`}>{t(pay.en, pay.ar)}</span>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {o.lab?.name || t("Lab", "معمل")}
                      {o.test_name ? ` — ${o.test_name}` : ""}
                    </p>
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {locked ? (
                    <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                      <Lock className="h-3.5 w-3.5" />
                      {t("Available once the lab confirms payment.", "متاحة بمجرد تأكيد المعمل للدفع.")}
                    </span>
                  ) : (
                    <button
                      disabled={busy}
                      onClick={() => viewResults(o)}
                      className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-1.5 text-sm font-medium hover:bg-accent disabled:opacity-60"
                    >
                      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Eye className="h-4 w-4" />}
                      {t("View results", "عرض النتائج")}
                    </button>
                  )}
                </div>

                {files && files.length > 0 && (
                  <div className="mt-3 space-y-2">
                    {files.map((f) => (
                      <a
                        key={f.id}
                        href={f.signedUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm hover:bg-accent"
                      >
                        <FileText className="h-4 w-4 text-primary" />
                        <span className="truncate">{f.fileName}</span>
                      </a>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      </div>
    </DoctorShell>
  );
}
