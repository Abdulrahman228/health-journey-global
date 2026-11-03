import { createFileRoute, useNavigate, Link, Outlet, useMatches } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/hooks/useLanguage";
import { TelemedicineToggle } from "@/components/doctor/TelemedicineToggle";
import { supabase } from "@/integrations/supabase/client";
import { ClinicsManager } from "@/components/dashboard/ClinicsManager";
import { DoctorLiveQueue } from "@/components/dashboard/DoctorLiveQueue";
import { EmergencyShiftButton } from "@/components/dashboard/EmergencyShiftButton";
import { PublicPageManager } from "@/components/dashboard/PublicPageManager";
import { ConsultationsInbox } from "@/components/ConsultationsInbox";
import { DoctorShell } from "@/components/doctor/DoctorNav";
import { PageHeader, StatCard } from "@/components/doctor/ui";
import {
  Loader2,
  CheckCircle2,
  XCircle,
  Calendar,
  Clock,
  Users,
  DollarSign,
  Stethoscope,
  Save,
  Megaphone,
  Globe,
  Lock,
  Video,
  FilePlus,
  UserPlus,
  Zap,
  TrendingUp,
  TrendingDown,
  Crown,
  ArrowRight,
  MessageSquare,
  MonitorSmartphone,
  ShieldAlert,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: "Doctor Dashboard — Tebana" },
      {
        name: "description",
        content: "Manage your schedule, appointments, and clinic profile on Tebana.",
      },
    ],
  }),
  component: DashboardPage,
});

interface DoctorDetails {
  id: string;
  profile_id: string;
  specialty: string | null;
  bio: string | null;
  clinic_name: string | null;
  clinic_address: string | null;
  consultation_fee: number | null;
  currency: string | null;
  years_experience: number | null;
  is_verified: boolean | null;
  verification_status: string | null;
}

const CURRENCIES = [
  "EGP",
  "USD",
  "EUR",
  "SAR",
  "AED",
  "KWD",
  "QAR",
  "BHD",
  "OMR",
  "JOD",
  "MAD",
  "TND",
  "DZD",
  "GBP",
];

function DashboardPage() {
  // When on a child route like /dashboard/analytics, render the child instead
  // of the dashboard home content (dashboard.tsx is a layout for nested routes).
  const matches = useMatches();
  const isChildRoute = matches.some(
    (m) =>
      m.routeId !== "__root__" && m.routeId !== "/dashboard" && m.routeId.startsWith("/dashboard"),
  );
  return <DoctorShell>{isChildRoute ? <Outlet /> : <DashboardHomePage />}</DoctorShell>;
}

function DashboardHomePage() {
  const { t } = useLanguage();
  const { user, role, profile, isLoading: authLoading } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  useEffect(() => {
    if (authLoading) return;
    if (!user) navigate({ to: "/login" });
    else if (role && role !== "doctor") navigate({ to: "/appointments" });
  }, [authLoading, user, role, navigate]);

  // Attribute a peer referral captured from ?ref= on /join-doctor, once the
  // invited doctor is signed in. Idempotent server-side; cleared on success.
  useEffect(() => {
    if (authLoading || role !== "doctor") return;
    let code: string | null = null;
    try {
      code = localStorage.getItem("tabibi_ref");
    } catch {
      code = null;
    }
    if (!code) return;
    void (async () => {
      const { error } = await supabase.rpc("attribute_referral", { p_code: code });
      if (!error) {
        try {
          localStorage.removeItem("tabibi_ref");
        } catch {
          /* ignore */
        }
      }
    })();
  }, [authLoading, role]);

  const { data: details, isLoading: detailsLoading } = useQuery({
    queryKey: ["doctor_details", profile?.id],
    enabled: !!profile?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("doctor_details")
        .select("*")
        .eq("profile_id", profile!.id)
        .maybeSingle();
      if (error) throw error;
      return data as DoctorDetails | null;
    },
  });

  const { data: activeTier } = useQuery({
    queryKey: ["doctor_active_tier", details?.id],
    enabled: !!details?.id,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("doctor_active_tier", {
        doctor_details_id: details!.id,
      });
      if (error) throw error;
      return (data as string | null) ?? "free";
    },
  });

  const { data: appointments = [], isLoading: aptLoading } = useQuery({
    queryKey: ["doctor_appointments", details?.id],
    enabled: !!details?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("appointments")
        .select("*")
        .eq("doctor_id", details!.id)
        .order("scheduled_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  useEffect(() => {
    if (!details?.id) return;

    const channel = supabase
      .channel(`dashboard-appointments-${details.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "appointments",
          filter: `doctor_id=eq.${details.id}`,
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ["doctor_appointments", details.id] });
          queryClient.invalidateQueries({ queryKey: ["appointments"] });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [details?.id, queryClient]);

  const updateStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
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

  const stats = useMemo(() => {
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const todayEnd = todayStart + 86_400_000;
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).getTime();

    const pending = appointments.filter((a) => a.status === "pending").length;
    const confirmed = appointments.filter((a) => a.status === "confirmed").length;
    const completed = appointments.filter((a) => a.status === "completed").length;
    const revenue = appointments
      .filter((a) => a.status === "completed")
      .reduce((sum, a) => sum + Number(a.fee ?? 0), 0);

    const todayAppts = appointments
      .filter((a) => {
        const ts = new Date(a.scheduled_at).getTime();
        return ts >= todayStart && ts < todayEnd && a.status !== "cancelled";
      })
      .sort((a, b) => new Date(a.scheduled_at).getTime() - new Date(b.scheduled_at).getTime());

    const monthRevenue = appointments
      .filter((a) => {
        const ts = new Date(a.scheduled_at).getTime();
        return a.status === "completed" && ts >= monthStart;
      })
      .reduce((sum, a) => sum + Number(a.fee ?? 0), 0);

    const prevMonthRevenue = appointments
      .filter((a) => {
        const ts = new Date(a.scheduled_at).getTime();
        return a.status === "completed" && ts >= prevMonthStart && ts < monthStart;
      })
      .reduce((sum, a) => sum + Number(a.fee ?? 0), 0);

    const revenueTrend =
      prevMonthRevenue > 0
        ? Math.round(((monthRevenue - prevMonthRevenue) / prevMonthRevenue) * 100)
        : monthRevenue > 0
          ? 100
          : 0;

    const uniquePatients = new Set(
      appointments.filter((a) => a.status === "completed").map((a: any) => a.patient_id),
    ).size;

    return {
      pending,
      confirmed,
      completed,
      revenue,
      todayAppts,
      monthRevenue,
      revenueTrend,
      uniquePatients,
      todayCount: todayAppts.length,
    };
  }, [appointments]);

  if (authLoading || detailsLoading || aptLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const hour = new Date().getHours();
  const greeting =
    hour < 12
      ? t("Good morning", "صباح الخير")
      : hour < 18
        ? t("Good afternoon", "مساء الخير")
        : t("Good evening", "مساء الخير");
  const doctorName = profile?.full_name ?? user?.email ?? "";
  const todayLabel = new Date().toLocaleDateString(t("en-US", "ar-EG"), {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  return (
    <div>
      <PageHeader
        eyebrow={todayLabel}
        title={`${greeting}، ${t("Dr.", "د.")} ${doctorName}`}
        description={t(
          "Your clinic at a glance — today's queue, requests and numbers.",
          "عيادتك في نظرة واحدة — طابور اليوم، الطلبات والأرقام.",
        )}
        actions={
          <>
            <Link
              to="/dashboard/visit/new"
              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3.5 text-sm font-semibold text-primary-foreground shadow-sm transition hover:opacity-90"
            >
              <Zap className="h-4 w-4" />
              {t("Start visit", "بدء كشف")}
            </Link>
            <Link
              to="/dashboard/waiting-room"
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-card px-3.5 text-sm font-medium text-foreground transition hover:bg-muted"
            >
              <MonitorSmartphone className="h-4 w-4" />
              {t("Waiting room", "صالة الانتظار")}
            </Link>
          </>
        }
      >
        {details && !details.is_verified && (
          <Link
            to="/doctor/verification"
            className="mt-4 flex items-start gap-3 rounded-xl border border-warning/30 bg-warning-soft px-4 py-3 text-sm text-foreground transition hover:border-warning/60"
          >
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
            <span>
              <span className="font-semibold">
                {t("Verification pending.", "التوثيق قيد المراجعة.")}
              </span>{" "}
              {t(
                "You'll appear in search results once approved — complete your documents to speed it up.",
                "ستظهر في نتائج البحث بعد الموافقة — أكمل مستنداتك لتسريع المراجعة.",
              )}
            </span>
          </Link>
        )}
      </PageHeader>

      {/* KPIs */}
      <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
        <StatCard
          icon={Calendar}
          label={t("Today's appointments", "مواعيد اليوم")}
          value={stats.todayCount}
          tone="primary"
        />
        <StatCard
          icon={Clock}
          label={t("Pending confirmation", "بانتظار التأكيد")}
          value={stats.pending}
          tone="warning"
        />
        <StatCard
          icon={CheckCircle2}
          label={t("Completed visits", "زيارات مكتملة")}
          value={stats.completed}
          tone="success"
        />
        <StatCard
          icon={Users}
          label={t("Patients", "المرضى")}
          value={stats.uniquePatients}
          tone="info"
        />
        <StatCard
          icon={DollarSign}
          label={t("Revenue this month", "إيراد هذا الشهر")}
          value={`${stats.monthRevenue.toLocaleString()} ${t("EGP", "ج.م")}`}
          trend={stats.revenueTrend}
          hint={t("vs. last month", "مقارنة بالشهر الماضي")}
        />
      </div>

      {/* Today's agenda + Quick actions */}
      <div className="mb-10 grid gap-5 lg:grid-cols-3">
        <TodayAgenda
          appts={stats.todayAppts}
          onConfirm={(id) => updateStatus.mutate({ id, status: "confirmed" })}
          onReject={(id) => updateStatus.mutate({ id, status: "cancelled" })}
          mutationPending={updateStatus.isPending}
          t={t}
        />
        <QuickActions t={t} isVerified={!!details?.is_verified} tier={activeTier ?? "free"} />
      </div>

      {/* Live queue (today) */}
      {details?.id && (
        <div className="mt-6 flex justify-end">
          <EmergencyShiftButton doctorId={details.id} />
        </div>
      )}
      {details?.id && <DoctorLiveQueue doctorDetailsId={details.id} />}

      {/* Online consultation requests inbox */}
      <section className="mt-8">
        <ConsultationsInbox />
      </section>
    </div>
  );
}

export function AppointmentRow({
  appt,
  onConfirm,
  onComplete,
  onReject,
  mutationPending,
  t,
}: {
  appt: { id: string; scheduled_at: string; fee: number; status: string; notes: string | null };
  onConfirm?: () => void;
  onComplete?: () => void;
  onReject?: () => void;
  mutationPending?: boolean;
  t: (en: string, ar: string) => string;
}) {
  const date = new Date(appt.scheduled_at);
  return (
    <div className="bg-card border border-border rounded-xl p-4 flex items-center justify-between gap-4 flex-wrap">
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
          <Calendar className="h-5 w-5" />
        </div>
        <div>
          <p className="font-medium text-foreground text-sm">
            {date.toLocaleDateString()} ·{" "}
            {date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {appt.fee ?? 0} {t("EGP", "ج.م")}
            {appt.notes && ` · ${appt.notes}`}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {onConfirm && (
          <button
            onClick={onConfirm}
            disabled={mutationPending}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-medium hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {mutationPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <CheckCircle2 className="h-3.5 w-3.5" />
            )}
            {t("Confirm", "تأكيد")}
          </button>
        )}
        {onComplete && (
          <button
            onClick={onComplete}
            disabled={mutationPending}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-teal/10 text-teal text-xs font-medium hover:bg-teal/20 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {mutationPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <CheckCircle2 className="h-3.5 w-3.5" />
            )}
            {t("Complete", "إكمال")}
          </button>
        )}
        {onReject && (
          <button
            onClick={onReject}
            disabled={mutationPending}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-destructive text-xs font-medium hover:bg-destructive/10 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <XCircle className="h-3.5 w-3.5" />
            {t("Cancel", "إلغاء")}
          </button>
        )}
      </div>
    </div>
  );
}

export function DoctorProfileEditor({
  details,
  profileId,
}: {
  details: DoctorDetails | null | undefined;
  profileId: string | null;
}) {
  const { t } = useLanguage();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    specialty: details?.specialty ?? "",
    bio: details?.bio ?? "",
    clinic_name: details?.clinic_name ?? "",
    clinic_address: details?.clinic_address ?? "",
    consultation_fee: details?.consultation_fee?.toString() ?? "",
    currency: details?.currency ?? "EGP",
    years_experience: details?.years_experience?.toString() ?? "",
  });

  useEffect(() => {
    if (details) {
      setForm({
        specialty: details.specialty ?? "",
        bio: details.bio ?? "",
        clinic_name: details.clinic_name ?? "",
        clinic_address: details.clinic_address ?? "",
        consultation_fee: details.consultation_fee?.toString() ?? "",
        currency: details.currency ?? "EGP",
        years_experience: details.years_experience?.toString() ?? "",
      });
    }
  }, [details]);

  const save = useMutation({
    mutationFn: async () => {
      if (!profileId) throw new Error("No profile");
      const payload = {
        profile_id: profileId,
        specialty: form.specialty || null,
        bio: form.bio || null,
        clinic_name: form.clinic_name || null,
        clinic_address: form.clinic_address || null,
        consultation_fee: form.consultation_fee ? Number(form.consultation_fee) : null,
        currency: form.currency || "EGP",
        years_experience: form.years_experience ? Number(form.years_experience) : null,
      };
      if (details?.id) {
        const { error } = await supabase
          .from("doctor_details")
          .update(payload)
          .eq("id", details.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("doctor_details").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(t("Profile updated", "تم تحديث الملف"));
      queryClient.invalidateQueries({ queryKey: ["doctor_details"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <section className="bg-card border border-border rounded-2xl p-6">
      <div className="flex items-center gap-2 mb-5">
        <Stethoscope className="h-5 w-5 text-primary" />
        <h2 className="text-xl font-semibold text-foreground">
          {t("Clinic Profile", "ملف العيادة")}
        </h2>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Field label={t("Specialty", "التخصص")}>
          <input
            type="text"
            value={form.specialty}
            onChange={(e) => setForm({ ...form, specialty: e.target.value })}
            placeholder={t("e.g. Cardiology", "مثال: قلب وأوعية دموية")}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </Field>

        <Field label={t("Consultation Fee", "سعر الكشف")}>
          <div className="flex gap-2">
            <input
              type="number"
              min="0"
              value={form.consultation_fee}
              onChange={(e) => setForm({ ...form, consultation_fee: e.target.value })}
              className="flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
            <select
              value={form.currency}
              onChange={(e) => setForm({ ...form, currency: e.target.value })}
              className="rounded-lg border border-border bg-background px-2 py-2 text-sm"
            >
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>
        </Field>

        <Field label={t("Years of Experience", "سنوات الخبرة")}>
          <input
            type="number"
            min="0"
            value={form.years_experience}
            onChange={(e) => setForm({ ...form, years_experience: e.target.value })}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </Field>

        <Field label={t("Clinic Name", "اسم العيادة")}>
          <input
            type="text"
            value={form.clinic_name}
            onChange={(e) => setForm({ ...form, clinic_name: e.target.value })}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </Field>

        <Field label={t("Clinic Address", "عنوان العيادة")} full>
          <input
            type="text"
            value={form.clinic_address}
            onChange={(e) => setForm({ ...form, clinic_address: e.target.value })}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </Field>

        <Field label={t("Bio", "نبذة")} full>
          <textarea
            value={form.bio}
            onChange={(e) => setForm({ ...form, bio: e.target.value })}
            rows={4}
            placeholder={t("Brief description of your practice...", "وصف موجز لخبرتك وممارستك...")}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
          />
        </Field>
      </div>

      <button
        onClick={() => save.mutate()}
        disabled={save.isPending}
        className="mt-5 inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:opacity-90 disabled:opacity-50"
      >
        {save.isPending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Save className="h-4 w-4" />
        )}
        {t("Save Changes", "حفظ التغييرات")}
      </button>
    </section>
  );
}

function Field({
  label,
  children,
  full,
}: {
  label: string;
  children: React.ReactNode;
  full?: boolean;
}) {
  return (
    <div className={full ? "md:col-span-2" : ""}>
      <label className="block text-sm font-medium text-foreground mb-1.5">{label}</label>
      {children}
    </div>
  );
}

/* ─────────────────────── KPI Card with trend ─────────────────────── */
/* ─────────────────────── Today's Agenda ─────────────────────── */
function TodayAgenda({
  appts,
  onConfirm,
  onReject,
  mutationPending,
  t,
}: {
  appts: Array<{
    id: string;
    scheduled_at: string;
    status: string;
    fee: number;
    notes: string | null;
  }>;
  onConfirm: (id: string) => void;
  onReject: (id: string) => void;
  mutationPending?: boolean;
  t: (en: string, ar: string) => string;
}) {
  const today = new Date();
  return (
    <div className="rounded-2xl border border-border bg-card p-5 lg:col-span-2">
      <div className="flex items-center justify-between border-b border-border pb-3">
        <div className="flex items-center gap-2">
          <Calendar className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-bold text-foreground">{t("Today's agenda", "جدول اليوم")}</h2>
          <span className="text-xs text-muted-foreground">
            {today.toLocaleDateString(undefined, {
              weekday: "long",
              day: "numeric",
              month: "short",
            })}
          </span>
        </div>
        <Link to="/appointments" className="text-xs font-medium text-primary hover:underline">
          {t("Full schedule →", "الجدول الكامل ←")}
        </Link>
      </div>

      {appts.length === 0 ? (
        <div className="py-10 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-muted">
            <Calendar className="h-6 w-6 text-muted-foreground" />
          </div>
          <p className="mt-3 text-sm text-muted-foreground">
            {t("No appointments today — enjoy your day!", "لا توجد مواعيد اليوم — يوم سعيد!")}
          </p>
        </div>
      ) : (
        <ul className="mt-3 divide-y divide-border">
          {appts.slice(0, 5).map((a) => {
            const time = new Date(a.scheduled_at).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            });
            const isPending = a.status === "pending";
            const statusBadge = isPending
              ? { c: "bg-amber-500/10 text-amber-600", l: t("Pending", "بانتظار") }
              : a.status === "confirmed"
                ? { c: "bg-emerald-500/10 text-emerald-600", l: t("Confirmed", "مؤكد") }
                : { c: "bg-blue-500/10 text-blue-600", l: t(a.status, a.status) };
            return (
              <li key={a.id} className="flex items-center gap-3 py-3">
                <div className="flex w-16 flex-col items-center rounded-lg bg-primary/5 px-2 py-1.5">
                  <span className="text-base font-bold text-primary">{time}</span>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${statusBadge.c}`}
                    >
                      {statusBadge.l}
                    </span>
                    <span className="text-sm font-medium text-foreground">
                      {a.fee ?? 0} {t("EGP", "ج.م")}
                    </span>
                  </div>
                  {a.notes && (
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">{a.notes}</p>
                  )}
                </div>
                <div className="flex items-center gap-1.5">
                  {isPending ? (
                    <>
                      <button
                        onClick={() => onConfirm(a.id)}
                        disabled={mutationPending}
                        className="inline-flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {mutationPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                        {t("Accept", "قبول")}
                      </button>
                      <button
                        onClick={() => onReject(a.id)}
                        disabled={mutationPending}
                        aria-label={t("Reject", "رفض")}
                        className="rounded-lg p-1.5 text-destructive hover:bg-destructive/10 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <XCircle className="h-4 w-4" />
                      </button>
                    </>
                  ) : (
                    <Link
                      to="/appointments"
                      className="rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted"
                    >
                      {t("Open", "فتح")}
                    </Link>
                  )}
                </div>
              </li>
            );
          })}
          {appts.length > 5 && (
            <li className="pt-3 text-center">
              <Link to="/appointments" className="text-xs font-medium text-primary hover:underline">
                {t(`+${appts.length - 5} more today`, `+${appts.length - 5} مواعيد إضافية اليوم`)}
              </Link>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}

/* ─────────────────────── Quick Actions ─────────────────────── */
function QuickActions({
  t,
  isVerified,
  tier,
}: {
  t: (en: string, ar: string) => string;
  isVerified: boolean;
  tier: string;
}) {
  const actions = [
    {
      Icon: Zap,
      label: t("Start instant visit", "بدء كشف فورى"),
      to: "/dashboard/visit/new" as const,
    },
    {
      Icon: FilePlus,
      label: t("New prescription", "وصفة جديدة"),
      to: "/dashboard/visit/new" as const,
    },
    { Icon: Video, label: t("Video session", "بدء فيديو"), to: "/appointments" as const },
    { Icon: UserPlus, label: t("Add patient", "إضافة مريض"), to: "/dashboard/patients" as const },
  ];

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-border bg-card p-5">
        <div className="mb-3 flex items-center gap-2">
          <Zap className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-bold text-foreground">
            {t("Quick actions", "إجراءات سريعة")}
          </h2>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {actions.map(({ Icon, label, to }, i) => (
            <Link
              key={i}
              to={to}
              className="flex flex-col items-center gap-2 rounded-xl border border-border bg-background p-3 text-center transition hover:border-primary/50 hover:shadow-md"
            >
              <Icon className="h-5 w-5 text-primary" />
              <span className="text-xs font-medium text-foreground leading-tight">{label}</span>
            </Link>
          ))}
        </div>
      </div>

      {/* Upsell / Status card */}
      {!isVerified ? (
        <Link
          to="/doctor/verification"
          className="block rounded-2xl border border-blue-300/50 bg-gradient-to-br from-blue-50 to-blue-100/40 p-5 transition hover:shadow-md dark:border-blue-900/40 dark:from-blue-950/30 dark:to-blue-900/10"
        >
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-blue-600" />
            <h3 className="text-sm font-bold text-foreground">
              {t("Complete verification", "أكمل التوثيق")}
            </h3>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            {t(
              "Upload your medical licence to appear in search and start receiving patients.",
              "ارفع رخصة المزاولة للظهور فى نتائج البحث واستقبال المرضى.",
            )}
          </p>
          <div className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-blue-700 dark:text-blue-300">
            {t("Start now", "ابدأ الآن")}
            <ArrowRight className="h-3 w-3 rtl:rotate-180" />
          </div>
        </Link>
      ) : tier !== "gold" ? (
        <Link
          to="/billing"
          className="block rounded-2xl border border-amber-300/50 bg-gradient-to-br from-amber-50 to-amber-100/40 p-5 transition hover:shadow-md dark:border-amber-900/40 dark:from-amber-950/30 dark:to-amber-900/10"
        >
          <div className="flex items-center gap-2">
            <Crown className="h-5 w-5 text-amber-600" />
            <h3 className="text-sm font-bold text-foreground">
              {t("Upgrade to Gold", "ترقية لـ Gold")}
            </h3>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            {t(
              "Unlock recordings, accounting, priority support — and ad-free placement.",
              "تسجيل الجلسات، نظام محاسبى، دعم أولوية، وظهور بدون إعلانات.",
            )}
          </p>
          <div className="mt-3 inline-flex items-center gap-1 text-xs font-bold text-amber-700 dark:text-amber-300">
            {t("Learn more", "اعرف المزيد")}
            <ArrowRight className="h-3 w-3 rtl:rotate-180" />
          </div>
        </Link>
      ) : null}
    </div>
  );
}
