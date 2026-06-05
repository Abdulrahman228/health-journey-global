/**
 * /dashboard/support — file & track support tickets.
 *
 * Tier-aware SLA badge:
 *  Free    → "نرد خلال 72 ساعة"
 *  Premium → "أولوية عالية — رد خلال 24 ساعة"
 *  Gold    → "أولوية قصوى — رد خلال 4 ساعات"
 */
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/hooks/useLanguage";
import { supabase } from "@/integrations/supabase/client";
import {
  fileSupportTicket,
  listMyTickets,
  type SupportTicket,
  type TicketPriority,
  type TicketStatus,
} from "@/lib/support.functions";
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  Crown,
  HeadphonesIcon,
  Loader2,
  Send,
  Sparkles,
  Zap,
} from "lucide-react";
import { toast } from "sonner";
import { TierBadge, type DoctorTier } from "@/components/TierBadge";

export const Route = createFileRoute("/dashboard/support")({
  head: () => ({
    meta: [
      { title: "الدعم الفني | لوحة الطبيب — طبيبي" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: SupportPage,
});

function SupportPage() {
  const { user, profile, isLoading: authLoading } = useAuth();
  const { t, isRTL } = useLanguage();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [tier, setTier] = useState<DoctorTier>("free");
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    subject: "",
    body: "",
    category: "general" as
      | "general"
      | "billing"
      | "technical"
      | "account"
      | "complaint"
      | "feature",
  });

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      navigate({ to: "/login" });
      return;
    }
    if (!profile?.id) return;
    let alive = true;
    (async () => {
      const { data: dd } = await supabase
        .from("doctor_details")
        .select("id")
        .eq("profile_id", profile.id)
        .maybeSingle();
      if (!dd) return;
      const { data: tierVal } = await supabase.rpc("doctor_active_tier", {
        doctor_details_id: (dd as { id: string }).id,
      });
      if (alive) setTier(((tierVal as DoctorTier) ?? "free") as DoctorTier);
    })();
    return () => {
      alive = false;
    };
  }, [authLoading, user, profile?.id, navigate]);

  const { data: tickets = [], isLoading } = useQuery({
    queryKey: ["my-support-tickets", user?.id],
    queryFn: async () =>
      user?.id
        ? await listMyTickets({ data: { userId: user.id } })
        : ([] as SupportTicket[]),
    enabled: !!user?.id,
  });

  const sla = useMemo(() => {
    if (tier === "gold")
      return {
        text: t("Top priority — response within 4h", "أولوية قصوى — رد خلال 4 ساعات"),
        color: "from-amber-400 to-yellow-600",
        Icon: Crown,
      };
    if (tier === "premium")
      return {
        text: t("High priority — response within 24h", "أولوية عالية — رد خلال 24 ساعة"),
        color: "from-sky-500 to-indigo-600",
        Icon: Sparkles,
      };
    return {
      text: t("Standard response within 72h", "رد عادي خلال 72 ساعة"),
      color: "from-slate-400 to-slate-600",
      Icon: Clock,
    };
  }, [tier, t]);

  const submit = async () => {
    if (!user?.id) return;
    if (form.subject.trim().length < 3 || form.body.trim().length < 10) {
      toast.error(t("Please fill subject and message", "يرجى إدخال الموضوع والرسالة"));
      return;
    }
    setSubmitting(true);
    try {
      await fileSupportTicket({
        data: {
          userId: user.id,
          subject: form.subject.trim(),
          body: form.body.trim(),
          category: form.category,
        },
      });
      toast.success(t("Ticket submitted", "تم إرسال طلبك"));
      setForm({ subject: "", body: "", category: "general" });
      qc.invalidateQueries({ queryKey: ["my-support-tickets", user.id] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "error");
    } finally {
      setSubmitting(false);
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-3xl" dir={isRTL ? "rtl" : "ltr"}>
      <div className="flex items-center gap-3 mb-2">
        <HeadphonesIcon className="h-7 w-7 text-primary" />
        <h1 className="text-2xl font-bold">{t("Support", "الدعم الفني")}</h1>
        {tier !== "free" && <TierBadge tier={tier} size="sm" />}
      </div>

      {/* SLA badge */}
      <div
        className={`inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-semibold text-white bg-gradient-to-r ${sla.color} shadow mb-6`}
      >
        <sla.Icon className="h-4 w-4" />
        {sla.text}
      </div>

      {/* New ticket */}
      <section className="bg-card border border-border rounded-2xl p-5 mb-8">
        <h2 className="font-semibold mb-3">{t("Open new ticket", "افتح تذكرة جديدة")}</h2>
        <div className="grid sm:grid-cols-2 gap-3 mb-3">
          <select
            value={form.category}
            onChange={(e) =>
              setForm((f) => ({
                ...f,
                category: e.target.value as typeof f.category,
              }))
            }
            className="border border-border rounded-lg px-3 py-2 bg-background text-sm"
          >
            <option value="general">{t("General", "عام")}</option>
            <option value="billing">{t("Billing", "فواتير ومحاسبة")}</option>
            <option value="technical">{t("Technical", "مشكلة تقنية")}</option>
            <option value="account">{t("Account", "الحساب")}</option>
            <option value="complaint">{t("Complaint", "شكوى")}</option>
            <option value="feature">{t("Feature request", "طلب ميزة")}</option>
          </select>
          <input
            type="text"
            placeholder={t("Subject", "الموضوع") as string}
            value={form.subject}
            onChange={(e) => setForm((f) => ({ ...f, subject: e.target.value }))}
            className="border border-border rounded-lg px-3 py-2 bg-background text-sm"
          />
        </div>
        <textarea
          placeholder={t("Describe your issue…", "اكتب تفاصيل المشكلة هنا…") as string}
          rows={5}
          value={form.body}
          onChange={(e) => setForm((f) => ({ ...f, body: e.target.value }))}
          className="w-full border border-border rounded-lg px-3 py-2 bg-background text-sm"
        />
        <div className="mt-3 flex items-center justify-end gap-2">
          <button
            onClick={submit}
            disabled={submitting}
            className="inline-flex items-center gap-2 bg-primary text-primary-foreground rounded-lg px-4 py-2 text-sm font-semibold hover:bg-primary/90 transition disabled:opacity-60"
          >
            {submitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
            {t("Submit", "إرسال")}
          </button>
        </div>
      </section>

      {/* History */}
      <section>
        <h2 className="font-semibold mb-3">{t("My tickets", "تذاكري السابقة")}</h2>
        {isLoading ? (
          <div className="text-sm text-muted-foreground">…</div>
        ) : tickets.length === 0 ? (
          <div className="text-sm text-muted-foreground bg-muted/30 rounded-lg p-4 text-center">
            {t("No tickets yet", "لا توجد تذاكر بعد")}
          </div>
        ) : (
          <div className="space-y-3">
            {tickets.map((tk) => (
              <TicketCard key={tk.id} ticket={tk} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function TicketCard({ ticket }: { ticket: SupportTicket }) {
  const { t, isRTL } = useLanguage();
  const [expanded, setExpanded] = useState(false);
  return (
    <article
      className="bg-card border border-border rounded-2xl p-4 cursor-pointer hover:border-primary/50 transition"
      onClick={() => setExpanded((v) => !v)}
    >
      <header className="flex flex-wrap items-center gap-2 justify-between">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <PriorityChip priority={ticket.priority} />
          <StatusChip status={ticket.status} />
          <h3 className="text-sm font-semibold truncate">{ticket.subject}</h3>
        </div>
        <div className="text-xs text-muted-foreground" dir={isRTL ? "rtl" : "ltr"}>
          {new Date(ticket.createdAt).toLocaleDateString(isRTL ? "ar-EG" : "en-US")}
        </div>
      </header>
      {expanded && (
        <>
          <p className="mt-3 text-sm text-foreground whitespace-pre-line">{ticket.body}</p>
          {ticket.adminResponse && (
            <div className="mt-3 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-lg p-3">
              <div className="flex items-center gap-1 text-xs font-semibold text-emerald-700 dark:text-emerald-400 mb-1">
                <CheckCircle2 className="h-3.5 w-3.5" />
                {t("Support response", "رد فريق الدعم")}
              </div>
              <p className="text-sm text-foreground whitespace-pre-line">
                {ticket.adminResponse}
              </p>
              {ticket.respondedAt && (
                <div className="mt-2 text-xs text-muted-foreground">
                  {new Date(ticket.respondedAt).toLocaleString(isRTL ? "ar-EG" : "en-US")}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </article>
  );
}

function PriorityChip({ priority }: { priority: TicketPriority }) {
  if (priority === "urgent")
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300 px-2 py-0.5 text-xs font-semibold">
        <Zap className="h-3 w-3" /> عاجل
      </span>
    );
  if (priority === "high")
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 px-2 py-0.5 text-xs font-semibold">
        <AlertCircle className="h-3 w-3" /> مهم
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 px-2 py-0.5 text-xs font-semibold">
      عادي
    </span>
  );
}

function StatusChip({ status }: { status: TicketStatus }) {
  const map: Record<TicketStatus, { label: string; cls: string }> = {
    open: { label: "مفتوح", cls: "bg-sky-100 text-sky-700 dark:bg-sky-900/30 dark:text-sky-300" },
    in_progress: {
      label: "قيد المعالجة",
      cls: "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-300",
    },
    resolved: {
      label: "تم الحل",
      cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300",
    },
    closed: {
      label: "مغلق",
      cls: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300",
    },
  };
  const m = map[status];
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${m.cls}`}>
      {m.label}
    </span>
  );
}
