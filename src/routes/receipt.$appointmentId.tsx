/**
 * /receipt/$appointmentId — printable proof-of-payment receipt.
 *
 * Authorized access only (patient on the appointment, doctor on it, or admin).
 * Print stylesheet hides chrome and yields a clean A4 layout.
 * noindex, nofollow — private financial data.
 */
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import {
  getAppointmentReceipt,
  type AppointmentReceipt,
} from "@/lib/payments.functions";
import { AlertTriangle, Loader2, Printer, ShieldCheck } from "lucide-react";

export const Route = createFileRoute("/receipt/$appointmentId")({
  head: () => ({
    meta: [
      { title: "إيصال دفع | طبيبي" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: ReceiptPage,
});

function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat("ar-EG", {
      style: "currency",
      currency: currency || "EGP",
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}

function formatDateTimeAr(iso: string | null): string {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("ar-EG", {
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function StatusBadge({ status }: { status: AppointmentReceipt["status"] }) {
  const map: Record<AppointmentReceipt["status"], { ar: string; cls: string }> = {
    paid: { ar: "مدفوع", cls: "bg-emerald-100 text-emerald-900 border-emerald-300" },
    refunded: { ar: "مُسترد بالكامل", cls: "bg-rose-100 text-rose-900 border-rose-300" },
    partially_refunded: {
      ar: "مُسترد جزئياً",
      cls: "bg-amber-100 text-amber-900 border-amber-300",
    },
    pending: { ar: "قيد الدفع", cls: "bg-slate-100 text-slate-800 border-slate-300" },
    failed: { ar: "فشل", cls: "bg-red-100 text-red-900 border-red-300" },
  };
  const meta = map[status] ?? map.pending;
  return (
    <span
      className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-bold ${meta.cls}`}
    >
      {meta.ar}
    </span>
  );
}

function ReceiptPage() {
  const { appointmentId } = Route.useParams();
  const { user, isLoading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [data, setData] = useState<AppointmentReceipt | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      navigate({ to: "/login" });
      return;
    }
    let cancelled = false;
    (async () => {
      const view = await getAppointmentReceipt({
        data: { userId: user.id, appointmentId },
      });
      if (cancelled) return;
      if (!view) {
        setNotFound(true);
      } else {
        setData(view);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [authLoading, user, appointmentId, navigate]);

  if (authLoading || loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (notFound || !data) {
    return (
      <div className="mx-auto max-w-md px-4 py-24 text-center">
        <AlertTriangle className="mx-auto h-12 w-12 text-destructive" aria-hidden="true" />
        <h1 className="mt-4 text-xl font-bold">الإيصال غير متاح</h1>
        <p className="mt-2 text-muted-foreground">
          إما أن الدفع لم يكتمل، أو ليس لديك صلاحية الاطلاع على هذا الإيصال.
        </p>
        <Link
          to="/appointments"
          className="mt-6 inline-flex items-center rounded-lg border px-4 py-2 text-sm font-semibold hover:bg-muted"
        >
          العودة إلى مواعيدي
        </Link>
      </div>
    );
  }

  const visitTypeAr =
    data.appointmentType === "online" || data.appointmentType === "telehealth"
      ? "كشف أونلاين"
      : "زيارة عيادة";

  return (
    <div className="receipt-page mx-auto max-w-3xl px-6 py-8 print:p-0">
      {/* Toolbar — hidden on print */}
      <div className="receipt-toolbar mb-6 flex items-center justify-between print:hidden">
        <h1 className="text-xl font-bold text-foreground">إيصال دفع</h1>
        <div className="flex items-center gap-2">
          <Link
            to="/appointments"
            className="inline-flex items-center rounded-lg border px-4 py-2 text-sm font-semibold hover:bg-muted"
          >
            مواعيدي
          </Link>
          <button
            type="button"
            onClick={() => window.print()}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
          >
            <Printer className="h-4 w-4" aria-hidden="true" />
            طباعة / حفظ PDF
          </button>
        </div>
      </div>

      <article className="receipt-sheet rounded-xl border border-border bg-white p-8 text-slate-900 shadow-sm print:border-0 print:shadow-none">
        {/* Header */}
        <header className="flex items-start justify-between border-b-2 border-slate-900 pb-4">
          <div>
            <div className="text-lg font-extrabold tracking-tight">طبيبي · Tabibi</div>
            <div className="mt-0.5 text-xs text-slate-600">
              منصة الرعاية الصحية الموحّدة
            </div>
            <div className="mt-4 text-xs text-slate-500">
              منصة الكترونية · مسجلة في جمهورية مصر العربية
            </div>
          </div>
          <div className="text-end">
            <div className="text-xs text-slate-500">رقم الإيصال</div>
            <div className="font-mono text-base font-bold">{data.receiptNumber}</div>
            <div className="mt-3 text-xs text-slate-500">تاريخ الدفع</div>
            <div className="text-sm">{formatDateTimeAr(data.paidAt)}</div>
            <div className="mt-3">
              <StatusBadge status={data.status} />
            </div>
          </div>
        </header>

        {/* Parties */}
        <section className="mt-5 grid grid-cols-2 gap-4 rounded-lg bg-slate-50 p-4 text-sm">
          <div>
            <div className="text-xs uppercase tracking-wide text-slate-500">المريض</div>
            <div className="mt-0.5 font-semibold">{data.patientName ?? "—"}</div>
          </div>
          <div>
            <div className="text-xs uppercase tracking-wide text-slate-500">الطبيب</div>
            <div className="mt-0.5 font-semibold">د. {data.doctorName ?? "—"}</div>
            {data.doctorSpecialty && (
              <div className="text-xs text-slate-600">{data.doctorSpecialty}</div>
            )}
            {data.doctorSyndicate && (
              <div className="mt-0.5 text-xs text-slate-500">
                نقابة الأطباء: {data.doctorSyndicate}
              </div>
            )}
          </div>
        </section>

        {/* Visit + amount */}
        <section className="mt-4 text-sm">
          <div className="rounded-lg border border-slate-200 p-4">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-xs text-slate-500">نوع الزيارة</div>
                <div className="mt-0.5 font-semibold">{visitTypeAr}</div>
              </div>
              <div className="text-end">
                <div className="text-xs text-slate-500">موعد الزيارة</div>
                <div className="mt-0.5 font-semibold">
                  {formatDateTimeAr(data.scheduledAt)}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Amount table */}
        <section className="mt-5">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="border-b border-slate-300">
                <th scope="col" className="py-2 text-start font-semibold">
                  البند
                </th>
                <th scope="col" className="py-2 text-end font-semibold">
                  المبلغ
                </th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-slate-200">
                <td className="py-2">رسوم الزيارة</td>
                <td className="py-2 text-end font-semibold">
                  {formatMoney(data.fee, data.currency)}
                </td>
              </tr>
              {data.refundedAmount > 0 && (
                <tr className="border-b border-slate-200 text-rose-700">
                  <td className="py-2">
                    قيمة الاسترداد
                    {data.refundedAt && (
                      <span className="block text-xs text-slate-500">
                        بتاريخ {formatDateTimeAr(data.refundedAt)}
                      </span>
                    )}
                  </td>
                  <td className="py-2 text-end font-semibold">
                    − {formatMoney(data.refundedAmount, data.currency)}
                  </td>
                </tr>
              )}
              <tr className="border-t-2 border-slate-900 bg-slate-50">
                <td className="py-3 text-base font-bold">الصافي المدفوع</td>
                <td className="py-3 text-end text-base font-bold">
                  {formatMoney(data.netPaid, data.currency)}
                </td>
              </tr>
            </tbody>
          </table>
        </section>

        {/* Payment metadata */}
        <section className="mt-5 grid grid-cols-2 gap-4 rounded-lg bg-slate-50 p-4 text-xs text-slate-700">
          <div>
            <div className="text-slate-500">طريقة الدفع</div>
            <div className="mt-0.5 font-semibold">
              {data.paymentProvider === "stripe" ? "بطاقة بنكية (Stripe)" : data.paymentProvider}
            </div>
          </div>
          {data.paymentReference && (
            <div>
              <div className="text-slate-500">المرجع</div>
              <div className="mt-0.5 font-mono">{data.paymentReference}</div>
            </div>
          )}
          {data.environment && (
            <div>
              <div className="text-slate-500">البيئة</div>
              <div className="mt-0.5 font-semibold">
                {data.environment === "live" ? "إنتاج" : "تجريبية (Sandbox)"}
              </div>
            </div>
          )}
        </section>

        {/* Footer */}
        <footer className="mt-8 flex items-end justify-between border-t border-slate-300 pt-5 text-xs text-slate-600">
          <div className="max-w-md">
            <div className="flex items-start gap-1.5">
              <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>
                هذا الإيصال صادر إلكترونياً من منصة طبيبي. يُستخدم كإثبات دفع غير
                ضريبي. الفاتورة الضريبية الإلكترونية (ETA) — إن وجبت — تصدر منفصلة.
              </span>
            </div>
            <div className="mt-3 text-slate-500">
              للاستفسارات: support@mytabibi.com · mytabibi.com
            </div>
          </div>
          <div className="text-end">
            <div className="font-mono text-[11px] text-slate-400">
              ID: {data.appointmentId.slice(0, 8)}…
            </div>
          </div>
        </footer>
      </article>

      {/* Print styles — A4 portrait, no chrome. */}
      <style>{`
        @media print {
          @page { size: A4 portrait; margin: 14mm; }
          body { background: white !important; }
          .receipt-page { padding: 0 !important; max-width: none !important; }
          .receipt-toolbar { display: none !important; }
          .receipt-sheet { box-shadow: none !important; border: 0 !important; }
          a[href]:after { content: ""; }
        }
      `}</style>
    </div>
  );
}
