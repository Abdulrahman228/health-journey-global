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
import {
  createMedicalRecord,
  getPatientMedicalProfile,
  searchMyPatients,
} from "@/lib/emr.functions";
import { supabase } from "@/integrations/supabase/client";
import {
  Loader2,
  Plus,
  Save,
  Trash2,
  AlertTriangle,
  Sparkles,
  Check,
  Lock,
  Crown,
  User,
  Search,
  BookOpen,
  ThumbsUp,
  ThumbsDown,
  ExternalLink,
} from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";

const searchSchema = z.object({
  patientId: z.string().uuid().optional(),
});

export const Route = createFileRoute("/dashboard/visit/new")({
  validateSearch: (s) => searchSchema.parse(s),
  head: () => ({
    meta: [
      { title: "زيارة جديدة | لوحة الطبيب — طبانا" },
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
  const { user, profile, isLoading: authLoading } = useAuth();
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

  // AI symptom analysis (same analyze-symptoms edge function as mobile)
  const [symptomsText, setSymptomsText] = useState("");
  const [doctorSpecialty, setDoctorSpecialty] = useState("general medicine");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiSuggestion, setAiSuggestion] = useState<AiResult | null>(null);
  const [aiFeedback, setAiFeedback] = useState<1 | -1 | null>(null);
  // Gold gating + client-side credit counter, mirroring the mobile model
  // (12 per session; Gold-only). Free doctors see a locked, upsell state.
  const [isGold, setIsGold] = useState(false);
  const [aiCredits, setAiCredits] = useState(12);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      navigate({ to: "/login" });
      return;
    }
    if (!patientId) {
      // No patient chosen yet — render the in-page picker instead of a silent bounce.
      setPatientLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      const [{ data: prof }, mp] = await Promise.all([
        supabase.from("profiles").select("full_name").eq("id", patientId).maybeSingle(),
        getPatientMedicalProfile({ data: { patientProfileId: patientId } }),
      ]);
      if (cancelled) return;
      setPatient({
        name: (prof?.full_name as string | null) ?? "—",
        allergies: (mp as { allergies?: string[] } | null)?.allergies ?? [],
      });
      setPatientLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [authLoading, user, patientId, navigate]);

  // Resolve the doctor's specialty (sharpens the AI differential) AND their active
  // tier via the authoritative doctor_active_tier() RPC — the AI assistant is Gold-only.
  useEffect(() => {
    if (!profile?.id) return;
    let cancelled = false;
    (async () => {
      const { data: dd } = await supabase
        .from("doctor_details")
        .select("id, specialty")
        .eq("profile_id", profile.id)
        .maybeSingle();
      if (cancelled || !dd) return;
      if (dd.specialty) setDoctorSpecialty(dd.specialty as string);
      if (dd.id) {
        const { data: tier } = await supabase.rpc("doctor_active_tier", {
          doctor_details_id: dd.id as string,
        });
        if (!cancelled) setIsGold(String(tier) === "gold");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [profile?.id]);

  const canSubmit = useMemo(() => {
    return Boolean(chiefComplaint.trim() || diagnosisText.trim());
  }, [chiefComplaint, diagnosisText]);

  const mergeCsv = (existing: string, additions: string[]) => {
    const have = existing
      .split(/[,،]/)
      .map((s) => s.trim())
      .filter(Boolean);
    const merged = [...have];
    for (const a of additions) if (a && !merged.includes(a)) merged.push(a);
    return merged.join("، ");
  };

  const runAiAnalysis = async () => {
    if (!isGold) return; // Gold-only; the UI shows a locked upsell for free plans.
    if (aiCredits <= 0) {
      setAiError("انتهى رصيدك من التحليلات لهذه الجلسة.");
      return;
    }
    const raw = symptomsText.trim() || chiefComplaint.trim();
    const symptoms = raw
      .split(/[,،\n]/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (symptoms.length === 0) {
      setAiError("أدخل الأعراض أو الشكوى الرئيسية أولاً.");
      return;
    }
    // Client-side gibberish guard (mirrors the server) — instant feedback, no wasted call/credit.
    const letters = symptoms.join(" ").replace(/[^\p{L}]/gu, "");
    if (letters.length < 3 || new Set(letters).size < 2) {
      setAiSuggestion(null);
      setAiError("اكتب وصفاً إكلينيكيًّا واضحاً للأعراض (مثال: صداع، حمى، ألم بطن).");
      return;
    }
    setAiLoading(true);
    setAiError(null);
    const { data, error } = await supabase.functions.invoke("analyze-symptoms", {
      body: { symptoms, specialty: doctorSpecialty },
    });
    setAiLoading(false);
    if (error || !data) {
      setAiError("تعذّر التحليل — حاول مجدداً." + (error?.message ? ` (${error.message})` : ""));
      return;
    }
    const result = data as AiResult & { insufficient?: boolean; note?: string };
    // Unusable input → show the note, no fabricated cards, no credit spent.
    if (result.insufficient) {
      setAiSuggestion(null);
      setAiError(result.note || "الأعراض غير واضحة — اكتب وصفاً إكلينيكيًّا أوضح.");
      return;
    }
    setAiSuggestion(result);
    setAiFeedback(null);
    setAiCredits((c) => Math.max(0, c - 1));
  };

  const handleAddRx = () => setRxItems((prev) => [...prev, { ...EMPTY_RX }]);
  const handleRemoveRx = (i: number) => setRxItems((prev) => prev.filter((_, idx) => idx !== i));
  const updateRx = (i: number, key: keyof RxRow, value: string) =>
    setRxItems((prev) => prev.map((r, idx) => (idx === i ? { ...r, [key]: value } : r)));

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
      .filter((r) => r.drugName && r.dosage && r.frequency && r.duration);

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

  if (authLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  // No patient selected — show a picker so "وصفة جديدة / كشف فوري" lands on a
  // working screen (choose patient → form) instead of bouncing to the list.
  if (!patientId) {
    return (
      <PatientPicker
        onPick={(id) => navigate({ to: "/dashboard/visit/new", search: { patientId: id } })}
      />
    );
  }

  if (patientLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} aria-busy={saving}>
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

        {/* AI symptom analysis — Gold-gated + client-side credits, mirroring mobile.
            Free doctors keep the panel as a locked marketing upsell. */}
        {!isGold ? (
          <section className="rounded-xl border border-amber-300/50 bg-linear-to-br from-amber-50 to-amber-100/40 p-6 dark:border-amber-900/40 dark:from-amber-950/30 dark:to-amber-900/10">
            <div className="flex items-start gap-3">
              <div
                className="rounded-full bg-amber-500/20 p-2 text-amber-600 dark:text-amber-400"
                aria-hidden="true"
              >
                <Sparkles className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="flex items-center gap-2 text-base font-semibold text-foreground">
                  مساعد التشخيص بالذكاء الاصطناعي
                  <Lock className="h-4 w-4 text-amber-600 dark:text-amber-400" aria-hidden="true" />
                </h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  تشخيصات تفريقية مقترحة، فحوصات موصى بها، وخطة علاجية مبدئية — بضغطة زر تملأ
                  النموذج تلقائياً، فتوفّر وقتك وترفع دقّة قراراتك.
                </p>
                <button
                  type="button"
                  onClick={() => navigate({ to: "/billing" })}
                  className="mt-3 inline-flex items-center gap-2 rounded-lg bg-linear-to-r from-amber-500 to-yellow-600 px-4 py-2 text-sm font-bold text-white transition hover:opacity-90"
                >
                  <Crown className="h-4 w-4" aria-hidden="true" />
                  الترقية إلى الخطة الذهبية (Gold) لفتح المساعد الذكي
                </button>
              </div>
            </div>
          </section>
        ) : (
          <section className="rounded-xl border border-primary/30 bg-primary/5 p-5">
            <div className="mb-3 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-primary" aria-hidden="true" />
                <h2 className="text-base font-semibold text-foreground">
                  مساعد التشخيص بالذكاء الاصطناعي
                </h2>
              </div>
              <span className="whitespace-nowrap rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary">
                الرصيد المتبقّي: {aiCredits}
              </span>
            </div>
            <Field label="الأعراض" hint="افصل بفاصلة — يُملأ من الشكوى الرئيسية إن تُرك فارغاً">
              <input
                type="text"
                value={symptomsText}
                onChange={(e) => setSymptomsText(e.target.value)}
                className={INPUT_CLS}
                placeholder="صداع، حمى، تصلب الرقبة"
              />
            </Field>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={runAiAnalysis}
                disabled={aiLoading || aiCredits <= 0}
                className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
              >
                {aiLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Sparkles className="h-4 w-4" aria-hidden="true" />
                )}
                {aiCredits <= 0 ? "انتهى رصيد الجلسة" : "اقترح بالذكاء الاصطناعي"}
              </button>
              <span className="text-xs text-muted-foreground">
                دعم قرار للمراجعة الطبية — القرار النهائي لك دائماً.
              </span>
            </div>
            <div role="status" aria-live="polite">
              {aiError && <p className="mt-2 text-sm font-medium text-destructive">{aiError}</p>}
            </div>
            {aiSuggestion && (
              <div className="mt-4 space-y-3">
                <AiSuggestionRow
                  title="التشخيصات المحتملة"
                  items={aiSuggestion.diagnoses}
                  onApply={() => setDxText((p) => mergeCsv(p, aiSuggestion.diagnoses))}
                />
                <AiSuggestionRow
                  title="الفحوصات المقترحة"
                  items={aiSuggestion.tests}
                  onApply={() => setTestsText((p) => mergeCsv(p, aiSuggestion.tests))}
                />
                {aiSuggestion.treatment?.trim() && (
                  <div className="rounded-lg border border-border bg-card p-3">
                    <div className="mb-1.5 flex items-center justify-between gap-2">
                      <span className="text-sm font-semibold text-foreground">خطة مبدئية</span>
                      <button
                        type="button"
                        onClick={() =>
                          setPlan((p) =>
                            p.trim() ? p + "\n" + aiSuggestion.treatment : aiSuggestion.treatment,
                          )
                        }
                        className="inline-flex items-center gap-1 rounded-md border border-primary px-2 py-1 text-xs font-medium text-primary hover:bg-primary/10"
                      >
                        <Check className="h-3.5 w-3.5" aria-hidden="true" /> تطبيق على الخطة
                      </button>
                    </div>
                    <p className="whitespace-pre-wrap text-sm text-muted-foreground">
                      {aiSuggestion.treatment}
                    </p>
                  </div>
                )}
                <AiEvidencePanel
                  result={aiSuggestion}
                  feedback={aiFeedback}
                  onFeedback={async (rating) => {
                    if (!aiSuggestion.consultation_id) return;
                    setAiFeedback(rating);
                    const { error } = await supabase.rpc(
                      "rate_ai_consultation" as never,
                      {
                        p_id: aiSuggestion.consultation_id,
                        p_rating: rating,
                        p_note: null,
                      } as never,
                    );
                    if (error) toast.error("تعذّر حفظ التقييم");
                    else toast.success("شكراً — تقييمك يحسّن المساعد لكل الأطباء");
                  }}
                />
              </div>
            )}
          </section>
        )}

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
              <div key={i} className="rounded-lg border border-border bg-background p-4">
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-sm font-semibold text-foreground">الدواء #{i + 1}</span>
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
          {formError && <p className="text-sm font-medium text-destructive">{formError}</p>}
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

/**
 * Patient chooser shown when /dashboard/visit/new is opened without a patientId
 * (e.g. the dashboard "New prescription" / "Instant visit" quick actions). Picking
 * a patient re-opens the same route with ?patientId=… so the full visit + Rx form
 * appears — no more silent bounce to the patients list.
 */
function PatientPicker({ onPick }: { onPick: (id: string) => void }) {
  const { user } = useAuth();
  const [q, setQ] = useState("");
  const [patients, setPatients] = useState<{ id: string; fullName: string | null }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const handle = setTimeout(() => {
      setLoading(true);
      (async () => {
        const res = await searchMyPatients({ data: { userId: user.id, q } });
        if (!cancelled) {
          setPatients((res ?? []) as { id: string; fullName: string | null }[]);
          setLoading(false);
        }
      })();
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(handle);
    };
  }, [user, q]);

  return (
    <div>
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">زيارة / وصفة جديدة</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          اختر المريض لبدء الزيارة وكتابة الوصفة.
        </p>
      </header>

      <div className="relative mb-4">
        <Search
          className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden="true"
        />
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="ابحث بالاسم أو الهاتف…"
          className="w-full rounded-lg border border-border bg-background py-2.5 pr-10 pl-3 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
        />
      </div>

      {loading ? (
        <div className="flex min-h-[30vh] items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : patients.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card/50 p-10 text-center text-sm text-muted-foreground">
          {q.trim() ? "لا يوجد مريض مطابق." : "لا يوجد مرضى بعد — أضف مريضاً من صفحة «المرضى»."}
        </div>
      ) : (
        <ul className="space-y-2">
          {patients.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => onPick(p.id)}
                className="flex w-full items-center gap-3 rounded-xl border border-border bg-card p-4 text-start transition hover:border-primary hover:bg-primary/5 focus:outline-none focus:ring-2 focus:ring-primary/30"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <User className="h-5 w-5" aria-hidden="true" />
                </span>
                <span className="font-medium text-foreground">{p.fullName || "بدون اسم"}</span>
                <span className="ms-auto text-xs font-medium text-primary">بدء الزيارة ←</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

type AiReference = {
  n: number;
  chunk_id: number;
  source_title: string;
  title: string | null;
  section: string | null;
  publisher: string | null;
  url: string | null;
  license: string;
  cited: boolean;
  similarity: number;
};

type AiResult = {
  diagnoses: string[];
  tests: string[];
  treatment: string;
  note?: string;
  evidence?: "referenced" | "general" | "insufficient";
  red_flags?: string[];
  references?: AiReference[];
  consultation_id?: string | null;
  model?: string;
  library_hits?: number;
};

/** Evidence badge + red flags + numbered references + 👍/👎 for the answer. */
function AiEvidencePanel({
  result,
  feedback,
  onFeedback,
}: {
  result: AiResult;
  feedback: 1 | -1 | null;
  onFeedback: (rating: 1 | -1) => void;
}) {
  const refs = result.references ?? [];
  const cited = refs.filter((r) => r.cited);
  const referenced = result.evidence === "referenced" && cited.length > 0;
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${
            referenced ? "bg-success-soft text-success" : "bg-warning-soft text-warning"
          }`}
        >
          <BookOpen className="h-3.5 w-3.5" aria-hidden="true" />
          {referenced
            ? `مستند إلى ${cited.length} مرجع من المكتبة الطبية`
            : "إجابة عامة — لا توجد مراجع مطابقة في المكتبة"}
        </span>
        {result.consultation_id && (
          <div className="flex items-center gap-1" role="group" aria-label="تقييم الاقتراح">
            <span className="me-1 text-xs text-muted-foreground">هل كان مفيداً؟</span>
            <button
              type="button"
              onClick={() => onFeedback(1)}
              aria-pressed={feedback === 1}
              className={`rounded-md border p-1.5 transition ${
                feedback === 1
                  ? "border-success bg-success-soft text-success"
                  : "border-border text-muted-foreground hover:bg-accent"
              }`}
              aria-label="مفيد"
            >
              <ThumbsUp className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => onFeedback(-1)}
              aria-pressed={feedback === -1}
              className={`rounded-md border p-1.5 transition ${
                feedback === -1
                  ? "border-destructive bg-destructive/10 text-destructive"
                  : "border-border text-muted-foreground hover:bg-accent"
              }`}
              aria-label="غير مفيد"
            >
              <ThumbsDown className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>
        )}
      </div>

      {result.note?.trim() && <p className="mt-2 text-xs text-muted-foreground">{result.note}</p>}

      {(result.red_flags?.length ?? 0) > 0 && (
        <div className="mt-3 rounded-md border border-destructive/30 bg-destructive/5 p-2.5">
          <p className="mb-1 flex items-center gap-1.5 text-xs font-semibold text-destructive">
            <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" /> علامات خطر تستدعي تدخلاً
            عاجلاً
          </p>
          <ul className="list-disc space-y-0.5 ps-5 text-xs text-foreground">
            {result.red_flags!.map((f, i) => (
              <li key={i}>{f}</li>
            ))}
          </ul>
        </div>
      )}

      {refs.length > 0 && (
        <details className="mt-3" open={cited.length > 0}>
          <summary className="cursor-pointer text-xs font-semibold text-foreground">
            المراجع ({cited.length} مُستشهد بها من {refs.length})
          </summary>
          <ol className="mt-2 space-y-1.5 text-xs">
            {refs.map((r) => (
              <li
                key={r.n}
                className={`flex gap-2 rounded-md border p-2 ${
                  r.cited ? "border-primary/30 bg-primary/5" : "border-border opacity-70"
                }`}
              >
                <span className="shrink-0 font-mono font-semibold text-primary">[{r.n}]</span>
                <span className="min-w-0 flex-1">
                  <span className="font-medium text-foreground">{r.source_title}</span>
                  {r.title && <span className="text-muted-foreground"> › {r.title}</span>}
                  {r.section && <span className="text-muted-foreground"> › {r.section}</span>}
                  {r.publisher && <span className="text-muted-foreground"> ({r.publisher})</span>}
                  {r.url && (
                    <a
                      href={r.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ms-1 inline-flex items-center gap-0.5 text-primary hover:underline"
                    >
                      فتح <ExternalLink className="h-3 w-3" aria-hidden="true" />
                    </a>
                  )}
                </span>
              </li>
            ))}
          </ol>
        </details>
      )}
    </div>
  );
}

function AiSuggestionRow({
  title,
  items,
  onApply,
}: {
  title: string;
  items: string[];
  onApply: () => void;
}) {
  if (!items || items.length === 0) return null;
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <span className="text-sm font-semibold text-foreground">{title}</span>
        <button
          type="button"
          onClick={onApply}
          className="inline-flex items-center gap-1 rounded-md border border-primary px-2 py-1 text-xs font-medium text-primary hover:bg-primary/10"
        >
          <Check className="h-3.5 w-3.5" aria-hidden="true" /> تطبيق
        </button>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {items.map((it, i) => (
          <span key={i} className="rounded-full bg-primary/10 px-2.5 py-1 text-xs text-foreground">
            {it}
          </span>
        ))}
      </div>
    </div>
  );
}

function Fieldset({ legend, children }: { legend: string; children: React.ReactNode }) {
  return (
    <fieldset className="rounded-xl border border-border bg-card p-5">
      <legend className="px-2 text-base font-semibold text-foreground">{legend}</legend>
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
