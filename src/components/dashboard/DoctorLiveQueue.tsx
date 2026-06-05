import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/hooks/useLanguage";
import { Users, Play, CheckCircle2, ChevronRight, Building2, Loader2, XCircle, Clock } from "lucide-react";
import { toast } from "sonner";

type ClinicLite = { id: string; name: string; city: string | null };

type QueueAppt = {
  id: string;
  queue_number: number;
  status: string;
  estimated_start_at: string | null;
  called_at: string | null;
  started_at: string | null;
  patient_id: string;
  notes: string | null;
  patient?: { full_name: string | null; phone: string | null } | null;
};

const TODAY = () => new Date().toISOString().split("T")[0];

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
      const { data, error } = await supabase
        .from("appointments")
        .select(`
          id, queue_number, status, estimated_start_at, called_at, started_at,
          patient_id, notes,
          patient:profiles!appointments_patient_id_fkey ( full_name, phone )
        `)
        .eq("clinic_id", selectedClinicId!)
        .eq("appointment_date", TODAY())
        .in("status", ["waiting", "called", "in_progress", "completed"])
        .order("queue_number");
      if (error) throw error;
      return (data ?? []) as any;
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
    onSuccess: (row: any) => {
      if (!row) toast.info("لا يوجد مرضى في الانتظار");
      else toast.success(`تم نداء المريض #${row.queue_number}`);
      queryClient.invalidateQueries({ queryKey: ["doctor-queue"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const startVisit = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.rpc("start_visit", { p_appointment_id: id });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["doctor-queue"] }),
    onError: (e: Error) => toast.error(e.message),
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
    onError: (e: Error) => toast.error(e.message),
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
    onError: (e: Error) => toast.error(e.message),
  });

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
            <StatBlock label="بالانتظار" value={waiting.length} color="amber" />
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

          {/* Waiting list */}
          {waiting.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              لا يوجد مرضى في الانتظار
            </p>
          ) : (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-muted-foreground">قائمة الانتظار</h3>
              {waiting.map((q) => (
                <QueueRow key={q.id} q={q} onCancel={() => cancelAppt.mutate(q.id)} />
              ))}
            </div>
          )}
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
        <button
          onClick={onComplete}
          disabled={isCompletePending}
          className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-medium hover:opacity-90 disabled:opacity-50 flex items-center gap-1"
        >
          <CheckCircle2 className="h-4 w-4" /> إنهاء الكشف
        </button>
      )}
    </div>
  );
}

function QueueRow({ q, onCancel }: { q: QueueAppt; onCancel: () => void }) {
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
        className="p-1.5 rounded-lg text-destructive hover:bg-destructive/10"
        title="إلغاء"
      >
        <XCircle className="h-4 w-4" />
      </button>
    </div>
  );
}
