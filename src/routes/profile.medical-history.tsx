/**
 * /profile/medical-history — patient view of their complete medical
 * record across every doctor they've visited on Tabibi.
 *
 * Sections:
 *   1. ملفي الطبي — edit allergies, chronic conditions, current meds
 *   2. زياراتي — chronological timeline across ALL doctors
 *
 * `private_notes` are stripped server-side; the patient never sees them.
 *
 * Private — noindex, nofollow.
 */
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { MedicalAttachmentsPanel } from "@/components/emr/MedicalAttachmentsPanel";
import {
  getMyMedicalHistory,
  getPatientMedicalProfile,
  upsertMyMedicalProfile,
  type MedicalRecord,
} from "@/lib/emr.functions";
import { supabase } from "@/integrations/supabase/client";
import {
  Activity,
  AlertTriangle,
  Calendar,
  HeartPulse,
  Loader2,
  Save,
  Stethoscope,
  User,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/profile/medical-history")({
  head: () => ({
    meta: [
      { title: "ملفي الطبي | طبيبي" },
      {
        name: "description",
        content: "تاريخك الطبي الكامل عبر جميع الأطباء على طبيبي.",
      },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: PatientMedicalHistoryPage,
});

interface ProfileForm {
  bloodType: string;
  allergies: string;
  chronicConditions: string;
  currentMedications: string;
  familyHistory: string;
  smoking: boolean;
  alcohol: boolean;
}

function PatientMedicalHistoryPage() {
  const { user, isLoading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [history, setHistory] = useState<MedicalRecord[]>([]);
  const [form, setForm] = useState<ProfileForm>({
    bloodType: "",
    allergies: "",
    chronicConditions: "",
    currentMedications: "",
    familyHistory: "",
    smoking: false,
    alcohol: false,
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<"profile" | "visits" | "files">("profile");
  const [myProfileId, setMyProfileId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { data: prof } = await supabase
        .from("profiles")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();
      const profileId = prof?.id as string | undefined;
      if (!profileId) {
        setLoading(false);
        return;
      }
      setMyProfileId(profileId);

      const [mp, hist] = await Promise.all([
        getPatientMedicalProfile({ data: { patientProfileId: profileId } }),
        getMyMedicalHistory({ data: { userId: user.id } }),
      ]);

      if (mp) {
        const mpx = mp as {
          bloodType: string | null;
          allergies: string[];
          chronicConditions: string[];
          currentMedications: string[];
          familyHistory: string | null;
          smoking: boolean;
          alcohol: boolean;
        };
        setForm({
          bloodType: mpx.bloodType ?? "",
          allergies: mpx.allergies.join(", "),
          chronicConditions: mpx.chronicConditions.join(", "),
          currentMedications: mpx.currentMedications.join(", "),
          familyHistory: mpx.familyHistory ?? "",
          smoking: mpx.smoking,
          alcohol: mpx.alcohol,
        });
      }
      setHistory(hist as MedicalRecord[]);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      navigate({ to: "/login" });
      return;
    }
    load();
  }, [authLoading, user, navigate, load]);

  // Realtime: keep the medical history live as doctors add visits or upload
  // documents for this patient — no manual refresh. Both tables are scoped to
  // this patient by `patient_profile_id`. Mirrors the mobile `observeRecordChanges`
  // (Android `MedicalRecordsRepository` / iOS `MedicalRecordsViewModel`), which
  // merge these same two tables on one channel.
  useEffect(() => {
    if (!myProfileId) return;
    const channel = supabase
      .channel(`patient-records-${myProfileId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "medical_records",
          filter: `patient_profile_id=eq.${myProfileId}`,
        },
        () => {
          load();
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "medical_attachments",
          filter: `patient_profile_id=eq.${myProfileId}`,
        },
        () => {
          load();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [myProfileId, load]);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSaving(true);
    const res = await upsertMyMedicalProfile({
      data: {
        userId: user.id,
        bloodType: form.bloodType || null,
        allergies: form.allergies
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        chronicConditions: form.chronicConditions
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        currentMedications: form.currentMedications
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
        familyHistory: form.familyHistory || null,
        smoking: form.smoking,
        alcohol: form.alcohol,
      },
    });
    setSaving(false);
    if (!res.ok) {
      toast.error("فشل الحفظ: " + res.error);
      return;
    }
    toast.success("تم حفظ ملفك الطبي");
  };

  if (authLoading || loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <header className="mb-6">
        <h1 className="flex items-center gap-2 text-3xl font-bold text-foreground">
          <HeartPulse className="h-7 w-7 text-primary" aria-hidden="true" />
          ملفي الطبي
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          تاريخك الطبي وزياراتك لدى جميع الأطباء على طبيبي.
        </p>
      </header>

      <nav
        className="mb-6 flex gap-1 border-b border-border"
        role="tablist"
        aria-label="أقسام الملف الطبي"
      >
        {(
          [
            { id: "profile", label: "بياناتي الصحية" },
            { id: "visits", label: `زياراتي (${history.length})` },
            { id: "files", label: "ملفاتي" },
          ] as const
        ).map((it) => (
          <button
            key={it.id}
            type="button"
            role="tab"
            aria-selected={tab === it.id}
            aria-controls={`panel-${it.id}`}
            id={`tab-${it.id}`}
            onClick={() => setTab(it.id)}
            className={
              "border-b-2 px-4 py-2 text-sm font-medium transition focus:outline-none focus:ring-2 focus:ring-primary/40 " +
              (tab === it.id
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground")
            }
          >
            {it.label}
          </button>
        ))}
      </nav>

      {tab === "profile" && (
        <form
          id="panel-profile"
          role="tabpanel"
          aria-labelledby="tab-profile"
          onSubmit={handleSaveProfile}
          className="rounded-xl border border-border bg-card p-6"
        >
          <p className="mb-4 text-sm text-muted-foreground">
            هذه البيانات تساعد الأطباء على تقديم رعاية أفضل لك. ستظهر لكل طبيب
            تزوره.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="فصيلة الدم">
              <select
                value={form.bloodType}
                onChange={(e) =>
                  setForm((f) => ({ ...f, bloodType: e.target.value }))
                }
                className={INPUT_CLS}
              >
                <option value="">— اختر —</option>
                {["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"].map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            </Field>
            <Field
              label="حساسيات"
              hint="افصل بفاصلة، مثلاً: بنسلين، فول سوداني"
            >
              <input
                type="text"
                value={form.allergies}
                onChange={(e) =>
                  setForm((f) => ({ ...f, allergies: e.target.value }))
                }
                className={INPUT_CLS}
              />
            </Field>
            <Field label="أمراض مزمنة" hint="افصل بفاصلة">
              <input
                type="text"
                value={form.chronicConditions}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    chronicConditions: e.target.value,
                  }))
                }
                className={INPUT_CLS}
                placeholder="سكري نوع 2، ضغط مرتفع"
              />
            </Field>
            <Field label="أدوية حالية" hint="افصل بفاصلة">
              <input
                type="text"
                value={form.currentMedications}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    currentMedications: e.target.value,
                  }))
                }
                className={INPUT_CLS}
              />
            </Field>
            <div className="sm:col-span-2">
              <Field label="تاريخ عائلي">
                <textarea
                  rows={2}
                  value={form.familyHistory}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, familyHistory: e.target.value }))
                  }
                  className={INPUT_CLS}
                />
              </Field>
            </div>
            <label className="flex items-center gap-2 text-sm font-medium text-foreground">
              <input
                type="checkbox"
                checked={form.smoking}
                onChange={(e) =>
                  setForm((f) => ({ ...f, smoking: e.target.checked }))
                }
                className="h-4 w-4 accent-primary"
              />
              مدخّن
            </label>
            <label className="flex items-center gap-2 text-sm font-medium text-foreground">
              <input
                type="checkbox"
                checked={form.alcohol}
                onChange={(e) =>
                  setForm((f) => ({ ...f, alcohol: e.target.checked }))
                }
                className="h-4 w-4 accent-primary"
              />
              يتناول كحول
            </label>
          </div>
          <div className="mt-6 flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Save className="h-4 w-4" aria-hidden="true" />
              )}
              حفظ
            </button>
          </div>
        </form>
      )}

      {tab === "visits" && (
        <section
          id="panel-visits"
          role="tabpanel"
          aria-labelledby="tab-visits"
          className="space-y-3"
        >
          {history.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-card py-16 text-center">
              <Stethoscope className="mx-auto h-10 w-10 text-muted-foreground/60" aria-hidden="true" />
              <p className="mt-3 font-medium text-foreground">
                لا توجد زيارات مسجّلة بعد
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                عند زيارة أي طبيب على طبيبي، ستظهر بياناتها هنا تلقائياً.
              </p>
            </div>
          ) : (
            history.map((v) => <PatientVisitRow key={v.id} v={v} />)
          )}
        </section>
      )}

      {tab === "files" && (
        <section
          id="panel-files"
          role="tabpanel"
          aria-labelledby="tab-files"
        >
          {myProfileId ? (
            <MedicalAttachmentsPanel patientProfileId={myProfileId} />
          ) : null}
        </section>
      )}
    </div>
  );
}

function PatientVisitRow({ v }: { v: MedicalRecord }) {
  const dateAr = new Date(v.visitDate).toLocaleDateString("ar-EG", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  return (
    <article className="rounded-xl border border-border bg-card p-5">
      <header className="flex flex-wrap items-center gap-2 text-sm">
        <Calendar className="h-4 w-4 text-primary" aria-hidden="true" />
        <span className="font-semibold text-foreground">{dateAr}</span>
        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
          {v.visitType === "first_visit"
            ? "كشف"
            : v.visitType === "follow_up"
              ? "متابعة"
              : v.visitType === "tele"
                ? "أون لاين"
                : "طوارئ"}
        </span>
      </header>

      <p className="mt-2 flex items-center gap-1.5 text-sm text-foreground">
        <User className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        <span className="font-semibold">د. {v.doctorName ?? "—"}</span>
        {v.doctorSpecialty && (
          <span className="text-muted-foreground">· {v.doctorSpecialty}</span>
        )}
      </p>

      {v.chiefComplaint && (
        <p className="mt-2 text-sm text-foreground">
          <span className="font-semibold">الشكوى: </span>
          {v.chiefComplaint}
        </p>
      )}
      {v.diagnosis.length > 0 && (
        <p className="mt-1 text-sm text-foreground">
          <span className="font-semibold">التشخيص: </span>
          {v.diagnosis.join("، ")}
        </p>
      )}
      {v.treatmentPlan && (
        <p className="mt-1 text-sm text-foreground">
          <span className="font-semibold">خطة العلاج: </span>
          {v.treatmentPlan}
        </p>
      )}
      {v.recommendedTests.length > 0 && (
        <p className="mt-1 text-sm text-foreground">
          <span className="font-semibold">تحاليل/أشعة: </span>
          {v.recommendedTests.join("، ")}
        </p>
      )}
      {v.vitals && (
        <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
          {v.vitals.bp && <Vital label="ضغط" value={v.vitals.bp} />}
          {v.vitals.hr && <Vital label="نبض" value={String(v.vitals.hr)} />}
          {v.vitals.temp && <Vital label="حرارة" value={`${v.vitals.temp}°`} />}
          {v.vitals.weight && <Vital label="وزن" value={`${v.vitals.weight}kg`} />}
        </div>
      )}
      {typeof v.followUpDays === "number" && v.followUpDays > 0 && (
        <p className="mt-2 inline-flex items-center gap-1 rounded-lg bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700">
          <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
          متابعة بعد {v.followUpDays} يوم
        </p>
      )}
    </article>
  );
}

function Vital({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5">
      <Activity className="h-3 w-3" aria-hidden="true" />
      <span className="font-semibold text-foreground">{label}:</span> {value}
    </span>
  );
}

const INPUT_CLS =
  "mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-primary focus:ring-2 focus:ring-primary/20";

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block text-sm">
      <span className="font-medium text-foreground">{label}</span>
      {children}
      {hint && <span className="mt-0.5 block text-xs text-muted-foreground">{hint}</span>}
    </label>
  );
}
