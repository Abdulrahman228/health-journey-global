import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/hooks/useLanguage";
import {
  Users,
  Play,
  CheckCircle2,
  ChevronRight,
  Building2,
  Loader2,
  XCircle,
  Clock,
  FilePlus2,
} from "lucide-react";
import { toast } from "sonner";

type ClinicLite = { id: string; name: string; city: string | null };

type QueueAppt = {
  id: string;
  queue_number: number | null;
  status: string;
  estimated_start_at: string | null;
  called_at: string | null;
  started_at: string | null;
  patient_id: string;
  notes: string | null;
  patient?: { full_name: string | null; phone: string | null } | null;
};

// LOCAL calendar day (YYYY-MM-DD). toISOString() is the UTC date, which in
// Egypt (UTC+2/+3) is still "yesterday" until 02:00/03:00 — advance_queue
// would then look at the wrong day's queue.
const TODAY = () => {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

/** RPC errors are mostly Arabic already; prefix the English ones. */
const queueError = (e: Error) =>
  /[؀-ۿ]/.test(e.message) ? e.message : `تعذّر تنفيذ الإجراء — ${e.message}`;

// Local-day window [00:00, next 00:00) as ISO — matches how the dashboard counts
// "today" (by scheduled_at), so the queue and the dashboard agree. Filtering by
// scheduled_at (always set) instead of appointment_date (queue-only, often null
// on regular bookings) is why appointments were missing from the queue.
const todayWindow = () => {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const end = new Date(start.getTime() + 86_400_000);
  return { start: start.toISOString(), end: end.toISOString() };
};

export function DoctorLiveQueue({ doctorDetailsId }: { doctorDetailsId: string }) {
  const { t } = useLanguage();
  const queryClient = useQueryClient();
  const [selectedClinicId, setSelectedClinicId] = useState<string | null>(null);

  // Load clinics
  const { data: clinics = [] } = useQuery({
    queryKey: ["my-clinics", doctorDetailsId],
    queryFn: async (): Promise<ClinicLite[]> => {
      const { data, error } = await supabase
        .from("clinics")
        .select("id, name, city")
        .eq("doctor_id", doctorDetailsId)
        .order("is_primary", { ascending: false });
      if (error) throw error;
      return (data ?? []) as ClinicLite[];
    },
  });

  useEffect(() => {
    if (!selectedClinicId && clinics.length > 0) {
      setSelectedClinicId(clinics[0].id);
    }
  }, [clinics, selectedClinicId]);

  // Load today's queue for selected clinic
  const { data: queue = [], refetch } = useQuery({
    queryKey: ["doctor-queue", selectedClinicId, TODAY()],
    enabled: Boolean(selectedClinicId),
    queryFn: async (): Promise<QueueAppt[]> => {
      const { start, end } = todayWindow();
      const { data, error } = await supabase
        .from("appointments")
        .select(`
          id, queue_number, status, estimated_start_at, called_at, started_at,
          patient_id, notes,
          patient:profiles!appointments_patient_id_fkey ( full_name, phone )
        `)
        .eq("clinic_id", selectedClinicId!)
        .gte("scheduled_at", start)
        .lt("scheduled_at", end)
        .in("status", ["pending", "confirmed", "waiting", "called", "in_progress", "completed"])
        .order("queue_number", { nullsFirst: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  // === Realtime subscribe ===
  useEffect(() => {
    if (!selectedClinicId) return;
    const ch = supabase
      .channel(`doc-queue-${selectedClinicId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "appointments", filter: `clinic_id=eq.${selectedClinicId}` },
        () => refetch(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [selectedClinicId, refetch]);

  // === Actions ===
  const callNext = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("advance_queue", {
        p_clinic_id: selectedClinicId ?? "",
        p_date: TODAY(),
      });
      if (error) throw error;
      return data;
    },
    onSuccess: (row) => {
      // An empty queue comes back as an all-NULL row (plpgsql composite), not null.
      if (!row?.id) toast.info("لا يوجد مرضى في الانتظار");
      else toast.success(`تم نداء المريض #${row.queue_number ?? ""}`);
      queryClient.invalidateQueries({ queryKey: ["doctor-queue"] });
    },
    onError: (e: Error) => toast.error(queueError(e)),
  });

  const startVisit = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc("start_visit", { p_appointment_id: id });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["doctor-queue"] }),
    onError: (e: Error) => toast.error(queueError(e)),
  });

  const completeVisit = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc("complete_visit", { p_appointment_id: id });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("تم إنهاء الكشف");
      queryClient.invalidateQueries({ queryKey: ["doctor-queue"] });
    },
    onError: (e: Error) => toast.error(queueError(e)),
  });

  const cancelAppt = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc("cancel_appointment", { p_appointment_id: id });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("تم الإلغاء");
      queryClient.invalidateQueries({ queryKey: ["doctor-queue"] });
    },
    onError: (e: Error) => toast.error(queueError(e)),
  });

  // Check a scheduled (confirmed) patient into the live queue.
  const checkIn = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc("check_in_appointment", { p_appointment_id: id });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("تم تسجيل الحضور");
      queryClient.invalidateQueries({ queryKey: ["doctor-queue"] });
    },
    onError: (e: Error) => toast.error(queueError(e)),
  });

  const scheduled  = queue.filter((q) => q.status === "confirmed" || q.status === "pending"); // booked, not checked in
  const waiting    = queue.filter((q) => q.status === "waiting");
  const called     = queue.find((q) => q.status === "called") ?? null;
  const inProgress = queue.find((q) => q.status === "in_progress") ?? null;
  const completed  = queue.filter((q) => q.status === "completed");

  return (
    <section className="bg-card border border-border rounded-2xl p-6 mt-6">
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <Users className="h-5 w-5 text-primary" />
          <h2 className="text-xl font-semibold text-foreground">
            {t("Today's queue", "طابور اليوم")}
          </h2>
        </div>
        {clinics.length > 1 && (
          <select
            value={selectedClinicId ?? ""}
            onChange={(e) => setSelectedClinicId(e.target.value)}
            className="rounded-lg border border-border bg-background px-3 py-1.5 text-sm"
          >
            {clinics.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} {c.city ? `· ${c.city}` : ""}
              </option>
            ))}
          </select>
        )}
      </div>

      {!selectedClinicId ? (
        <p className="text-sm text-muted-foreground text-center py-8">
          {t("Add a clinic first.", "أضف عيادة أولاً.")}
        </p>
      ) : (
        <>
          {/* Stats row */}
          <div className="grid grid-cols-4 gap-3 mb-5">
            <StatBlock label="بالانتظار" value={waiting.length + scheduled.length} color="amber" />
            <StatBlock label="منادى" value={called ? 1 : 0} color="blue" />
            <StatBlock label="داخل الكشف" value={inProgress ? 1 : 0} color="emerald" />
            <StatBlock label="مكتمل" value={completed.length} color="gray" />
          </div>

          {/* Active / called */}
          {(called || inProgress) && (
            <div className="mb-4 bg-primary/5 border border-primary/30 rounded-xl p-4">
              <div className="text-xs font-semibold text-primary mb-2">المريض الحالي</div>
              <ActiveCard
                appt={inProgress ?? called!}
                onStart={() => inProgress ? null : startVisit.mutate(called!.id)}
                onComplete={() => completeVisit.mutate((inProgress ?? called!).id)}
                isStartPending={startVisit.isPending}
                isCompletePending={completeVisit.isPending}
              />
            </div>
          )}

          {/* Action: Call Next */}
          {!inProgress && (
            <button
              onClick={() => callNext.mutate()}
              disabled={callNext.isPending || waiting.length === 0}
              className="w-full mb-5 py-3 rounded-xl bg-primary text-primary-foreground font-medium hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {callNext.isPending ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <>
                  <ChevronRight className="h-5 w-5" />
                  نادِ المريض التالي
                  {waiting.length > 0 && <span>(#{waiting[0].queue_number})</span>}
                </>
              )}
            </button>
          )}

          {/* Scheduled appointments — booked but not checked in yet */}
          {scheduled.length > 0 && (
            <div className="space-y-2 mb-5">
              <h3 className="text-sm font-semibold text-muted-foreground">
                مواعيد اليوم — سجّل الحضور
              </h3>
              {scheduled.map((q) => (
                <div
                  key={q.id}
                  className="flex items-center gap-3 rounded-lg border border-amber-200/60 bg-amber-50/60 px-3 py-2 dark:border-amber-900/40 dark:bg-amber-950/20"
                >
                  <div className="flex-1">
                    <div className="text-sm font-medium">{q.patient?.full_name ?? "مريض"}</div>
                    {q.estimated_start_at && (
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        {new Date(q.estimated_start_at).toLocaleTimeString("ar-EG", {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => checkIn.mutate(q.id)}
                    disabled={checkIn.isPending}
                    className="flex items-center gap-1 rounded-lg bg-teal px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
                  >
                    <CheckCircle2 className="h-4 w-4" /> تسجيل حضور
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Waiting list (checked-in) */}
          {waiting.length === 0 && scheduled.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              لا يوجد مرضى اليوم
            </p>
          ) : waiting.length > 0 ? (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-muted-foreground">قائمة الانتظار</h3>
              {waiting.map((q) => (
                <QueueRow
                  key={q.id}
                  q={q}
                  onCancel={() => cancelAppt.mutate(q.id)}
                  cancelPending={cancelAppt.isPending}
                />
              ))}
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}

function StatBlock({ label, value, color }: { label: string; value: number; color: string }) {
  const palette: Record<string, string> = {
    amber:   "bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300",
    blue:    "bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-300",
    emerald: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300",
    gray:    "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  };
  return (
    <div className={`rounded-xl p-3 text-center ${palette[color]}`}>
      <div className="text-xs">{label}</div>
      <div className="text-2xl font-bold mt-1">{value}</div>
    </div>
  );
}

function ActiveCard({
  appt, onStart, onComplete, isStartPending, isCompletePending,
}: {
  appt: QueueAppt;
  onStart: () => void;
  onComplete: () => void;
  isStartPending: boolean;
  isCompletePending: boolean;
}) {
  const isInProgress = appt.status === "in_progress";
  return (
    <div className="flex items-center gap-3">
      <div className="text-2xl font-bold text-primary w-16 text-center">
        #{appt.queue_number}
      </div>
      <div className="flex-1">
        <div className="font-semibold">{appt.patient?.full_name ?? "مريض"}</div>
        {appt.patient?.phone && (
          <a href={`tel:${appt.patient.phone}`} className="text-xs text-primary hover:underline">
            {appt.patient.phone}
          </a>
        )}
        {appt.notes && <p className="text-xs text-muted-foreground mt-1">{appt.notes}</p>}
      </div>
      {!isInProgress ? (
        <button
          onClick={onStart}
          disabled={isStartPending}
          className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:opacity-90 disabled:opacity-50 flex items-center gap-1"
        >
          <Play className="h-4 w-4" /> بدء الكشف
        </button>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          {/* Writing the visit with ?appointmentId completes this appointment
              server-side (createMedicalRecord) — the documented revenue path. */}
          <Link
            to="/dashboard/visit/new"
            search={{ patientId: appt.patient_id, appointmentId: appt.id }}
            className="px-4 py-2 rounded-lg border border-primary text-primary text-sm font-medium hover:bg-primary/10 flex items-center gap-1"
          >
            <FilePlus2 className="h-4 w-4" /> كتابة الكشف والوصفة
          </Link>
          <button
            onClick={onComplete}
            disabled={isCompletePending}
            className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:opacity-90 disabled:opacity-50 flex items-center gap-1"
          >
            <CheckCircle2 className="h-4 w-4" /> إنهاء الكشف
          </button>
        </div>
      )}
    </div>
  );
}

function QueueRow({
  q,
  onCancel,
  cancelPending,
}: {
  q: QueueAppt;
  onCancel: () => void;
  cancelPending: boolean;
}) {
  return (
    <div className="flex items-center gap-3 bg-muted/30 rounded-lg px-3 py-2">
      <div className="text-lg font-bold text-muted-foreground w-10 text-center">
        #{q.queue_number}
      </div>
      <div className="flex-1">
        <div className="text-sm font-medium">{q.patient?.full_name ?? "مريض"}</div>
        {q.estimated_start_at && (
          <div className="text-xs text-muted-foreground flex items-center gap-1">
            <Clock className="h-3 w-3" />
            متوقع: {new Date(q.estimated_start_at).toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit" })}
          </div>
        )}
      </div>
      <button
        onClick={onCancel}
        disabled={cancelPending}
        className="p-1.5 rounded-lg text-destructive hover:bg-destructive/10 disabled:opacity-50"
        title="إلغاء"
        aria-label="إلغاء الموعد"
      >
        <XCircle className="h-4 w-4" />
      </button>
    </div>
  );
}
