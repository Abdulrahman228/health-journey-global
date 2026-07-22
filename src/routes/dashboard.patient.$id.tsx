/**
 * /dashboard/patient/$id — full patient history (doctor view).
 *
 * Three tabs:
 *   1. الملخص — allergies, chronic conditions, current meds
 *   2. الزيارات — chronological timeline with diagnosis & vitals
 *   3. الوصفات — prescriptions grouped under each visit
 *
 * Includes a prominent "بدء زيارة جديدة" CTA that navigates to the
 * visit form pre-filled with this patient's ID.
 *
 * Private — noindex,nofollow.
 */
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { MedicalAttachmentsPanel } from "@/components/emr/MedicalAttachmentsPanel";
import {
  getPatientHistoryForDoctor,
  getPatientMedicalProfile,
  getPrescriptionsForRecord,
  type MedicalRecord,
  type Prescription,
} from "@/lib/emr.functions";
import { supabase } from "@/integrations/supabase/client";
import {
  Activity,
  AlertTriangle,
  Calendar,
  ChevronDown,
  Loader2,
  Pill,
  Plus,
  Stethoscope,
} from "lucide-react";

export const Route = createFileRoute("/dashboard/patient/$id")({
  head: () => ({
    meta: [
      { title: "ملف المريض | لوحة الطبيب — طبيبي" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: PatientDetailPage,
});

interface MedicalProfile {
  bloodType: string | null;
  allergies: string[];
  chronicConditions: string[];
  currentMedications: string[];
  smoking: boolean;
  alcohol: boolean;
}

interface PatientHeader {
  fullName: string;
  city: string | null;
  avatarUrl: string | null;
}

type Tab = "summary" | "visits" | "rx" | "files";

function PatientDetailPage() {
  const { id: patientProfileId } = Route.useParams();
  const { user, isLoading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState<Tab>("summary");
  const [header, setHeader] = useState<PatientHeader | null>(null);
  const [profile, setProfile] = useState<MedicalProfile | null>(null);
  const [visits, setVisits] = useState<MedicalRecord[]>([]);
  const [rxByVisit, setRxByVisit] = useState<Record<string, Prescription[]>>({});
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const [{ data: hdr }, prof, hist] = await Promise.all([
        supabase
          .from("profiles")
          .select("full_name, city, avatar_url")
          .eq("id", patientProfileId)
          .maybeSingle(),
        getPatientMedicalProfile({ data: { patientProfileId } }),
        getPatientHistoryForDoctor({ data: { patientProfileId } }),
      ]);
      setHeader(
        hdr
          ? {
              fullName: (hdr.full_name as string | null) ?? "—",
              city: (hdr.city as string | null) ?? null,
              avatarUrl: (hdr.avatar_url as string | null) ?? null,
            }
          : null,
      );
      setProfile(prof as MedicalProfile | null);
      setVisits(hist as MedicalRecord[]);
    } finally {
      setLoading(false);
    }
  }, [user, patientProfileId]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      navigate({ to: "/login" });
      return;
    }
    load();
  }, [authLoading, user, navigate, load]);

  // Realtime: keep this patient's EMR live for the doctor.
  //  - `medical_records` is scoped by `patient_profile_id`; any new/edited visit
  //    reloads the timeline (and clears the per-visit rx cache so prescriptions
  //    written in the same flow re-fetch).
  //  - `prescriptions` has no patient column, so it can't be server-filtered;
  //    we subscribe unfiltered and react only when the changed row's
  //    `medical_record_id` belongs to one of THIS patient's visits, then
  //    re-fetch just that visit's prescriptions so an open card updates in place.
  useEffect(() => {
    if (!patientProfileId) return;
    const visitIds = new Set(visits.map((v) => v.id));

    const channel = supabase
      .channel(`patient-emr-${patientProfileId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "medical_records",
          filter: `patient_profile_id=eq.${patientProfileId}`,
        },
        () => {
          setRxByVisit({});
          load();
        },
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "prescriptions" },
        (payload) => {
          const row = (payload.new ?? payload.old) as
            | { medical_record_id?: string }
            | null;
          const recordId = row?.medical_record_id;
          if (!recordId || !visitIds.has(recordId)) return;
          getPrescriptionsForRecord({
            data: { medicalRecordId: recordId },
          }).then((items) => {
            setRxByVisit((prev) => ({
              ...prev,
              [recordId]: items as Prescription[],
            }));
          });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [patientProfileId, visits, load]);

  const loadRxFor = useCallback(
    async (recordId: string) => {
      if (rxByVisit[recordId]) return;
      const items = await getPrescriptionsForRecord({ data: { medicalRecordId: recordId } });
      setRxByVisit((prev) => ({ ...prev, [recordId]: items as Prescription[] }));
    },
    [rxByVisit],
  );

  if (authLoading || loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      {/* Header card */}
      <header className="mb-6 flex flex-wrap items-center gap-4 rounded-xl border border-border bg-card p-5">
        {header?.avatarUrl ? (
          <img
            src={header.avatarUrl}
            alt=""
            width={64}
            height={64}
            loading="eager"
            decoding="async"
            className="h-16 w-16 rounded-full object-cover"
          />
        ) : (
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
            <Stethoscope className="h-7 w-7 text-primary" aria-hidden="true" />
          </div>
        )}
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-foreground">
            {header?.fullName ?? "—"}
          </h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {header?.city ? `${header.city} · ` : ""}
            <span className="font-mono">ID: {patientProfileId.slice(0, 8)}…</span>
          </p>
        </div>
        <Link
          to="/dashboard/visit/new"
          search={{ patientId: patientProfileId }}
          className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground transition hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary/40"
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
          بدء زيارة جديدة
        </Link>
      </header>

      {/* Allergies banner (high-contrast, ARIA alert) */}
      {profile && profile.allergies.length > 0 && (
        <div
          role="alert"
          className="mb-6 flex items-start gap-3 rounded-lg border-2 border-destructive bg-destructive/10 p-4 text-destructive"
        >
          <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0" aria-hidden="true" />
          <div>
            <div className="font-bold">تنبيه: حساسيات معروفة</div>
            <div className="mt-0.5 text-sm">{profile.allergies.join("، ")}</div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <nav
        className="mb-6 flex gap-1 border-b border-border"
        role="tablist"
        aria-label="أقسام الملف الطبي"
      >
        {(
          [
            { id: "summary", label: "الملخص" },
            { id: "visits", label: `الزيارات (${visits.length})` },
            { id: "rx", label: "الوصفات" },
            { id: "files", label: "المرفقات" },
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

      {/* Summary tab */}
      {tab === "summary" && (
        <section
          id="panel-summary"
          role="tabpanel"
          aria-labelledby="tab-summary"
          className="grid gap-4 md:grid-cols-2"
        >
          <SummaryCard
            title="فصيلة الدم"
            value={profile?.bloodType || "غير محدّدة"}
          />
          <SummaryCard
            title="حساسيات"
            value={
              profile && profile.allergies.length > 0
                ? profile.allergies.join("، ")
                : "لا توجد"
            }
            highlight={Boolean(profile && profile.allergies.length > 0)}
          />
          <SummaryCard
            title="أمراض مزمنة"
            value={
              profile && profile.chronicConditions.length > 0
                ? profile.chronicConditions.join("، ")
                : "لا توجد"
            }
          />
          <SummaryCard
            title="أدوية حالية"
            value={
              profile && profile.currentMedications.length > 0
                ? profile.currentMedications.join("، ")
                : "لا توجد"
            }
          />
          <SummaryCard
            title="عادات"
            value={
              [
                profile?.smoking ? "مدخّن" : null,
                profile?.alcohol ? "كحول" : null,
              ]
                .filter(Boolean)
                .join("، ") || "لا توجد"
            }
          />
          <SummaryCard
            title="عدد الزيارات معك"
            value={String(visits.length)}
          />
        </section>
      )}

      {/* Visits timeline */}
      {tab === "visits" && (
        <section
          id="panel-visits"
          role="tabpanel"
          aria-labelledby="tab-visits"
          className="space-y-3"
        >
          {visits.length === 0 ? (
            <EmptyTab message="لا توجد زيارات مسجّلة بعد" />
          ) : (
            visits.map((v) => <VisitRow key={v.id} v={v} />)
          )}
        </section>
      )}

      {/* Prescriptions */}
      {tab === "rx" && (
        <section
          id="panel-rx"
          role="tabpanel"
          aria-labelledby="tab-rx"
          className="space-y-3"
        >
          {visits.length === 0 ? (
            <EmptyTab message="لا توجد وصفات" />
          ) : (
            visits.map((v) => (
              <RxExpander
                key={v.id}
                v={v}
                items={rxByVisit[v.id]}
                onOpen={() => loadRxFor(v.id)}
              />
            ))
          )}
        </section>
      )}

      {/* Files / Attachments */}
      {tab === "files" && (
        <section
          id="panel-files"
          role="tabpanel"
          aria-labelledby="tab-files"
        >
          <MedicalAttachmentsPanel patientProfileId={patientProfileId} />
        </section>
      )}
    </div>
  );
}

function SummaryCard({
  title,
  value,
  highlight,
}: {
  title: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div
      className={
        "rounded-xl border bg-card p-4 " +
        (highlight ? "border-destructive/40" : "border-border")
      }
    >
      <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </div>
      <div
        className={
          "mt-1.5 text-sm " +
          (highlight ? "font-semibold text-destructive" : "text-foreground")
        }
      >
        {value}
      </div>
    </div>
  );
}

function VisitRow({ v }: { v: MedicalRecord }) {
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
      {v.chiefComplaint && (
        <p className="mt-3 text-sm text-foreground">
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
      {v.vitals && (
        <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
          {v.vitals.bp && <Vital icon="ضغط" value={v.vitals.bp} />}
          {v.vitals.hr && <Vital icon="نبض" value={`${v.vitals.hr}`} />}
          {v.vitals.temp && <Vital icon="حرارة" value={`${v.vitals.temp}°`} />}
          {v.vitals.weight && <Vital icon="وزن" value={`${v.vitals.weight}kg`} />}
        </div>
      )}
      {v.privateNotes && (
        <p className="mt-3 rounded-lg bg-muted/40 p-3 text-xs text-muted-foreground">
          <span className="font-semibold text-foreground">ملاحظات خاصة (لك فقط): </span>
          {v.privateNotes}
        </p>
      )}
    </article>
  );
}

function Vital({ icon, value }: { icon: string; value: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5">
      <Activity className="h-3 w-3" aria-hidden="true" />
      <span className="font-semibold text-foreground">{icon}:</span> {value}
    </span>
  );
}

function RxExpander({
  v,
  items,
  onOpen,
}: {
  v: MedicalRecord;
  items: Prescription[] | undefined;
  onOpen: () => void;
}) {
  const [open, setOpen] = useState(false);
  const dateAr = new Date(v.visitDate).toLocaleDateString("ar-EG");
  return (
    <details
      className="rounded-xl border border-border bg-card"
      onToggle={(e) => {
        const isOpen = (e.target as HTMLDetailsElement).open;
        setOpen(isOpen);
        if (isOpen) onOpen();
      }}
    >
      <summary className="flex cursor-pointer items-center justify-between p-4 text-sm font-medium text-foreground">
        <span className="flex items-center gap-2">
          <Pill className="h-4 w-4 text-primary" aria-hidden="true" />
          وصفات زيارة {dateAr}
        </span>
        <ChevronDown
          className={"h-4 w-4 transition " + (open ? "rotate-180" : "")}
          aria-hidden="true"
        />
      </summary>
      <div className="border-t border-border p-4">
        {!items ? (
          <Loader2 className="h-4 w-4 animate-spin text-primary" />
        ) : items.length === 0 ? (
          <p className="text-sm text-muted-foreground">لم تصدر وصفة لهذه الزيارة.</p>
        ) : (
          items.map((rx) => (
            <div key={rx.id} className="mb-4 last:mb-0">
              <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
                <span className="font-mono">{rx.prescriptionNumber}</span>
                <div className="flex items-center gap-3">
                  {rx.validUntil && <span>صالحة حتى {rx.validUntil}</span>}
                  <Link
                    to="/rx/$id"
                    params={{ id: rx.id }}
                    className="font-medium text-primary hover:underline"
                  >
                    طباعة ↗
                  </Link>
                </div>
              </div>
              <ul className="space-y-2">
                {rx.items.map((it) => (
                  <li
                    key={it.id}
                    className="rounded-md border border-border bg-background p-3 text-sm"
                  >
                    <div className="font-semibold text-foreground">{it.drugName}</div>
                    <div className="text-xs text-muted-foreground">
                      {it.dosage} · {it.frequency} · {it.duration}
                      {it.route && ` · ${it.route}`}
                    </div>
                    {it.instructions && (
                      <div className="mt-1 text-xs text-foreground">
                        ⓘ {it.instructions}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}
      </div>
    </details>
  );
}

function EmptyTab({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-card py-12 text-center text-muted-foreground">
      {message}
    </div>
  );
}
