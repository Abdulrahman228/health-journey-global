import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import {
  FlaskConical,
  Loader2,
  Upload,
  FileText,
  CheckCircle2,
  Clock,
  XCircle,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/hooks/useLanguage";
import {
  getMyLab,
  listLabInboxOrders,
  labUpdateOrder,
  uploadLabResult,
  type LabFacility,
  type LabOrder,
  type PaymentStatus,
} from "@/lib/labs";
import { toast } from "sonner";

export const Route = createFileRoute("/lab/dashboard")({
  component: LabDashboardPage,
  head: () => ({ meta: [{ title: "لوحة المعمل — Tebana" }] }),
});

const PAYMENT_LABEL: Record<PaymentStatus, { ar: string; en: string; cls: string }> = {
  paid: {
    ar: "مدفوع",
    en: "Paid",
    cls: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  },
  partial: {
    ar: "مدفوع جزئياً",
    en: "Partial",
    cls: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  },
  unpaid: { ar: "غير مدفوع", en: "Unpaid", cls: "bg-rose-500/15 text-rose-600 dark:text-rose-400" },
};

function LabDashboardPage() {
  const { user, profile, isAuthenticated, isLoading } = useAuth();
  const navigate = useNavigate();
  const { t } = useLanguage();

  const [lab, setLab] = useState<LabFacility | null>(null);
  const [orders, setOrders] = useState<LabOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) navigate({ to: "/login" });
  }, [isLoading, isAuthenticated, navigate]);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const myLab = await getMyLab(user.id);
      setLab(myLab);
      if (myLab) setOrders(await listLabInboxOrders());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("Failed to load", "تعذّر التحميل"));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  async function setPayment(order: LabOrder, paymentStatus: PaymentStatus) {
    setBusyId(order.id);
    try {
      await labUpdateOrder({ orderId: order.id, paymentStatus });
      toast.success(t("Payment status updated", "تم تحديث حالة الدفع"));
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("Failed", "فشل"));
    } finally {
      setBusyId(null);
    }
  }

  async function onUpload(order: LabOrder, file: File) {
    if (!profile?.id) return;
    setBusyId(order.id);
    try {
      await uploadLabResult({
        orderId: order.id,
        patientProfileId: order.patient_profile_id,
        labProfileId: profile.id,
        testType: order.test_type,
        file,
      });
      toast.success(t("Result uploaded & delivered", "تم رفع النتيجة وتسليمها"));
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("Upload failed", "فشل الرفع"));
    } finally {
      setBusyId(null);
    }
  }

  if (isLoading || loading) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-12">
        <div className="h-64 animate-pulse rounded-2xl bg-muted" />
      </div>
    );
  }

  if (!lab) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <FlaskConical className="mx-auto h-12 w-12 text-muted-foreground" />
        <h1 className="mt-4 text-2xl font-bold text-foreground">
          {t("No facility yet", "لا توجد منشأة بعد")}
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {t(
            "Register your lab or radiology center to start receiving orders.",
            "سجّل معملك أو مركز الأشعة لتبدأ استقبال الطلبات.",
          )}
        </p>
        <Link
          to="/lab/register"
          className="mt-4 inline-block rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          {t("Register facility", "تسجيل المنشأة")}
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-teal/15 text-teal">
          <FlaskConical className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground">{lab.name}</h1>
          <p className="text-sm text-muted-foreground">
            {t("Orders inbox", "صندوق الطلبات")} · {orders.length}
            {!lab.is_verified && (
              <span className="ms-2 rounded-full bg-amber-500/15 px-2 py-0.5 text-xs text-amber-600 dark:text-amber-400">
                {t("Pending verification", "قيد التوثيق")}
              </span>
            )}
          </p>
        </div>
      </div>

      {orders.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card/50 p-12 text-center text-muted-foreground">
          {t("No orders yet.", "لا توجد طلبات بعد.")}
        </div>
      ) : (
        <div className="space-y-4">
          {orders.map((o) => {
            const pay = PAYMENT_LABEL[o.payment_status];
            const busy = busyId === o.id;
            return (
              <div key={o.id} className="rounded-2xl border border-border bg-card p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-foreground">
                        {o.patient?.full_name || t("Patient", "مريض")}
                      </span>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${pay.cls}`}>
                        {t(pay.en, pay.ar)}
                      </span>
                      <StatusBadge status={o.status} t={t} />
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {testLabel(o.test_type, t)}
                      {o.test_name ? ` — ${o.test_name}` : ""}
                    </p>
                    {o.doctor?.full_name && o.patient_authorized && (
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {t("Authorized doctor:", "الطبيب المفوَّض:")} {o.doctor.full_name}
                      </p>
                    )}
                    {(o.amount != null || o.amount_paid > 0) && (
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {t("Amount:", "المبلغ:")} {o.amount ?? "—"}
                        {o.amount_paid > 0 ? ` · ${t("paid", "مدفوع")}: ${o.amount_paid}` : ""}
                      </p>
                    )}
                  </div>
                </div>

                {/* Payment control (lab is the source of truth) */}
                <div className="mt-4 border-t border-border pt-3">
                  <p className="mb-2 text-xs font-medium text-muted-foreground">
                    {t("Set payment status", "تحديد حالة الدفع")}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {(["paid", "partial", "unpaid"] as PaymentStatus[]).map((ps) => {
                      const active = o.payment_status === ps;
                      const lbl = PAYMENT_LABEL[ps];
                      return (
                        <button
                          key={ps}
                          disabled={busy || active}
                          onClick={() => setPayment(o, ps)}
                          className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-60 ${
                            active
                              ? "border-primary bg-primary/10 text-primary"
                              : "border-border bg-background hover:bg-accent"
                          }`}
                        >
                          {t(lbl.en, lbl.ar)}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Result upload */}
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-border bg-background px-3 py-1.5 text-sm font-medium hover:bg-accent">
                    {busy ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Upload className="h-4 w-4" />
                    )}
                    {t("Upload result", "رفع النتيجة")}
                    <input
                      type="file"
                      accept="image/*,application/pdf"
                      className="hidden"
                      disabled={busy}
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) void onUpload(o, f);
                        e.target.value = "";
                      }}
                    />
                  </label>
                  {o.status === "delivered" && (
                    <span className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
                      <FileText className="h-3.5 w-3.5" /> {t("Delivered", "تم التسليم")}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function StatusBadge({
  status,
  t,
}: {
  status: LabOrder["status"];
  t: (en: string, ar: string) => string;
}) {
  const map = {
    requested: { icon: Clock, ar: "مطلوب", en: "Requested", cls: "text-muted-foreground" },
    in_progress: { icon: Loader2, ar: "قيد التنفيذ", en: "In progress", cls: "text-blue-500" },
    delivered: {
      icon: CheckCircle2,
      ar: "تم التسليم",
      en: "Delivered",
      cls: "text-emerald-600 dark:text-emerald-400",
    },
    cancelled: { icon: XCircle, ar: "ملغي", en: "Cancelled", cls: "text-rose-500" },
  } as const;
  const s = map[status];
  const Icon = s.icon;
  return (
    <span className={`inline-flex items-center gap-1 text-xs ${s.cls}`}>
      <Icon className="h-3.5 w-3.5" /> {t(s.en, s.ar)}
    </span>
  );
}

function testLabel(type: LabOrder["test_type"], t: (en: string, ar: string) => string) {
  const map: Record<LabOrder["test_type"], [string, string]> = {
    lab_result: ["Lab test", "تحليل"],
    xray: ["X-ray", "أشعة سينية"],
    mri: ["MRI", "رنين مغناطيسي"],
    ct: ["CT", "أشعة مقطعية"],
    ecg: ["ECG", "رسم قلب"],
    other: ["Other", "أخرى"],
  };
  const [en, ar] = map[type];
  return t(en, ar);
}
