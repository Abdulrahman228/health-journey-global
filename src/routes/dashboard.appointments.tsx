/**
 * /dashboard/appointments — the doctor's appointment management (pending +
 * upcoming, with confirm / complete / cancel). This is the doctor-side view;
 * the patient-facing /appointments page is a different screen. Rendered inside
 * the DoctorShell via the /dashboard layout Outlet.
 */
import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/hooks/useLanguage";
import { supabase } from "@/integrations/supabase/client";
import { AppointmentRow } from "./dashboard";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/dashboard/appointments")({
  head: () => ({
    meta: [
      { title: "المواعيد — لوحة الطبيب — طبانا" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: DoctorAppointmentsPage,
});

interface Appt {
  id: string;
  scheduled_at: string;
  fee: number;
  status: string;
  notes: string | null;
  patient: { full_name: string | null } | null;
}

const UPCOMING_STATUSES = ["confirmed", "waiting", "called", "in_progress"];
const HISTORY_STATUSES = ["completed", "cancelled", "no_show"];

function DoctorAppointmentsPage() {
  const { t } = useLanguage();
  const { profile, isLoading: authLoading, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!authLoading && !isAuthenticated) navigate({ to: "/login" });
  }, [authLoading, isAuthenticated, navigate]);

  const { data: details } = useQuery({
    queryKey: ["doctor_details", profile?.id],
    enabled: !!profile?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("doctor_details")
        .select("id")
        .eq("profile_id", profile!.id)
        .maybeSingle();
      if (error) throw error;
      return data as { id: string } | null;
    },
  });

  const { data: appointments = [], isLoading } = useQuery({
    queryKey: ["doctor_appointments", details?.id],
    enabled: !!details?.id,
    queryFn: async () => {
      // Include the patient (name) — the doctor must see WHO the appointment is for.
      const { data, error } = await supabase
        .from("appointments")
        .select(
          "id, scheduled_at, fee, status, notes, patient:profiles!appointments_patient_id_fkey(full_name)",
        )
        .eq("doctor_id", details!.id)
        .order("scheduled_at", { ascending: false })
        .limit(300);
      if (error) throw error;
      return (data ?? []) as unknown as Appt[];
    },
  });

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      if (status === "completed") {
        // complete_visit sets ended_at and recomputes the queue ETAs; it needs a
        // clinic-bound appointment — doctor-booked follow-ups without a clinic
        // fall back to a plain status update (the revenue trigger still fires).
        const { error: rpcErr } = await supabase.rpc("complete_visit", { p_appointment_id: id });
        if (!rpcErr) return;
      }
      const { error } = await supabase.from("appointments").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_, vars) => {
      toast.success(
        vars.status === "confirmed"
          ? t("Appointment confirmed", "تم تأكيد الموعد")
          : vars.status === "completed"
            ? t("Marked as completed", "تم تمييزه كمكتمل")
            : t("Appointment cancelled", "تم إلغاء الموعد"),
      );
      queryClient.invalidateQueries({ queryKey: ["doctor_appointments"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const pending = appointments.filter((a) => a.status === "pending");
  const upcoming = appointments.filter((a) => UPCOMING_STATUSES.includes(a.status));
  const history = appointments.filter((a) => HISTORY_STATUSES.includes(a.status)).slice(0, 50);

  if (authLoading || isLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-10">
      <div>
        <h1 className="text-2xl font-bold text-foreground">{t("Appointments", "المواعيد")}</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {t(
            "Confirm requests and manage your upcoming visits.",
            "أكّد الطلبات وأدِر مواعيدك القادمة.",
          )}
        </p>
      </div>

      <section>
        <h2 className="mb-4 text-xl font-semibold text-foreground">
          {t("Pending Requests", "طلبات قيد الانتظار")}
        </h2>
        {pending.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            {t("No pending requests.", "لا توجد طلبات قيد الانتظار.")}
          </p>
        ) : (
          <div className="space-y-3">
            {pending.map((a) => (
              <AppointmentRow
                key={a.id}
                appt={a}
                onConfirm={() => updateStatus.mutate({ id: a.id, status: "confirmed" })}
                onReject={() => updateStatus.mutate({ id: a.id, status: "cancelled" })}
                mutationPending={updateStatus.isPending}
                t={t}
              />
            ))}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-4 text-xl font-semibold text-foreground">
          {t("Upcoming Appointments", "المواعيد القادمة")}
        </h2>
        {upcoming.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            {t("No upcoming appointments.", "لا توجد مواعيد قادمة.")}
          </p>
        ) : (
          <div className="space-y-3">
            {upcoming.map((a) => (
              <AppointmentRow
                key={a.id}
                appt={a}
                onComplete={() => updateStatus.mutate({ id: a.id, status: "completed" })}
                onReject={() => updateStatus.mutate({ id: a.id, status: "cancelled" })}
                mutationPending={updateStatus.isPending}
                t={t}
              />
            ))}
          </div>
        )}
        <div className="mt-6">
          <Link
            to="/dashboard/waiting-room"
            className="text-sm font-medium text-primary hover:underline"
          >
            {t("Open the waiting room →", "فتح صالة الانتظار ←")}
          </Link>
        </div>
      </section>

      <section>
        <h2 className="mb-4 text-xl font-semibold text-foreground">{t("History", "السجل")}</h2>
        {history.length === 0 ? (
          <p className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            {t("No past appointments yet.", "لا توجد مواعيد سابقة بعد.")}
          </p>
        ) : (
          <div className="space-y-3">
            {history.map((a) => (
              <AppointmentRow key={a.id} appt={a} t={t} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
