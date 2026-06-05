import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/hooks/useLanguage";
import { useAuth } from "@/hooks/useAuth";
import { Loader2, Building2, MapPin, Calendar, Clock, Users, CheckCircle2, AlertCircle, Phone } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/my-queue/$appointmentId")({
  component: MyQueuePage,
});

type Appointment = {
  id: string;
  patient_id: string;
  doctor_id: string;
  clinic_id: string | null;
  appointment_date: string | null;
  queue_number: number | null;
  estimated_start_at: string | null;
  status: string;
  fee: number;
  notes: string | null;
  called_at: string | null;
  started_at: string | null;
};

type QueueRow = {
  appointment_id: string;
  queue_number: number;
  status: string;
  estimated_start_at: string | null;
  called_at: string | null;
};

function statusLabel(s: string): { text: string; color: string; icon: typeof Clock } {
  switch (s) {
    case "waiting":     return { text: "في الانتظار", color: "text-amber-600 bg-amber-50",   icon: Clock };
    case "called":      return { text: "تم النداء", color: "text-blue-700 bg-blue-50",      icon: AlertCircle };
    case "in_progress": return { text: "داخل الكشف", color: "text-emerald-700 bg-emerald-50", icon: CheckCircle2 };
    case "completed":   return { text: "اكتمل",       color: "text-gray-600 bg-gray-100",     icon: CheckCircle2 };
    case "cancelled":   return { text: "ملغي",        color: "text-red-700 bg-red-50",         icon: AlertCircle };
    case "no_show":     return { text: "لم يحضر",      color: "text-red-700 bg-red-50",         icon: AlertCircle };
    default:            return { text: s,             color: "text-gray-600 bg-gray-100",     icon: Clock };
  }
}

function formatTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleTimeString("ar-EG", { hour: "2-digit", minute: "2-digit", hour12: true });
}

function formatWait(minutes: number): string {
  if (minutes <= 0) return "حان دورك";
  if (minutes < 60) return `~${Math.round(minutes)} دقيقة`;
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes - h * 60);
  return m === 0 ? `~${h} ساعة` : `~${h}س ${m}د`;
}

function MyQueuePage() {
  const { appointmentId } = Route.useParams();
  const { t } = useLanguage();
  const { user } = useAuth();
  const [now, setNow] = useState<Date>(new Date());

  // tick every 30s to refresh "wait" computation
  useEffect(() => {
    const i = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(i);
  }, []);

  // The patient's own appointment
  const { data: appt, refetch: refetchAppt, isLoading } = useQuery({
    queryKey: ["my-appt", appointmentId],
    queryFn: async (): Promise<(Appointment & { clinic?: { name: string; address: string | null; city: string | null; phone: string | null } | null; doctor_details?: { specialty: string | null; profiles?: { full_name: string | null } | null } | null }) | null> => {
      const { data, error } = await supabase
        .from("appointments")
        .select(`
          id, patient_id, doctor_id, clinic_id, appointment_date,
          queue_number, estimated_start_at, status, fee, notes,
          called_at, started_at,
          clinic:clinics ( name, address, city, phone ),
          doctor_details:doctor_details!appointments_doctor_id_fkey (
            specialty,
            profiles!doctor_details_profile_id_fkey ( full_name )
          )
        `)
        .eq("id", appointmentId)
        .maybeSingle();
      if (error) throw error;
      return data as any;
    },
  });

  // Whole queue for that clinic+date — used to derive position + ahead count
  const { data: queue = [], refetch: refetchQueue } = useQuery({
    queryKey: ["queue", appt?.clinic_id, appt?.appointment_date],
    enabled: Boolean(appt?.clinic_id && appt?.appointment_date),
    queryFn: async (): Promise<QueueRow[]> => {
      const { data, error } = await supabase
        .from("v_clinic_queue")
        .select("*")
        .eq("clinic_id", appt!.clinic_id!)
        .eq("appointment_date", appt!.appointment_date!)
        .order("queue_number");
      if (error) throw error;
      return (data ?? []) as QueueRow[];
    },
  });

  // === Realtime subscription on appointments for this clinic+date ===
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

  // === Cancel my booking ===
  const handleCancel = async () => {
    if (!confirm("هل أنت متأكد من إلغاء الحجز؟")) return;
    const { error } = await supabase.rpc("cancel_appointment", {
      p_appointment_id: appointmentId,
    });
    if (error) toast.error(error.message);
    else {
      toast.success("تم إلغاء الحجز");
      refetchAppt();
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!appt) {
    return (
      <div className="min-h-screen flex items-center justify-center text-center px-4">
        <div>
          <AlertCircle className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
          <h1 className="text-xl font-semibold mb-2">الحجز غير موجود</h1>
          <Link to="/appointments" className="text-primary underline">العودة لحجوزاتي</Link>
        </div>
      </div>
    );
  }

  if (!user || user.id !== undefined) {
    // (RLS will already filter; this is just UX)
  }

  // Derive live position
  const myIdx = queue.findIndex((q) => q.appointment_id === appt.id);
  const ahead = queue
    .slice(0, myIdx >= 0 ? myIdx : 0)
    .filter((q) => q.status === "waiting" || q.status === "called" || q.status === "in_progress").length;
  const currentlyServing = queue.find((q) => q.status === "in_progress" || q.status === "called");

  // Wait estimate: use estimated_start_at if it's in the future, else 0
  const waitMinutes = appt.estimated_start_at
    ? Math.max(0, (new Date(appt.estimated_start_at).getTime() - now.getTime()) / 60000)
    : 0;

  const sl = statusLabel(appt.status);
  const StatusIcon = sl.icon;
  const isTerminal = appt.status === "completed" || appt.status === "cancelled" || appt.status === "no_show";

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-6 max-w-2xl">
        <div className="mb-4">
          <Link to="/appointments" className="text-sm text-muted-foreground hover:text-primary">
            ← {t("My appointments", "حجوزاتي")}
          </Link>
        </div>

        {/* Status header */}
        <div className="bg-card border border-border rounded-2xl p-6 mb-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h1 className="text-xl font-bold">
                {appt.doctor_details?.profiles?.full_name
                  ? `د. ${appt.doctor_details.profiles.full_name}`
                  : "الطبيب"}
              </h1>
              <p className="text-sm text-muted-foreground">
                {appt.doctor_details?.specialty ?? ""}
              </p>
            </div>
            <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium ${sl.color}`}>
              <StatusIcon className="h-4 w-4" />
              {sl.text}
            </span>
          </div>

          {/* Live queue metrics */}
          {!isTerminal && (
            <div className="grid grid-cols-3 gap-3 mt-4">
              <div className="text-center bg-primary/5 rounded-xl p-3">
                <div className="text-xs text-muted-foreground">رقمك</div>
                <div className="text-3xl font-bold text-primary mt-1">
                  #{appt.queue_number ?? "—"}
                </div>
              </div>
              <div className="text-center bg-amber-50 dark:bg-amber-950/30 rounded-xl p-3">
                <div className="text-xs text-muted-foreground">أمامك</div>
                <div className="text-3xl font-bold text-amber-700 dark:text-amber-300 mt-1 flex items-center justify-center gap-1">
                  <Users className="h-5 w-5" />
                  {ahead}
                </div>
              </div>
              <div className="text-center bg-emerald-50 dark:bg-emerald-950/30 rounded-xl p-3">
                <div className="text-xs text-muted-foreground">انتظار متوقع</div>
                <div className="text-xl font-bold text-emerald-700 dark:text-emerald-300 mt-1">
                  {formatWait(waitMinutes)}
                </div>
              </div>
            </div>
          )}

          {/* Currently serving */}
          {currentlyServing && currentlyServing.appointment_id !== appt.id && (
            <div className="mt-4 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900 rounded-xl p-3 text-center">
              <p className="text-xs text-blue-700 dark:text-blue-300">
                المريض الحالي داخل الكشف
              </p>
              <p className="text-2xl font-bold text-blue-800 dark:text-blue-200 mt-1">
                #{currentlyServing.queue_number}
              </p>
            </div>
          )}

          {/* Call alert */}
          {appt.status === "called" && (
            <div className="mt-4 bg-emerald-50 dark:bg-emerald-950/30 border-2 border-emerald-400 rounded-xl p-4 text-center animate-pulse">
              <CheckCircle2 className="h-8 w-8 mx-auto text-emerald-600 mb-2" />
              <p className="text-lg font-bold text-emerald-800 dark:text-emerald-200">
                دورك الآن — تفضّل للعيادة
              </p>
            </div>
          )}

          {/* In progress */}
          {appt.status === "in_progress" && (
            <div className="mt-4 bg-blue-50 dark:bg-blue-950/30 rounded-xl p-4 text-center">
              <p className="text-sm font-medium text-blue-800 dark:text-blue-200">
                أنت داخل الكشف الآن
              </p>
            </div>
          )}
        </div>

        {/* Clinic details */}
        <div className="bg-card border border-border rounded-2xl p-6 mb-4">
          <h2 className="text-sm font-semibold text-muted-foreground mb-3">العيادة</h2>
          {appt.clinic ? (
            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2">
                <Building2 className="h-4 w-4 text-primary shrink-0" />
                <span className="font-medium">{appt.clinic.name}</span>
              </div>
              {appt.clinic.address && (
                <div className="flex items-start gap-2">
                  <MapPin className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                  <span>
                    {appt.clinic.address}
                    {appt.clinic.city && <> — {appt.clinic.city}</>}
                  </span>
                </div>
              )}
              {appt.clinic.phone && (
                <a
                  href={`tel:${appt.clinic.phone}`}
                  className="flex items-center gap-2 text-primary hover:underline"
                >
                  <Phone className="h-4 w-4" />
                  {appt.clinic.phone}
                </a>
              )}
              <div className="flex items-center gap-2 pt-2 border-t border-border">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <span>
                  {appt.appointment_date
                    ? new Date(appt.appointment_date).toLocaleDateString("ar-EG", {
                        weekday: "long", year: "numeric", month: "long", day: "numeric",
                      })
                    : "—"}
                </span>
              </div>
              {appt.estimated_start_at && (
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <span>الوقت المتوقع: {formatTime(appt.estimated_start_at)}</span>
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">لا توجد عيادة محددة (كشف فيديو)</p>
          )}
        </div>

        {/* Actions */}
        {!isTerminal && (
          <button
            onClick={handleCancel}
            className="w-full py-3 rounded-xl border border-red-200 text-red-600 hover:bg-red-50 font-medium"
          >
            إلغاء الحجز
          </button>
        )}
      </div>
    </div>
  );
}
