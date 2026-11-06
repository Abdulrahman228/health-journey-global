import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { FlaskConical, Loader2, Plus, ShieldCheck, FileText, Eye } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/hooks/useLanguage";
import { PatientShell } from "@/components/patient/PatientNav";
import {
  listActiveLabs,
  listMyLabOrders,
  listMyDoctors,
  createLabOrder,
  setLabOrderAuthorization,
  getLabOrderResults,
  type LabFacility,
  type LabOrder,
  type LabTestType,
  type MyDoctor,
  type PaymentStatus,
  type LabResultFile,
} from "@/lib/labs";
import { toast } from "sonner";

export const Route = createFileRoute("/lab-orders")({
  component: LabOrdersPage,
  head: () => ({ meta: [{ title: "تحاليلي وأشعتي — Tebana" }] }),
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

const TEST_TYPES: { key: LabTestType; ar: string; en: string }[] = [
  { key: "lab_result", ar: "تحليل", en: "Lab test" },
  { key: "xray", ar: "أشعة سينية", en: "X-ray" },
  { key: "mri", ar: "رنين مغناطيسي", en: "MRI" },
  { key: "ct", ar: "أشعة مقطعية", en: "CT" },
  { key: "ecg", ar: "رسم قلب", en: "ECG" },
  { key: "other", ar: "أخرى", en: "Other" },
];

function LabOrdersPage() {
  const { user, profile, isAuthenticated, isLoading } = useAuth();
  const navigate = useNavigate();
  const { t } = useLanguage();

  const [orders, setOrders] = useState<LabOrder[]>([]);
  const [doctors, setDoctors] = useState<MyDoctor[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [results, setResults] = useState<Record<string, LabResultFile[]>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    if (!isLoading && !isAuthenticated) navigate({ to: "/login" });
  }, [isLoading, isAuthenticated, navigate]);

  const load = useCallback(async () => {
    if (!profile?.id) return;
    setLoading(true);
    try {
      const [o, d] = await Promise.all([listMyLabOrders(), listMyDoctors(profile.id)]);
      setOrders(o);
      setDoctors(d);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("Failed to load", "تعذّر التحميل"));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id]);

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

  async function authorize(order: LabOrder, doctorProfileId: string, authorized: boolean) {
    setBusyId(order.id);
    try {
      await setLabOrderAuthorization({ orderId: order.id, doctorProfileId, authorized });
      toast.success(
        authorized
          ? t("Doctor authorized", "تم تفويض الطبيب")
          : t("Authorization revoked", "تم إلغاء التفويض"),
      );
      await load();
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
    <PatientShell>
      <div>
        <div className="mb-6 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-teal/15 text-teal">
              <FlaskConical className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">
                {t("My tests & imaging", "تحاليلي وأشعتي")}
              </h1>
              <p className="text-sm text-muted-foreground">
                {t(
                  "Order tests, authorize your doctor, view results.",
                  "اطلب التحاليل، فوّض طبيبك، واطّلع على النتائج.",
                )}
              </p>
            </div>
          </div>
          <button
            onClick={() => setShowForm((s) => !s)}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" />
            {t("New order", "طلب جديد")}
          </button>
        </div>

        {showForm && (
          <NewOrderForm
            doctors={doctors}
            onDone={async () => {
              setShowForm(false);
              await load();
            }}
          />
        )}

        {orders.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-card/50 p-12 text-center text-muted-foreground">
            {t("No orders yet.", "لا توجد طلبات بعد.")}
          </div>
        ) : (
          <div className="space-y-4">
            {orders.map((o) => {
              const pay = PAYMENT_LABEL[o.payment_status];
              const busy = busyId === o.id;
              const files = results[o.id];
              const testName = TEST_TYPES.find((x) => x.key === o.test_type);
              return (
                <div key={o.id} className="rounded-2xl border border-border bg-card p-5">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-foreground">
                          {o.lab?.name || t("Lab", "معمل")}
                        </span>
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${pay.cls}`}>
                          {t(pay.en, pay.ar)}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {testName ? t(testName.en, testName.ar) : o.test_type}
                        {o.test_name ? ` — ${o.test_name}` : ""}
                      </p>
                    </div>
                  </div>

                  {/* Authorize a treating doctor */}
                  <div className="mt-3 border-t border-border pt-3">
                    {o.patient_authorized && o.doctor?.full_name ? (
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="inline-flex items-center gap-1.5 text-sm text-emerald-600 dark:text-emerald-400">
                          <ShieldCheck className="h-4 w-4" />
                          {t("Shared with", "مشارَك مع")} {o.doctor.full_name}
                        </span>
                        <button
                          disabled={busy}
                          onClick={() => authorize(o, o.authorized_doctor_profile_id!, false)}
                          className="rounded-lg border border-border px-3 py-1.5 text-xs hover:bg-accent disabled:opacity-60"
                        >
                          {t("Revoke", "إلغاء المشاركة")}
                        </button>
                      </div>
                    ) : (
                      <AuthorizeRow
                        doctors={doctors}
                        busy={busy}
                        onAuthorize={(pid) => authorize(o, pid, true)}
                        t={t}
                      />
                    )}
                  </div>

                  {/* View results (only meaningful once paid) */}
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <button
                      disabled={busy}
                      onClick={() => viewResults(o)}
                      className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-1.5 text-sm font-medium hover:bg-accent disabled:opacity-60"
                    >
                      {busy ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                      {t("View results", "عرض النتائج")}
                    </button>
                    {o.payment_status !== "paid" && (
                      <span className="text-xs text-muted-foreground">
                        {t(
                          "Results are released once the lab marks payment as paid.",
                          "تُكشف النتائج بمجرد أن يعلّم المعمل الدفع كمكتمل.",
                        )}
                      </span>
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
    </PatientShell>
  );
}

function AuthorizeRow({
  doctors,
  busy,
  onAuthorize,
  t,
}: {
  doctors: MyDoctor[];
  busy: boolean;
  onAuthorize: (doctorProfileId: string) => void;
  t: (en: string, ar: string) => string;
}) {
  const [sel, setSel] = useState("");
  if (doctors.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        {t(
          "Book with a doctor first to share results with them.",
          "احجز مع طبيب أولاً لتتمكن من مشاركة النتائج معه.",
        )}
      </p>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <select
        value={sel}
        onChange={(e) => setSel(e.target.value)}
        className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
      >
        <option value="">{t("Authorize a doctor…", "فوّض طبيباً…")}</option>
        {doctors.map((d) => (
          <option key={d.profileId} value={d.profileId}>
            {d.fullName || t("Doctor", "طبيب")}
          </option>
        ))}
      </select>
      <button
        disabled={busy || !sel}
        onClick={() => sel && onAuthorize(sel)}
        className="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
      >
        {t("Share", "مشاركة")}
      </button>
    </div>
  );
}

function NewOrderForm({ doctors, onDone }: { doctors: MyDoctor[]; onDone: () => void }) {
  const { t } = useLanguage();
  const [labs, setLabs] = useState<LabFacility[]>([]);
  const [city, setCity] = useState("");
  const [labId, setLabId] = useState("");
  const [testType, setTestType] = useState<LabTestType>("lab_result");
  const [testName, setTestName] = useState("");
  const [doctorId, setDoctorId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [searching, setSearching] = useState(false);

  const searchLabs = useCallback(async () => {
    setSearching(true);
    try {
      setLabs(await listActiveLabs(city));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("Failed to load", "تعذّر التحميل"));
    } finally {
      setSearching(false);
    }
  }, [city]);

  useEffect(() => {
    void searchLabs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!labId) {
      toast.error(t("Choose a lab", "اختر معملاً"));
      return;
    }
    setSubmitting(true);
    try {
      await createLabOrder({
        labId,
        testType,
        testName: testName.trim() || undefined,
        authorizedDoctorProfileId: doctorId || null,
      });
      toast.success(t("Order created", "تم إنشاء الطلب"));
      onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("Failed", "فشل"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} className="mb-6 space-y-4 rounded-2xl border border-border bg-card p-5">
      <div>
        <label className="mb-1.5 block text-sm font-medium text-foreground">
          {t("Find a lab (by city)", "ابحث عن معمل (بالمدينة)")}
        </label>
        <div className="flex gap-2">
          <input
            value={city}
            onChange={(e) => setCity(e.target.value)}
            placeholder={t("City", "المدينة")}
            className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
          />
          <button
            type="button"
            onClick={() => void searchLabs()}
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium hover:bg-accent"
          >
            {searching ? <Loader2 className="h-4 w-4 animate-spin" /> : t("Search", "بحث")}
          </button>
        </div>
      </div>

      <div>
        <label className="mb-1.5 block text-sm font-medium text-foreground">
          {t("Lab / center", "المعمل / المركز")} *
        </label>
        <select
          value={labId}
          onChange={(e) => setLabId(e.target.value)}
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
        >
          <option value="">{t("Choose…", "اختر…")}</option>
          {labs.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
              {l.city ? ` — ${l.city}` : ""}
              {l.is_verified ? " ✓" : ""}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className="mb-1.5 block text-sm font-medium text-foreground">
          {t("Test type", "نوع الفحص")}
        </label>
        <div className="grid grid-cols-3 gap-2">
          {TEST_TYPES.map((tp) => {
            const active = testType === tp.key;
            return (
              <button
                type="button"
                key={tp.key}
                onClick={() => setTestType(tp.key)}
                className={`rounded-lg border px-2 py-2 text-sm font-medium transition-colors ${
                  active
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-background hover:bg-accent"
                }`}
              >
                {t(tp.en, tp.ar)}
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <label className="mb-1.5 block text-sm font-medium text-foreground">
          {t("Test name (optional)", "اسم الفحص (اختياري)")}
        </label>
        <input
          value={testName}
          onChange={(e) => setTestName(e.target.value)}
          placeholder={t("e.g. CBC, Chest X-ray", "مثال: صورة دم كاملة، أشعة صدر")}
          className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
        />
      </div>

      {doctors.length > 0 && (
        <div>
          <label className="mb-1.5 block text-sm font-medium text-foreground">
            {t("Share result with (optional)", "مشاركة النتيجة مع (اختياري)")}
          </label>
          <select
            value={doctorId}
            onChange={(e) => setDoctorId(e.target.value)}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/40"
          >
            <option value="">{t("No one for now", "لا أحد حالياً")}</option>
            {doctors.map((d) => (
              <option key={d.profileId} value={d.profileId}>
                {d.fullName || t("Doctor", "طبيب")}
              </option>
            ))}
          </select>
        </div>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
      >
        {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
        {t("Create order", "إنشاء الطلب")}
      </button>
    </form>
  );
}
