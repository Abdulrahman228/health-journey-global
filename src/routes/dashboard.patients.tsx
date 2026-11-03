/**
 * /dashboard/patients — doctor's patient roster.
 *
 * Lists all patients the logged-in doctor has ever treated (across
 * medical_records + appointments), with quick search by name or ID.
 * Clicking a row opens /dashboard/patient/$id for full history.
 *
 * Private page — noindex, nofollow.
 */
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { searchMyPatients, addManagedPatient, importManagedPatients } from "@/lib/emr.functions";
import { Loader2, Search, User, Stethoscope, UserPlus, Upload, X } from "lucide-react";
import { toast } from "sonner";

/** Parse a simple CSV of patients: columns name, phone, city (header optional). */
function parseCsv(text: string): { fullName: string; phone: string; city: string }[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return [];
  const first = lines[0].toLowerCase();
  const hasHeader =
    first.includes("name") ||
    first.includes("اسم") ||
    first.includes("phone") ||
    first.includes("هاتف");
  const dataLines = hasHeader ? lines.slice(1) : lines;
  return dataLines
    .map((line) => {
      const cols = line.split(",").map((c) => c.trim());
      return { fullName: cols[0] ?? "", phone: cols[1] ?? "", city: cols[2] ?? "" };
    })
    .filter((r) => r.fullName.length > 0);
}

export const Route = createFileRoute("/dashboard/patients")({
  head: () => ({
    meta: [
      { title: "مرضائي | لوحة الطبيب — طبانا" },
      { name: "description", content: "إدارة مرضى الطبيب وعرض تاريخهم الطبي." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: PatientsRosterPage,
});

interface PatientCard {
  id: string;
  fullName: string;
  avatarUrl: string | null;
  city: string | null;
  lastSeen: string | null;
}

function PatientsRosterPage() {
  const { user, isLoading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [rows, setRows] = useState<PatientCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [city, setCity] = useState("");
  const [dob, setDob] = useState("");
  const [notify, setNotify] = useState(true);
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [pendingImport, setPendingImport] = useState<{
    fileName: string;
    patients: { fullName: string; phone: string; city: string }[];
  } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = useCallback(
    async (qStr: string) => {
      if (!user) return;
      setLoading(true);
      try {
        const data = await searchMyPatients({ data: { userId: user.id, q: qStr } });
        setRows(data as PatientCard[]);
      } finally {
        setLoading(false);
      }
    },
    [user],
  );

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      navigate({ to: "/login" });
      return;
    }
    load("");
  }, [authLoading, user, navigate, load]);

  // Debounced search
  useEffect(() => {
    const t = setTimeout(() => load(q), 250);
    return () => clearTimeout(t);
  }, [q, load]);

  async function handleAddPatient() {
    if (!user) return;
    if (!fullName.trim()) {
      toast.error("أدخل اسم المريض");
      return;
    }
    setSaving(true);
    try {
      const res = (await addManagedPatient({
        data: { userId: user.id, fullName, phone, city, dateOfBirth: dob, notify },
      })) as { id: string; queued: number; hasPhone: boolean };
      if (res.queued > 0) {
        toast.success("تمت إضافة المريض وسيتم إرسال رسالة ترحيب له (واتساب/SMS)");
      } else if (notify && phone.trim() && !res.hasPhone) {
        toast.warning("تمت إضافة المريض، لكن رقم الهاتف غير صالح فلن تُرسل رسالة");
      } else {
        toast.success("تمت إضافة المريض");
      }
      setShowAdd(false);
      setFullName("");
      setPhone("");
      setCity("");
      setDob("");
      setNotify(true);
      load("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذّرت إضافة المريض");
    } finally {
      setSaving(false);
    }
  }

  async function handleCsvFile(file: File) {
    const patients = parseCsv(await file.text());
    if (patients.length === 0) {
      toast.error("لم أجد صفوفًا صالحة في الملف (العمود الأول = الاسم)");
      return;
    }
    // Review + consent attestation before anything is written or sent.
    setPendingImport({ fileName: file.name, patients });
  }

  async function confirmImport() {
    if (!user || !pendingImport) return;
    setImporting(true);
    try {
      const res = (await importManagedPatients({
        data: { userId: user.id, patients: pendingImport.patients, consentAttested: true },
      })) as { inserted: number; linked: number; queued: number; withoutPhone: number };
      const parts = [`تم استيراد ${res.inserted} مريض`];
      if (res.linked > 0) parts.push(`وربط ${res.linked} مريض موجود مسبقاً`);
      if (res.queued > 0) parts.push(`وجدولة ${res.queued} رسالة ترحيب`);
      if (res.withoutPhone > 0) parts.push(`(${res.withoutPhone} بدون رقم هاتف صالح)`);
      toast.success(parts.join(" "));
      setPendingImport(null);
      load("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذّر استيراد الملف");
    } finally {
      setImporting(false);
    }
  }

  const empty = !loading && rows.length === 0;

  const subtitle = useMemo(
    () => (q ? `${rows.length} نتيجة بحث` : `${rows.length} مريض في سجلك`),
    [q, rows.length],
  );

  if (authLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div>
      <header className="mb-8 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-foreground">مرضائي</h1>
          <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setShowAdd(true)}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition hover:opacity-90"
          >
            <UserPlus className="h-4 w-4" /> إضافة مريض
          </button>
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={importing}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium text-foreground transition hover:bg-accent disabled:opacity-50"
          >
            {importing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Upload className="h-4 w-4" />
            )}
            استيراد CSV
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleCsvFile(f);
              e.target.value = "";
            }}
          />
        </div>
      </header>

      <div className="relative mb-6">
        <Search
          className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <label className="sr-only" htmlFor="patient-search">
          ابحث عن مريض
        </label>
        <input
          id="patient-search"
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="ابحث بالاسم أو معرّف المريض…"
          className="w-full rounded-lg border border-border bg-card py-2.5 ps-10 pe-3 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
        />
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : empty ? (
        <div className="rounded-xl border border-dashed border-border bg-card py-16 text-center">
          <Stethoscope className="mx-auto h-10 w-10 text-muted-foreground/60" aria-hidden="true" />
          <p className="mt-3 font-medium text-foreground">
            {q ? "لا يوجد مرضى مطابقون" : "لم تستقبل أي مرضى بعد"}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            عندما يحجز مريض موعد معك، سيظهر هنا تلقائياً.
          </p>
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" role="list">
          {rows.map((p) => (
            <li key={p.id}>
              <Link
                to="/dashboard/patient/$id"
                params={{ id: p.id }}
                className="flex h-full items-center gap-3 rounded-xl border border-border bg-card p-4 transition hover:border-primary hover:shadow-md focus:outline-none focus:ring-2 focus:ring-primary"
              >
                {p.avatarUrl ? (
                  <img
                    src={p.avatarUrl}
                    alt=""
                    width={48}
                    height={48}
                    loading="lazy"
                    decoding="async"
                    className="h-12 w-12 rounded-full object-cover"
                  />
                ) : (
                  <div
                    className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10"
                    aria-hidden="true"
                  >
                    <User className="h-5 w-5 text-primary" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold text-foreground">
                    {p.fullName || "بدون اسم"}
                  </div>
                  <div className="truncate text-xs text-muted-foreground">
                    {p.city ? `${p.city} · ` : ""}
                    {p.lastSeen
                      ? `آخر زيارة ${new Date(p.lastSeen).toLocaleDateString("ar-EG")}`
                      : "—"}
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {showAdd && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => !saving && setShowAdd(false)}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-card p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-bold text-foreground">إضافة مريض</h2>
              <button
                type="button"
                onClick={() => setShowAdd(false)}
                className="rounded-lg p-1 text-muted-foreground hover:bg-accent"
                aria-label="إغلاق"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="mb-1 block text-sm font-medium text-foreground">
                  الاسم الكامل <span className="text-destructive">*</span>
                </label>
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="اسم المريض"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-foreground">رقم الهاتف</label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="مثال: 010XXXXXXXX"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-1 block text-sm font-medium text-foreground">المدينة</label>
                  <input
                    type="text"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    placeholder="المدينة"
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-foreground">
                    تاريخ الميلاد
                  </label>
                  <input
                    type="date"
                    value={dob}
                    onChange={(e) => setDob(e.target.value)}
                    className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                  />
                </div>
              </div>
            </div>
            <label className="mt-4 flex items-start gap-2 rounded-lg border border-border bg-muted/40 p-3 text-xs leading-relaxed text-foreground">
              <input
                type="checkbox"
                checked={notify}
                onChange={(e) => setNotify(e.target.checked)}
                className="mt-0.5 h-4 w-4 rounded border-border"
              />
              <span>
                إرسال رسالة ترحيب تلقائية للمريض (واتساب أو SMS) تخبره أنه مسجّل لديك مع رابط لتحميل
                التطبيق واستكمال بياناته. بتفعيلها تقرّ بأن المريض وافق على تواصلك معه.
              </span>
            </label>
            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={handleAddPatient}
                disabled={saving || !fullName.trim()}
                className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-50"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "حفظ"}
              </button>
              <button
                type="button"
                onClick={() => setShowAdd(false)}
                className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-accent"
              >
                إلغاء
              </button>
            </div>
            <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
              تنسيق CSV للاستيراد: العمود الأول الاسم، ثم الهاتف، ثم المدينة (سطر لكل مريض).
            </p>
          </div>
        </div>
      )}

      {pendingImport && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => !importing && setPendingImport(null)}
        >
          <div
            className="w-full max-w-md rounded-2xl bg-card p-6 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-lg font-bold text-foreground">تأكيد الاستيراد</h2>
              <button
                type="button"
                onClick={() => setPendingImport(null)}
                className="rounded-lg p-1 text-muted-foreground hover:bg-accent"
                aria-label="إغلاق"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="text-sm text-muted-foreground">
              الملف <span className="font-medium text-foreground">{pendingImport.fileName}</span>{" "}
              يحتوي على{" "}
              <span className="font-medium text-foreground">{pendingImport.patients.length}</span>{" "}
              مريض، منهم{" "}
              <span className="font-medium text-foreground">
                {pendingImport.patients.filter((p) => p.phone.trim()).length}
              </span>{" "}
              برقم هاتف.
            </p>
            <ul className="mt-3 max-h-40 space-y-1 overflow-auto rounded-lg border border-border bg-background p-2 text-xs">
              {pendingImport.patients.slice(0, 8).map((p, i) => (
                <li key={i} className="flex justify-between gap-2">
                  <span className="truncate">{p.fullName}</span>
                  <span className="shrink-0 text-muted-foreground" dir="ltr">
                    {p.phone || "—"}
                  </span>
                </li>
              ))}
              {pendingImport.patients.length > 8 && (
                <li className="text-muted-foreground">
                  … و{pendingImport.patients.length - 8} آخرين
                </li>
              )}
            </ul>
            <div className="mt-4 rounded-lg border border-warning/40 bg-warning-soft p-3 text-xs leading-relaxed text-foreground">
              سيتلقى كل مريض له رقم هاتف صالح رسالة واحدة (واتساب أو SMS): «تم تسجيلك لدى د. …» مع
              رابط لتحميل التطبيق واستكمال بياناته واستلام ملفه الطبي. بالضغط على «استيراد وإرسال»
              تقرّ بأن هؤلاء المرضى مرضاك وأنهم وافقوا على تواصلك معهم، وفق قانون حماية البيانات
              الشخصية.
            </div>
            <div className="mt-5 flex gap-2">
              <button
                type="button"
                onClick={confirmImport}
                disabled={importing}
                className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition hover:opacity-90 disabled:opacity-50"
              >
                {importing ? <Loader2 className="h-4 w-4 animate-spin" /> : "استيراد وإرسال"}
              </button>
              <button
                type="button"
                onClick={() => setPendingImport(null)}
                disabled={importing}
                className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-accent"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
