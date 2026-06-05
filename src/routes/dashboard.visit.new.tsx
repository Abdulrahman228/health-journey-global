/**
 * /dashboard/visit/new?patientId=... — visit form + Rx builder.
 *
 * Single-page form covering:
 *   - vitals (BP, HR, temp, weight, height, glucose, O2)
 *   - subjective (chief complaint, HPI)
 *   - objective (physical examination)
 *   - assessment (diagnosis array, ICD-10 codes)
 *   - plan (treatment plan, recommended tests, follow-up days, private notes)
 *   - prescription (multi-item Rx builder)
 *
 * Submits to createMedicalRecord which atomically inserts the record
 * + prescription + items. Redirects to patient detail page on success.
 *
 * Private — noindex,nofollow.
 *
 * Accessibility:
 *   - All inputs have associated <label>
 *   - Form sections grouped with <fieldset>+<legend>
 *   - Validation errors announced via aria-live region
 */
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { createMedicalRecord, getPatientMedicalProfile } from "@/lib/emr.functions";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Plus, Save, Trash2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";

const searchSchema = z.object({
  patientId: z.string().uuid().optional(),
});

export const Route = createFileRoute("/dashboard/visit/new")({
  validateSearch: (s) => searchSchema.parse(s),
  head: () => ({
    meta: [
      { title: "زيارة جديدة | لوحة الطبيب — طبيبي" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: NewVisitPage,
});

interface RxRow {
  drugName: string;
  dosage: string;
  frequency: string;
  duration: string;
  route: string;
  instructions: string;
  quantity: string;
}

const EMPTY_RX: RxRow = {
  drugName: "",
  dosage: "",
  frequency: "",
  duration: "",
  route: "",
  instructions: "",
  quantity: "",
};

const FREQ_OPTIONS = [
  "مرة يومياً",
  "مرتين يومياً",
  "كل 8 ساعات",
  "كل 12 ساعة",
  "كل 6 ساعات",
  "عند اللزوم",
];
const ROUTE_OPTIONS = ["فموي", "حقن وريدي", "حقن عضلي", "موضعي", "بخّاخ", "تحت اللسان"];

function NewVisitPage() {
  const { patientId } = Route.useSearch();
  const { user, isLoading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [patient, setPatient] = useState<{
    name: string;
    allergies: string[];
  } | null>(null);
  const [patientLoading, setPatientLoading] = useState(true);

  // Form state
  const [visitType, setVisitType] = useState<"first_visit" | "follow_up" | "tele">("first_visit");
  const [chiefComplaint, setChief] = useState("");
  const [hpi, setHpi] = useState("");
  const [exam, setExam] = useState("");
  const [diagnosisText, setDxText] = useState("");
  const [icdText, setIcdText] = useState("");
  const [bp, setBp] = useState("");
  const [hr, setHr] = useState("");
  const [temp, setTemp] = useState("");
  const [weight, setWeight] = useState("");
  const [height, setHeight] = useState("");
  const [glucose, setGlucose] = useState("");
  const [plan, setPlan] = useState("");
  const [testsText, setTestsText] = useState("");
  const [followUpDays, setFollowUp] = useState<string>("");
  const [privateNotes, setPrivate] = useState("");

  const [rxNotes, setRxNotes] = useState("");
  const [rxValidDays, setRxValidDays] = useState("30");
  const [rxItems, setRxItems] = useState<RxRow[]>([{ ...EMPTY_RX }]);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      navigate({ to: "/login" });
      return;
    }
    if (!patientId) {
      navigate({ to: "/dashboard/patients" });
      return;
    }
    let cancelled = false;
    (async () => {
      const [{ data: prof }, mp] = await Promise.all([
        supabase
          .from("profiles")
          .select("full_name")
          .eq("id", patientId)
          .maybeSingle(),
        getPatientMedicalProfile({ data: { patientProfileId: patientId } }),
      ]);
      if (cancelled) return;
      setPatient({
        name: (prof?.full_name as string | null) ?? "—",
        allergies:
          (mp as { allergies?: string[] } | null)?.allergies ?? [],
      });
      setPatientLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [authLoading, user, patientId, navigate]);

  const canSubmit = useMemo(() => {
    return Boolean(chiefComplaint.trim() || diagnosisText.trim());
  }, [chiefComplaint, diagnosisText]);

  const handleAddRx = () => setRxItems((prev) => [...prev, { ...EMPTY_RX }]);
  const handleRemoveRx = (i: number) =>
    setRxItems((prev) => prev.filter((_, idx) => idx !== i));
  const updateRx = (i: number, key: keyof RxRow, value: string) =>
    setRxItems((prev) =>
      prev.map((r, idx) => (idx === i ? { ...r, [key]: value } : r)),
    );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    if (!user || !patientId) return;
    if (!canSubmit) {
      setFormError("أدخل على الأقل الشكوى أو التشخيص.");
      return;
    }
    setSaving(true);

    const vitals: Record<string, string | number> = {};
    if (bp) vitals.bp = bp;
    if (hr) vitals.hr = Number(hr);
    if (temp) vitals.temp = Number(temp);
    if (weight) vitals.weight = Number(weight);
    if (height) vitals.height = Number(height);
    if (glucose) vitals.glucose = Number(glucose);

    const cleanRx = rxItems
      .map((r) => ({
        drugName: r.drugName.trim(),
        dosage: r.dosage.trim(),
        frequency: r.frequency.trim(),
        duration: r.duration.trim(),
        route: r.route.trim(),
        instructions: r.instructions.trim(),
        quantity: r.quantity ? Number(r.quantity) : null,
      }))
      .filter(
        (r) => r.drugName && r.dosage && r.frequency && r.duration,
      );

    const res = await createMedicalRecord({
      data: {
        userId: user.id,
        patientProfileId: patientId,
        visitType,
        chiefComplaint,
        historyPresentIllness: hpi,
        physicalExamination: exam,
        diagnosis: diagnosisText
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        icd10Codes: icdText
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        vitals: Object.keys(vitals).length > 0 ? vitals : undefined,
        treatmentPlan: plan,
        recommendedTests: testsText
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        followUpDays: followUpDays ? Number(followUpDays) : null,
        privateNotes,
        prescription:
          cleanRx.length > 0
            ? {
                notes: rxNotes,
                validDays: Number(rxValidDays) || 30,
                items: cleanRx,
              }
            : null,
      },
    });

    setSaving(false);
    if (!res.ok) {
      toast.error("فشل حفظ الزيارة: " + res.error);
      return;
    }
    toast.success("تم حفظ الزيارة");
    navigate({
      to: "/dashboard/patient/$id",
      params: { id: patientId },
    });
  };

  if (authLoading || patientLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mx-auto max-w-4xl px-4 py-8"
      aria-busy={saving}
    >
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">زيارة جديدة</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          المريض: <span className="font-semibold text-foreground">{patient?.name}</span>
        </p>
      </header>

      {patient && patient.allergies.length > 0 && (
        <div
          role="alert"
          className="mb-6 flex items-start gap-3 rounded-lg border-2 border-destructive bg-destructive/10 p-4 text-destructive"
        >
          <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0" aria-hidden="true" />
          <div>
            <div className="font-bold">حساسيات للمريض</div>
            <div className="mt-0.5 text-sm">{patient.allergies.join("، ")}</div>
          </div>
        </div>
      )}

      <div className="space-y-6">
        {/* Visit type */}
        <Fieldset legend="نوع الزيارة">
          <div className="flex flex-wrap gap-2">
            {(
              [
                { v: "first_visit", l: "كشف جديد" },
                { v: "follow_up", l: "متابعة" },
                { v: "tele", l: "أون لاين" },
              ] as const
            ).map((opt) => (
              <label
                key={opt.v}
                className={
                  "cursor-pointer rounded-lg border px-4 py-2 text-sm font-medium transition " +
                  (visitType === opt.v
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card text-foreground hover:bg-muted")
                }
              >
                <input
                  type="radio"
                  className="sr-only"
                  name="visitType"
                  value={opt.v}
                  checked={visitType === opt.v}
                  onChange={() => setVisitType(opt.v)}
                />
                {opt.l}
              </label>
            ))}
          </div>
        </Fieldset>

        {/* Vitals */}
        <Fieldset legend="المؤشرات الحيوية">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            <Field label="ضغط الدم" hint="مثلاً 120/80">
              <input
                type="text"
                value={bp}
                onChange={(e) => setBp(e.target.value)}
                inputMode="numeric"
                className={INPUT_CLS}
              />
            </Field>
            <Field label="النبض" hint="bpm">
              <input
                type="number"
                value={hr}
                onChange={(e) => setHr(e.target.value)}
                className={INPUT_CLS}
              />
            </Field>
            <Field label="الحرارة" hint="°C">
              <input
                type="number"
                step="0.1"
                value={temp}
                onChange={(e) => setTemp(e.target.value)}
                className={INPUT_CLS}
              />
            </Field>
            <Field label="الوزن" hint="kg">
              <input
                type="number"
                step="0.1"
                value={weight}
                onChange={(e) => setWeight(e.target.value)}
                className={INPUT_CLS}
              />
            </Field>
            <Field label="الطول" hint="cm">
              <input
                type="number"
                value={height}
                onChange={(e) => setHeight(e.target.value)}
                className={INPUT_CLS}
              />
            </Field>
            <Field label="السكر" hint="mg/dL">
              <input
                type="number"
                value={glucose}
                onChange={(e) => setGlucose(e.target.value)}
                className={INPUT_CLS}
              />
            </Field>
          </div>
        </Fieldset>

        {/* Subjective / Objective */}
        <Fieldset legend="الشكوى والفحص">
          <div className="space-y-3">
            <Field label="الشكوى الرئيسية" required>
              <input
                type="text"
                value={chiefComplaint}
                onChange={(e) => setChief(e.target.value)}
                className={INPUT_CLS}
                placeholder="مثلاً صداع شديد منذ يومين"
              />
            </Field>
            <Field label="تاريخ المرض الحالي (HPI)">
              <textarea
                rows={3}
                value={hpi}
                onChange={(e) => setHpi(e.target.value)}
                className={INPUT_CLS}
              />
            </Field>
            <Field label="الفحص الإكلينيكي">
              <textarea
                rows={3}
                value={exam}
                onChange={(e) => setExam(e.target.value)}
                className={INPUT_CLS}
              />
            </Field>
          </div>
        </Fieldset>

        {/* Assessment */}
        <Fieldset legend="التشخيص">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="التشخيصات" hint="افصل بفاصلة">
              <input
                type="text"
                value={diagnosisText}
                onChange={(e) => setDxText(e.target.value)}
                className={INPUT_CLS}
                placeholder="ضغط دم مرتفع، صداع نصفي"
              />
            </Field>
            <Field label="أكواد ICD-10" hint="اختياري">
              <input
                type="text"
                value={icdText}
                onChange={(e) => setIcdText(e.target.value)}
                className={INPUT_CLS}
                placeholder="I10, G43.9"
              />
            </Field>
          </div>
        </Fieldset>

        {/* Plan */}
        <Fieldset legend="الخطة العلاجية">
          <div className="space-y-3">
            <Field label="خطة العلاج">
              <textarea
                rows={3}
                value={plan}
                onChange={(e) => setPlan(e.target.value)}
                className={INPUT_CLS}
              />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="تحاليل/أشعة موصى بها" hint="افصل بفاصلة">
                <input
                  type="text"
                  value={testsText}
                  onChange={(e) => setTestsText(e.target.value)}
                  className={INPUT_CLS}
                />
              </Field>
              <Field label="موعد المتابعة (يوم)" hint="يظهر للمريض">
                <input
                  type="number"
                  min={0}
                  max={365}
                  value={followUpDays}
                  onChange={(e) => setFollowUp(e.target.value)}
                  className={INPUT_CLS}
                />
              </Field>
            </div>
            <Field label="ملاحظات خاصة" hint="مرئية لك فقط — لا يراها المريض">
              <textarea
                rows={2}
                value={privateNotes}
                onChange={(e) => setPrivate(e.target.value)}
                className={INPUT_CLS}
              />
            </Field>
          </div>
        </Fieldset>

        {/* Prescription builder */}
        <Fieldset legend="الوصفة الطبية">
          <div className="mb-3 grid gap-3 sm:grid-cols-2">
            <Field label="ملاحظات الوصفة">
              <input
                type="text"
                value={rxNotes}
                onChange={(e) => setRxNotes(e.target.value)}
                className={INPUT_CLS}
              />
            </Field>
            <Field label="صلاحية الوصفة (يوم)">
              <input
                type="number"
                min={1}
                max={180}
                value={rxValidDays}
                onChange={(e) => setRxValidDays(e.target.value)}
                className={INPUT_CLS}
              />
            </Field>
          </div>

          <div className="space-y-3">
            {rxItems.map((r, i) => (
              <div
                key={i}
                className="rounded-lg border border-border bg-background p-4"
              >
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-sm font-semibold text-foreground">
                    الدواء #{i + 1}
                  </span>
                  {rxItems.length > 1 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveRx(i)}
                      className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-destructive hover:bg-destructive/10"
                      aria-label={`حذف الدواء ${i + 1}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                      حذف
                    </button>
                  )}
                </div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <Field label="اسم الدواء">
                    <input
                      type="text"
                      value={r.drugName}
                      onChange={(e) => updateRx(i, "drugName", e.target.value)}
                      className={INPUT_CLS}
                      placeholder="مثلاً Concor 5 mg"
                    />
                  </Field>
                  <Field label="الجرعة">
                    <input
                      type="text"
                      value={r.dosage}
                      onChange={(e) => updateRx(i, "dosage", e.target.value)}
                      className={INPUT_CLS}
                      placeholder="قرص واحد"
                    />
                  </Field>
                  <Field label="التكرار">
                    <input
                      type="text"
                      list={`freq-list-${i}`}
                      value={r.frequency}
                      onChange={(e) => updateRx(i, "frequency", e.target.value)}
                      className={INPUT_CLS}
                    />
                    <datalist id={`freq-list-${i}`}>
                      {FREQ_OPTIONS.map((f) => (
                        <option key={f} value={f} />
                      ))}
                    </datalist>
                  </Field>
                  <Field label="المدة">
                    <input
                      type="text"
                      value={r.duration}
                      onChange={(e) => updateRx(i, "duration", e.target.value)}
                      className={INPUT_CLS}
                      placeholder="5 أيام"
                    />
                  </Field>
                  <Field label="طريقة الإعطاء">
                    <input
                      type="text"
                      list={`route-list-${i}`}
                      value={r.route}
                      onChange={(e) => updateRx(i, "route", e.target.value)}
                      className={INPUT_CLS}
                    />
                    <datalist id={`route-list-${i}`}>
                      {ROUTE_OPTIONS.map((r2) => (
                        <option key={r2} value={r2} />
                      ))}
                    </datalist>
                  </Field>
                  <Field label="الكمية">
                    <input
                      type="number"
                      min={1}
                      value={r.quantity}
                      onChange={(e) => updateRx(i, "quantity", e.target.value)}
                      className={INPUT_CLS}
                    />
                  </Field>
                  <div className="sm:col-span-2 lg:col-span-3">
                    <Field label="تعليمات">
                      <input
                        type="text"
                        value={r.instructions}
                        onChange={(e) => updateRx(i, "instructions", e.target.value)}
                        className={INPUT_CLS}
                        placeholder="بعد الأكل / قبل النوم"
                      />
                    </Field>
                  </div>
                </div>
              </div>
            ))}
            <button
              type="button"
              onClick={handleAddRx}
              className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-primary px-3 py-2 text-sm font-medium text-primary hover:bg-primary/5"
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              إضافة دواء
            </button>
          </div>
        </Fieldset>

        {/* Error region */}
        <div role="status" aria-live="polite" className="min-h-[1.25rem]">
          {formError && (
            <p className="text-sm font-medium text-destructive">{formError}</p>
          )}
        </div>

        <div className="flex justify-end gap-3">
          <button
            type="button"
            onClick={() => navigate({ to: "/dashboard/patients" })}
            className="rounded-lg border border-border bg-card px-4 py-2 text-sm font-medium text-foreground hover:bg-muted"
          >
            إلغاء
          </button>
          <button
            type="submit"
            disabled={saving || !canSubmit}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <Save className="h-4 w-4" aria-hidden="true" />
            )}
            حفظ الزيارة
          </button>
        </div>
      </div>
    </form>
  );
}

const INPUT_CLS =
  "mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20";

function Fieldset({
  legend,
  children,
}: {
  legend: string;
  children: React.ReactNode;
}) {
  return (
    <fieldset className="rounded-xl border border-border bg-card p-5">
      <legend className="px-2 text-base font-semibold text-foreground">
        {legend}
      </legend>
      {children}
    </fieldset>
  );
}

function Field({
  label,
  hint,
  required,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block text-sm">
      <span className="font-medium text-foreground">
        {label}
        {required && <span className="text-destructive"> *</span>}
      </span>
      {children}
      {hint && <span className="mt-0.5 block text-xs text-muted-foreground">{hint}</span>}
    </label>
  );
}
