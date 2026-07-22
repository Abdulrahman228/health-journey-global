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
import { Loader2, CheckCircle2, XCircle, Calendar, Clock, Users, DollarSign, Stethoscope, Save, Megaphone, Globe, Lock, Video, FilePlus, UserPlus, Zap, TrendingUp, TrendingDown, Crown, ArrowRight, MessageSquare } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/dashboard")({
  head: () => ({
    meta: [
      { title: "Doctor Dashboard — Tabibi" },
      { name: "description", content: "Manage your schedule, appointments, and clinic profile on Tabibi." },
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

const CURRENCIES = ["EGP", "USD", "EUR", "SAR", "AED", "KWD", "QAR", "BHD", "OMR", "JOD", "MAD", "TND", "DZD", "GBP"];


function DashboardPage() {
  // When on a child route like /dashboard/analytics, render the child instead
  // of the dashboard home content (dashboard.tsx is a layout for nested routes).
  const matches = useMatches();
  const isChildRoute = matches.some((m) => m.routeId !== "__root__" && m.routeId !== "/dashboard" && m.routeId.startsWith("/dashboard"));
  if (isChildRoute) {
    return <Outlet />;
  }
  return <DashboardHomePage />;
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

  return (
    <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 lg:px-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-foreground">
          {t("Doctor Dashboard", "لوحة تحكم الطبيب")}
        </h1>
        <p className="text-muted-foreground mt-1">
          {t("Welcome back", "مرحبًا بعودتك")}, {profile?.full_name ?? user?.email}
        </p>
        {details && !details.is_verified && (
          <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-sm text-amber-700 dark:text-amber-400">
            {t(
              "Your account is pending verification. You'll appear in search results once approved.",
              "حسابك قيد المراجعة. سيظهر ملفك في نتائج البحث بعد الموافقة.",
            )}
          </div>
        )}
      </div>

      {/* Stats — enhanced with trends */}
      <div className="mb-8 grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
        <KpiCard
          icon={DollarSign}
          label={t("This month", "هذا الشهر")}
          value={`${stats.monthRevenue.toLocaleString()} ${t("EGP", "ج.م")}`}
          trend={stats.revenueTrend}
          accent="emerald"
        />
        <KpiCard
          icon={Users}
          label={t("Patients", "المرضى")}
          value={stats.uniquePatients}
          accent="blue"
        />
        <KpiCard
          icon={Calendar}
          label={t("Today", "اليوم")}
          value={stats.todayCount}
          accent="primary"
        />
        <KpiCard
          icon={Clock}
          label={t("Pending", "بانتظار التأكيد")}
          value={stats.pending}
          accent="amber"
        />
        <KpiCard
          icon={CheckCircle2}
          label={t("Completed", "مكتملة")}
          value={stats.completed}
          accent="teal"
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

      {/* Sponsorship promo (visible to all doctors; route enforces Gold) */}
      <Link
        to="/doctor/sponsorship"
        className="mb-10 block rounded-2xl border border-amber-300/60 bg-linear-to-br from-amber-50 to-amber-100/30 dark:border-amber-900/40 dark:from-amber-950/30 dark:to-amber-900/10 p-5 transition hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <div className="flex items-start gap-3">
          <div className="rounded-full bg-amber-500/20 p-2 text-amber-700 dark:text-amber-300" aria-hidden="true">
            <Megaphone className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="font-semibold text-foreground">
              {t("Sponsored placement (Gold only)", "إعلانات Sponsored — لاشتراكات Gold")}
            </h3>
            <p className="mt-1 text-sm text-muted-foreground">
              {t(
                "Appear at the top of search results, increase visibility 3-5×, pay per click.",
                "تظهر في أعلى نتائج البحث وتزيد ظهورك 3-5×. تدفع فقط عن النقرات.",
              )}
            </p>
          </div>
          <span className="text-xs font-bold text-amber-700 dark:text-amber-300 whitespace-nowrap">
            {t("Manage →", "إدارة ←")}
          </span>
        </div>
      </Link>

      {/* Phase 3-5 cards: Solo Mode + Private Feedback + Reviews curation */}
      <div className="mb-10 grid gap-3 md:grid-cols-3">
        <Link
          to="/doctor/solo"
          className="block rounded-2xl border border-border bg-card p-5 transition hover:border-primary/50 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <div className="flex items-center gap-2 mb-1">
            <Globe className="h-5 w-5 text-primary" aria-hidden="true" />
            <h3 className="font-semibold">{t("Solo Mode (white-label)", "Solo Mode — صفحتك الخاصة")}</h3>
          </div>
          <p className="text-sm text-muted-foreground">
            {t(
              "Get your own subdomain like dr-name.mytabibi.com with your branding.",
              "احصل على نطاق فرعي خاص بك (drname.mytabibi.com) بشعارك ولونك.",
            )}
          </p>
        </Link>

        <Link
          to="/doctor/feedback"
          className="block rounded-2xl border border-border bg-card p-5 transition hover:border-primary/50 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <div className="flex items-center gap-2 mb-1">
            <Lock className="h-5 w-5 text-primary" aria-hidden="true" />
            <h3 className="font-semibold">{t("Private feedback inbox", "ملاحظات خاصة مشفّرة")}</h3>
          </div>
          <p className="text-sm text-muted-foreground">
            {t(
              "Read encrypted notes from patients — visible only to you.",
              "اقرأ ملاحظات مشفّرة من المرضى — مرئية لك فقط.",
            )}
          </p>
        </Link>

        <Link
          to="/dashboard/reviews"
          className="block rounded-2xl border border-border bg-card p-5 transition hover:border-primary/50 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <div className="flex items-center gap-2 mb-1">
            <MessageSquare className="h-5 w-5 text-primary" aria-hidden="true" />
            <h3 className="font-semibold">
              {t("Reviews curation", "إدارة تقييماتك")}
            </h3>
          </div>
          <p className="text-sm text-muted-foreground">
            {t(
              "Choose which approved reviews appear on your public profile.",
              "اختر أي التقييمات الموافق عليها تظهر على صفحتك العامة.",
            )}
          </p>
        </Link>
      </div>

      {/* Profile editor */}
      <DoctorProfileEditor details={details} profileId={profile?.id ?? null} />

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

      {/* Clinics & schedules */}
      {details?.id && <ClinicsManager doctorDetailsId={details.id} />}

      {/* Public page + QR */}
      {profile?.id && <PublicPageManager profileId={profile.id} role="doctor" />}

      {/* EMR quick-links */}
      <section className="mt-10">
        <h2 className="text-xl font-semibold text-foreground mb-4">
          {t("Medical Records", "السجلات الطبية")}
        </h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <Link
            to="/dashboard/patients"
            className="rounded-xl border border-border bg-card p-4 transition hover:border-primary hover:shadow-md focus:outline-none focus:ring-2 focus:ring-primary/40"
          >
            <div className="text-base font-semibold text-foreground">
              {t("My Patients", "مرضائي")}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {t("Browse and search patient records", "ابحث في سجلات مرضاك")}
            </p>
          </Link>
          <Link
            to="/dashboard/visit/new"
            className="rounded-xl border border-border bg-card p-4 transition hover:border-primary hover:shadow-md focus:outline-none focus:ring-2 focus:ring-primary/40"
          >
            <div className="text-base font-semibold text-foreground">
              {t("New Visit", "زيارة جديدة")}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {t("Record encounter + prescription", "سجّل زيارة + وصفة")}
            </p>
          </Link>
          <Link
            to="/dashboard/settings/followup"
            className="rounded-xl border border-border bg-card p-4 transition hover:border-primary hover:shadow-md focus:outline-none focus:ring-2 focus:ring-primary/40"
          >
            <div className="text-base font-semibold text-foreground">
              {t("Follow-up Settings", "إعدادات المتابعة")}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {t("Free revisit window & fees", "فترة المتابعة المجانية والرسوم")}
            </p>
          </Link>
          <Link
            to="/dashboard/settings/signature"
            className="rounded-xl border border-border bg-card p-4 transition hover:border-primary hover:shadow-md focus:outline-none focus:ring-2 focus:ring-primary/40"
          >
            <div className="text-base font-semibold text-foreground">
              {t("Signature & Stamp", "التوقيع والختم")}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {t("For prescriptions PDF", "لظهورهما على الوصفات الطبية")}
            </p>
          </Link>
          <Link
            to="/dashboard/support"
            className="rounded-xl border border-border bg-card p-4 transition hover:border-primary hover:shadow-md focus:outline-none focus:ring-2 focus:ring-primary/40"
          >
            <div className="text-base font-semibold text-foreground flex items-center gap-2">
              {t("Support", "الدعم الفني")}
              <span className="rounded-full bg-gradient-to-r from-amber-400 to-yellow-600 text-white px-2 py-0.5 text-[10px] font-bold">
                {t("Priority", "أولوية")}
              </span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {t("Premium/Gold get faster SLA", "أعضاء بريميوم وجولد بأولوية فائقة")}
            </p>
          </Link>
        </div>
      </section>

      {/* Online consultations (telemedicine) feature gate */}
      <section className="mt-10">
        <h2 className="text-xl font-semibold text-foreground mb-4">
          {t("Online Consultations", "الاستشارات عن بُعد")}
        </h2>
        <TelemedicineToggle />
      </section>

      {/* Finance quick-links */}
      <section className="mt-10">
        <h2 className="text-xl font-semibold text-foreground mb-4">
          {t("Finance", "الإيرادات والمحاسبة")}
        </h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <Link
            to="/dashboard/earnings"
            className="rounded-xl border border-border bg-card p-4 transition hover:border-primary hover:shadow-md focus:outline-none focus:ring-2 focus:ring-primary/40"
          >
            <div className="text-base font-semibold text-foreground">
              {t("My Earnings", "إيراداتي")}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {t("Balance, transactions, withdrawals", "الرصيد والمعاملات والسحوبات")}
            </p>
          </Link>
          <Link
            to="/dashboard/settings/billing"
            className="rounded-xl border border-border bg-card p-4 transition hover:border-primary hover:shadow-md focus:outline-none focus:ring-2 focus:ring-primary/40"
          >
            <div className="text-base font-semibold text-foreground">
              {t("Payout Settings", "إعدادات الدفع")}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {t("Bank / InstaPay / Vodafone Cash", "تحويل بنكي / InstaPay / فودافون كاش")}
            </p>
          </Link>
          <Link
            to="/dashboard/analytics"
            className="rounded-xl border border-border bg-card p-4 transition hover:border-primary hover:shadow-md focus:outline-none focus:ring-2 focus:ring-primary/40 sm:col-span-2"
          >
            <div className="text-base font-semibold text-foreground flex items-center gap-2">
              {t("Analytics", "التحليلات")}
              <span className="inline-flex items-center bg-linear-to-r from-amber-400 to-yellow-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
                {t("PREMIUM", "بريميوم")}
              </span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {t(
                "Profile views, conversion, revenue trends",
                "المشاهدات، التحويل، اتجاه الإيرادات",
              )}
            </p>
          </Link>
          <Link
            to="/dashboard/expenses"
            className="rounded-xl border border-border bg-card p-4 transition hover:border-primary hover:shadow-md focus:outline-none focus:ring-2 focus:ring-primary/40 sm:col-span-2"
          >
            <div className="text-base font-semibold text-foreground flex items-center gap-2">
              {t("Expenses & Reports", "المصاريف والتقارير")}
              <span className="inline-flex items-center bg-linear-to-r from-amber-400 to-yellow-600 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
                {t("PREMIUM", "بريميوم")}
              </span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {t(
                "Track expenses, monthly P&L, CSV export",
                "تتبّع المصاريف، تقرير الأرباح الشهري، تصدير CSV",
              )}
            </p>
          </Link>
        </div>
      </section>

      {/* Pending appointments */}
      <section className="mt-10">
        <h2 className="text-xl font-semibold text-foreground mb-4">
          {t("Pending Requests", "طلبات قيد الانتظار")}
        </h2>
        {appointments.filter((a) => a.status === "pending").length === 0 ? (
          <p className="text-muted-foreground text-sm border border-dashed border-border rounded-xl p-6 text-center">
            {t("No pending requests.", "لا توجد طلبات قيد الانتظار.")}
          </p>
        ) : (
          <div className="space-y-3">
            {appointments
              .filter((a) => a.status === "pending")
              .map((a) => (
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

      {/* Upcoming confirmed */}
      <section className="mt-10">
        <h2 className="text-xl font-semibold text-foreground mb-4">
          {t("Upcoming Appointments", "المواعيد القادمة")}
        </h2>
        {appointments.filter((a) => a.status === "confirmed").length === 0 ? (
          <p className="text-muted-foreground text-sm border border-dashed border-border rounded-xl p-6 text-center">
            {t("No upcoming appointments.", "لا توجد مواعيد قادمة.")}
          </p>
        ) : (
          <div className="space-y-3">
            {appointments
              .filter((a) => a.status === "confirmed")
              .map((a) => (
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
            to="/appointments"
            className="text-sm font-medium text-primary hover:underline"
          >
            {t("View all appointments →", "عرض كل المواعيد ←")}
          </Link>
        </div>
      </section>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
  color: "primary" | "teal" | "amber";
}) {
  const colorMap = {
    primary: "bg-primary/10 text-primary",
    teal: "bg-teal/10 text-teal",
    amber: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  };
  return (
    <div className="bg-card border border-border rounded-xl p-5">
      <div className={`h-10 w-10 rounded-lg flex items-center justify-center mb-3 ${colorMap[color]}`}>
        <Icon className="h-5 w-5" />
      </div>
      <p className="text-2xl font-bold text-foreground">{value}</p>
      <p className="text-sm text-muted-foreground mt-1">{label}</p>
    </div>
  );
}

function AppointmentRow({
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
            {mutationPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
            {t("Confirm", "تأكيد")}
          </button>
        )}
        {onComplete && (
          <button
            onClick={onComplete}
            disabled={mutationPending}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-teal/10 text-teal text-xs font-medium hover:bg-teal/20 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {mutationPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
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

function DoctorProfileEditor({
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
        const { error } = await supabase.from("doctor_details").update(payload).eq("id", details.id);
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
                <option key={c} value={c}>{c}</option>
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
        {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
        {t("Save Changes", "حفظ التغييرات")}
      </button>
    </section>
  );
}

function Field({ label, children, full }: { label: string; children: React.ReactNode; full?: boolean }) {
  return (
    <div className={full ? "md:col-span-2" : ""}>
      <label className="block text-sm font-medium text-foreground mb-1.5">{label}</label>
      {children}
    </div>
  );
}

/* ─────────────────────── KPI Card with trend ─────────────────────── */
function KpiCard({
  icon: Icon,
  label,
  value,
  trend,
  accent,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
  trend?: number;
  accent: "primary" | "teal" | "amber" | "emerald" | "blue";
}) {
  const accentMap = {
    primary: "bg-primary/10 text-primary",
    teal: "bg-teal-500/10 text-teal-600",
    amber: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    emerald: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    blue: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  };
  const showTrend = typeof trend === "number" && trend !== 0;
  const trendUp = (trend ?? 0) >= 0;
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between">
        <div className={`flex h-9 w-9 items-center justify-center rounded-lg ${accentMap[accent]}`}>
          <Icon className="h-4.5 w-4.5" />
        </div>
        {showTrend && (
          <span
            className={`inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-xs font-bold ${
              trendUp
                ? "bg-emerald-500/10 text-emerald-600"
                : "bg-rose-500/10 text-rose-600"
            }`}
          >
            {trendUp ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
            {trendUp ? "+" : ""}
            {trend}%
          </span>
        )}
      </div>
      <p className="mt-3 text-xl font-bold text-foreground sm:text-2xl">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{label}</p>
    </div>
  );
}

/* ─────────────────────── Today's Agenda ─────────────────────── */
function TodayAgenda({
  appts,
  onConfirm,
  onReject,
  mutationPending,
  t,
}: {
  appts: Array<{ id: string; scheduled_at: string; status: string; fee: number; notes: string | null }>;
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
          <h2 className="text-lg font-bold text-foreground">
            {t("Today's agenda", "جدول اليوم")}
          </h2>
          <span className="text-xs text-muted-foreground">
            {today.toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "short" })}
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
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${statusBadge.c}`}>
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
    { Icon: Zap, label: t("Start instant visit", "بدء كشف فورى"), to: "/dashboard/visit/new" as const },
    { Icon: FilePlus, label: t("New prescription", "وصفة جديدة"), to: "/dashboard/visit/new" as const },
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
