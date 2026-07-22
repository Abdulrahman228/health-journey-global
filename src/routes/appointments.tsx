import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/hooks/useLanguage";
import { useCurrency } from "@/hooks/useCurrency";
import { supabase } from "@/integrations/supabase/client";
import { Calendar, Clock, Loader2, X, CheckCircle2, Video, Building2, User as UserIcon, Stethoscope, ReceiptText } from "lucide-react";
import { toast } from "sonner";
import { ConsultationsInbox } from "@/components/ConsultationsInbox";
export const Route = createFileRoute("/appointments")({
  head: () => ({
    meta: [
      { title: "My Appointments — Tabibi" },
      { name: "description", content: "Manage your appointments on Tabibi." },
    ],
  }),
  component: AppointmentsPage,
});

interface EnrichedAppointment {
  id: string;
  scheduled_at: string;
  appointment_type: string;
  status: string;
  fee: number;
  notes: string | null;
  patient_id: string;
  doctor_id: string;
  counterpart_name: string;
  counterpart_subtitle: string | null;
  iAmDoctor: boolean;
  currency: string;
  payment_status: string | null;
}

function AppointmentsPage() {
  const { t } = useLanguage();
  const { user, profile, role, isLoading: authLoading } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { formatPrice } = useCurrency();

  useEffect(() => {
    if (!authLoading && !user) navigate({ to: "/login" });
  }, [authLoading, user, navigate]);

  // For doctors, profile.id is their profile_id but appointments use doctor_details.id.
  // Resolve the doctor_details.id when role === doctor.
  const { data: doctorDetailsId } = useQuery({
    queryKey: ["my-doctor-details-id", profile?.id],
    enabled: !!profile?.id && role === "doctor",
    queryFn: async () => {
      const { data, error } = await supabase
        .from("doctor_details")
        .select("id")
        .eq("profile_id", profile!.id)
        .maybeSingle();
      if (error) throw error;
      return data?.id ?? null;
    },
  });

  const { data: appointments = [], isLoading } = useQuery({
    queryKey: ["appointments", profile?.id, doctorDetailsId],
    enabled: !!profile?.id,
    queryFn: async (): Promise<EnrichedAppointment[]> => {
      const filters: string[] = [`patient_id.eq.${profile!.id}`];
      if (doctorDetailsId) filters.push(`doctor_id.eq.${doctorDetailsId}`);
      const { data, error } = await supabase
        .from("appointments")
        .select("*")
        .or(filters.join(","))
        .order("scheduled_at", { ascending: false });
      if (error) throw error;

      // Collect referenced IDs
      const doctorIds = Array.from(new Set(data.map((a) => a.doctor_id)));
      const patientProfileIds = Array.from(new Set(data.map((a) => a.patient_id)));

      const [docs, pats] = await Promise.all([
        doctorIds.length
          ? supabase
              .from("doctor_details")
              .select("id, specialty, currency, profile_id")
              .in("id", doctorIds)
          : Promise.resolve({ data: [] as any[], error: null }),
        patientProfileIds.length
          ? supabase.from("profiles").select("id, full_name").in("id", patientProfileIds)
          : Promise.resolve({ data: [] as any[], error: null }),
      ]);

      const docProfileIds = (docs.data ?? []).map((d: any) => d.profile_id);
      const { data: docProfiles = [] } = docProfileIds.length
        ? await supabase.from("profiles").select("id, full_name").in("id", docProfileIds)
        : { data: [] as any[] };

      const docById = new Map(
        (docs.data ?? []).map((d: any) => {
          const p = docProfiles?.find((x: any) => x.id === d.profile_id);
          return [
            d.id,
            { name: p?.full_name ?? "Doctor", specialty: d.specialty as string, currency: d.currency as string },
          ];
        }),
      );
      const patById = new Map((pats.data ?? []).map((p: any) => [p.id, p.full_name as string]));

      return data.map((a) => {
        const iAmDoctor = !!doctorDetailsId && a.doctor_id === doctorDetailsId;
        const doc = docById.get(a.doctor_id);
        return {
          id: a.id,
          scheduled_at: a.scheduled_at,
          appointment_type: a.appointment_type,
          status: a.status,
          fee: Number(a.fee ?? 0),
          notes: a.notes,
          patient_id: a.patient_id,
          doctor_id: a.doctor_id,
          iAmDoctor,
          counterpart_name: iAmDoctor
            ? patById.get(a.patient_id) ?? t("Patient", "مريض")
            : doc?.name ?? t("Doctor", "طبيب"),
          counterpart_subtitle: iAmDoctor ? null : doc?.specialty ?? null,
          currency: doc?.currency ?? "EGP",
          payment_status: (a.payment_status as string | null) ?? null,
        };
      });
    },
  });

  useEffect(() => {
    if (!profile?.id) return;

    const channels = [
      supabase
        .channel(`appointments-patient-${profile.id}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "appointments",
            filter: `patient_id=eq.${profile.id}`,
          },
          () => {
            queryClient.invalidateQueries({ queryKey: ["appointments"] });
          },
        )
        .subscribe(),
    ];

    if (doctorDetailsId) {
      channels.push(
        supabase
          .channel(`appointments-doctor-${doctorDetailsId}`)
          .on(
            "postgres_changes",
            {
              event: "*",
              schema: "public",
              table: "appointments",
              filter: `doctor_id=eq.${doctorDetailsId}`,
            },
            () => {
              queryClient.invalidateQueries({ queryKey: ["appointments"] });
              queryClient.invalidateQueries({ queryKey: ["doctor_appointments", doctorDetailsId] });
            },
          )
          .subscribe(),
      );
    }

    return () => {
      channels.forEach((channel) => {
        supabase.removeChannel(channel);
      });
    };
  }, [profile?.id, doctorDetailsId, queryClient]);

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase.from("appointments").update({ status }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_d, vars) => {
      const messages: Record<string, [string, string]> = {
        cancelled: ["Appointment cancelled", "تم إلغاء الموعد"],
        confirmed: ["Appointment confirmed", "تم تأكيد الموعد"],
        completed: ["Appointment completed", "تم إنهاء الموعد"],
      };
      const m = messages[vars.status];
      if (m) toast.success(t(m[0], m[1]));
      queryClient.invalidateQueries({ queryKey: ["appointments"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const grouped = useMemo(() => {
    const upcoming: EnrichedAppointment[] = [];
    const past: EnrichedAppointment[] = [];
    const now = Date.now();
    for (const a of appointments) {
      const ts = new Date(a.scheduled_at).getTime();
      if (ts >= now && a.status !== "cancelled" && a.status !== "completed") upcoming.push(a);
      else past.push(a);
    }
    upcoming.sort((a, b) => +new Date(a.scheduled_at) - +new Date(b.scheduled_at));
    return { upcoming, past };
  }, [appointments]);

  if (authLoading || isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-8">
      <h1 className="text-3xl font-bold text-foreground mb-2">{t("My Appointments", "مواعيدي")}</h1>
      <p className="text-muted-foreground mb-8">
        {role === "doctor"
          ? t("Manage your patient appointments.", "تابع مواعيد مرضاك.")
          : t("Manage your upcoming and past appointments.", "تابع مواعيدك القادمة والسابقة.")}
      </p>

      {appointments.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-border rounded-2xl">
          <Calendar className="mx-auto h-12 w-12 text-muted-foreground" />
          <p className="mt-4 text-muted-foreground">{t("No appointments yet.", "لا توجد مواعيد بعد.")}</p>
          {role !== "doctor" && (
            <Link to="/doctors" className="mt-4 inline-block px-5 py-2 bg-primary text-primary-foreground rounded-lg font-medium hover:opacity-90">
              {t("Find a doctor", "ابحث عن طبيب")}
            </Link>
          )}
        </div>
      ) : (
        <div className="space-y-8">
          {grouped.upcoming.length > 0 && (
            <Section
              title={t("Upcoming", "القادمة")}
              items={grouped.upcoming}
              t={t}
              onUpdate={(id, status) => updateStatus.mutate({ id, status })}
              formatPrice={formatPrice}
            />
          )}
          {grouped.past.length > 0 && (
            <Section
              title={t("Past", "السابقة")}
              items={grouped.past}
              t={t}
              onUpdate={(id, status) => updateStatus.mutate({ id, status })}
              formatPrice={formatPrice}
              isPast
            />
          )}
        </div>
      )}

      {/* Online consultation requests */}
      <div className="mt-10">
        <ConsultationsInbox />
      </div>
    </div>
  );
}

function Section({
  title,
  items,
  t,
  onUpdate,
  formatPrice,
  isPast,
}: {
  title: string;
  items: EnrichedAppointment[];
  t: (en: string, ar: string) => string;
  onUpdate: (id: string, status: string) => void;
  formatPrice: (amount: number, currency: string) => string;
  isPast?: boolean;
}) {
  return (
    <section>
      <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3">{title}</h2>
      <div className="space-y-3">
        {items.map((a) => {
          const date = new Date(a.scheduled_at);
          const statusColor =
            ({
              pending: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
              confirmed: "bg-primary/10 text-primary",
              completed: "bg-teal/10 text-teal",
              cancelled: "bg-destructive/10 text-destructive",
            } as Record<string, string>)[a.status] ?? "bg-muted text-muted-foreground";

          return (
            <div key={a.id} className="bg-card border border-border rounded-xl p-5 flex items-start justify-between gap-4 flex-wrap">
              <div className="flex items-start gap-4 min-w-0 flex-1">
                <div className={`h-12 w-12 rounded-lg flex items-center justify-center shrink-0 ${a.appointment_type === "video" ? "bg-teal/10 text-teal" : "bg-primary/10 text-primary"}`}>
                  {a.appointment_type === "video" ? <Video className="h-6 w-6" /> : <Building2 className="h-6 w-6" />}
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 text-foreground font-semibold">
                    {a.iAmDoctor ? <UserIcon className="h-4 w-4" /> : <Stethoscope className="h-4 w-4" />}
                    <span className="truncate">{a.counterpart_name}</span>
                  </div>
                  {a.counterpart_subtitle && (
                    <p className="text-xs text-muted-foreground mt-0.5">{a.counterpart_subtitle}</p>
                  )}
                  <p className="text-sm text-foreground mt-1.5">
                    <Calendar className="inline h-3.5 w-3.5 me-1" />
                    {date.toLocaleDateString()}
                    <span className="text-muted-foreground"> · </span>
                    <Clock className="inline h-3.5 w-3.5 mx-1" />
                    {date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </p>
                  <div className="mt-1.5 flex items-center gap-2 text-sm flex-wrap">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColor}`}>{a.status}</span>
                    <span className="text-muted-foreground">{formatPrice(a.fee, a.currency)}</span>
                  </div>
                  {a.notes && <p className="mt-2 text-xs text-muted-foreground italic">"{a.notes}"</p>}
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {a.payment_status &&
                  ["paid", "refunded", "partially_refunded"].includes(a.payment_status) && (
                    <Link
                      to="/receipt/$appointmentId"
                      params={{ appointmentId: a.id }}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-border text-sm font-medium hover:bg-muted"
                      title={t("View receipt", "عرض الإيصال")}
                    >
                      <ReceiptText className="h-4 w-4" />
                      {t("Receipt", "الإيصال")}
                    </Link>
                  )}
                {a.appointment_type === "video" && a.status === "confirmed" && !isPast && (
                  <Link
                    to="/consultation/$id"
                    params={{ id: a.id }}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-teal text-white text-sm font-medium hover:opacity-90"
                  >
                    <Video className="h-4 w-4" />
                    {t("Join", "ادخل")}
                  </Link>
                )}
                {a.iAmDoctor && a.status === "pending" && (
                  <button
                    onClick={() => onUpdate(a.id, "confirmed")}
                    className="inline-flex items-center gap-1 px-3 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90"
                  >
                    <CheckCircle2 className="h-4 w-4" /> {t("Confirm", "تأكيد")}
                  </button>
                )}
                {a.iAmDoctor && a.status === "confirmed" && isPast && (
                  <button
                    onClick={() => onUpdate(a.id, "completed")}
                    className="inline-flex items-center gap-1 px-3 py-2 rounded-lg bg-teal text-white text-sm font-medium hover:opacity-90"
                  >
                    <CheckCircle2 className="h-4 w-4" /> {t("Complete", "إنهاء")}
                  </button>
                )}
                {a.status !== "cancelled" && a.status !== "completed" && !isPast && (
                  <button
                    onClick={() => onUpdate(a.id, "cancelled")}
                    className="p-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg transition"
                    title={t("Cancel", "إلغاء")}
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
                {a.status === "completed" && <CheckCircle2 className="h-5 w-5 text-teal" />}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
