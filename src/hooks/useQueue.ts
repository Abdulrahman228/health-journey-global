import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

// Fallback per-visit minutes, used ONLY when estimated_start_at is null. The
// queue RPCs (book_queue_appointment / advance_queue) compute estimated_start_at
// server-side, which we prefer over `ahead × avg` since there is no per-doctor
// avg_visit_duration column.
const DEFAULT_AVG_VISIT_MINUTES = 15;

const ACTIVE_STATUSES = new Set(["waiting", "called", "in_progress"]);

type QueueRow = {
  appointment_id: string;
  queue_number: number;
  status: string;
  estimated_start_at: string | null;
};

export interface QueueState {
  isLoading: boolean;
  found: boolean;
  status: string | null;
  queueNumber: number | null;
  /** 1-based position (1 = you're next/being served). */
  position: number | null;
  /** Active patients still ahead of you. */
  aheadCount: number;
  /** Estimated wait in minutes (0 = your turn). */
  waitMinutes: number;
  /** queue_number currently being served, if any. */
  currentlyServing: number | null;
}

/**
 * Live clinic-queue state for a patient's appointment: position + estimated wait,
 * kept fresh via a Supabase Realtime subscription on the clinic's appointments.
 *
 * Keyed by `appointmentId` (not doctorId+scheduledAt): the queue is per
 * clinic+day, which a single appointment resolves unambiguously. Reuses the
 * proven `v_clinic_queue` + `estimated_start_at` model from the my-queue page.
 */
export function useQueue(appointmentId: string | null | undefined): QueueState {
  const [now, setNow] = useState(() => Date.now());

  // Re-tick every 30s so the wait estimate decays even without a DB event.
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  const {
    data: appt,
    isLoading,
    refetch: refetchAppt,
  } = useQuery({
    queryKey: ["queue-appt", appointmentId],
    enabled: Boolean(appointmentId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("appointments")
        .select("id, clinic_id, appointment_date, queue_number, estimated_start_at, status")
        .eq("id", appointmentId as string)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: queue = [], refetch: refetchQueue } = useQuery({
    queryKey: ["queue-list", appt?.clinic_id, appt?.appointment_date],
    enabled: Boolean(appt?.clinic_id && appt?.appointment_date),
    queryFn: async (): Promise<QueueRow[]> => {
      const clinicId = appt?.clinic_id;
      const apptDate = appt?.appointment_date;
      if (!clinicId || !apptDate) return [];
      const { data, error } = await supabase
        .from("v_clinic_queue")
        .select("appointment_id, queue_number, status, estimated_start_at")
        .eq("clinic_id", clinicId)
        .eq("appointment_date", apptDate)
        .order("queue_number");
      if (error) throw error;
      return (data ?? []) as QueueRow[];
    },
  });

  // Realtime: refetch on any change to this clinic's appointments today.
  useEffect(() => {
    if (!appt?.clinic_id || !appt?.appointment_date) return;
    const ch = supabase
      .channel(`queue-${appt.clinic_id}-${appt.appointment_date}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "appointments",
          filter: `clinic_id=eq.${appt.clinic_id}`,
        },
        () => {
          refetchAppt();
          refetchQueue();
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [appt?.clinic_id, appt?.appointment_date, refetchAppt, refetchQueue]);

  if (!appt) {
    return {
      isLoading,
      found: false,
      status: null,
      queueNumber: null,
      position: null,
      aheadCount: 0,
      waitMinutes: 0,
      currentlyServing: null,
    };
  }

  const myIdx = queue.findIndex((q) => q.appointment_id === appt.id);
  const aheadCount = queue
    .slice(0, myIdx >= 0 ? myIdx : 0)
    .filter((q) => ACTIVE_STATUSES.has(q.status)).length;
  const serving = queue.find((q) => q.status === "in_progress" || q.status === "called");

  // Prefer the server-computed ETA; fall back to `ahead × avg` when absent.
  const waitMinutes = appt.estimated_start_at
    ? Math.max(0, (new Date(appt.estimated_start_at).getTime() - now) / 60000)
    : aheadCount * DEFAULT_AVG_VISIT_MINUTES;

  return {
    isLoading,
    found: true,
    status: appt.status,
    queueNumber: appt.queue_number,
    position: aheadCount + 1,
    aheadCount,
    waitMinutes: Math.round(waitMinutes),
    currentlyServing: serving?.queue_number ?? null,
  };
}
