/**
 * /admin/support-tickets — Admin queue for tier-prioritized support tickets.
 *
 * Sorted by priority (urgent → high → normal) then created_at desc.
 * Admins respond inline; saving notifies the user via notifications trigger.
 */
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { AdminNav } from "@/components/admin/AdminNav";
import {
  listAllTickets,
  respondToTicket,
  type SupportTicket,
  type TicketStatus,
} from "@/lib/support.functions";
import { AlertCircle, CheckCircle2, Loader2, Send, ShieldAlert, Zap } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/support-tickets")({
  head: () => ({
    meta: [
      { title: "تذاكر الدعم — الأدمن" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: AdminSupportPage,
});

function AdminSupportPage() {
  const { user, isLoading: authLoading } = useAuth();
  const { isAdmin, isLoading: roleLoading } = useIsAdmin();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [filter, setFilter] = useState<"all" | TicketStatus>("open");

  useEffect(() => {
    if (authLoading || roleLoading) return;
    if (!user) navigate({ to: "/login" });
  }, [authLoading, roleLoading, user, navigate]);

  const { data: tickets = [], isLoading } = useQuery({
    queryKey: ["admin-tickets", user?.id, filter],
    queryFn: async () => {
      if (!user?.id) return [];
      return await listAllTickets({
        data: {
          userId: user.id,
          status: filter === "all" ? undefined : filter,
        },
      });
    },
    enabled: !!user?.id && isAdmin,
  });

  if (authLoading || roleLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="mx-auto max-w-md px-4 py-24 text-center" dir="rtl">
        <ShieldAlert className="mx-auto h-12 w-12 text-destructive" />
        <h1 className="mt-3 text-xl font-bold">صلاحيات غير كافية</h1>
      </div>
    );
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-8" dir="rtl">
      <AdminNav />
      <h1 className="text-2xl font-bold mb-4">تذاكر الدعم</h1>

      <div className="mb-4 flex flex-wrap gap-2">
        {(["open", "in_progress", "resolved", "closed", "all"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`rounded-full px-4 py-1.5 text-sm font-semibold transition ${
              filter === s
                ? "bg-primary text-primary-foreground"
                : "bg-muted hover:bg-muted/70 text-foreground"
            }`}
          >
            {labelFor(s)}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="text-sm text-muted-foreground">…</div>
      ) : tickets.length === 0 ? (
        <div className="text-sm text-muted-foreground bg-muted/30 rounded-lg p-6 text-center">
          لا توجد تذاكر في هذه الحالة
        </div>
      ) : (
        <div className="space-y-3">
          {tickets.map((t) => (
            <AdminTicketRow
              key={t.id}
              ticket={t}
              onResponded={() =>
                qc.invalidateQueries({ queryKey: ["admin-tickets", user?.id] })
              }
            />
          ))}
        </div>
      )}
    </main>
  );
}

function labelFor(s: "all" | TicketStatus) {
  return {
    all: "الكل",
    open: "مفتوحة",
    in_progress: "قيد المعالجة",
    resolved: "تم حلها",
    closed: "مغلقة",
  }[s];
}

function AdminTicketRow({
  ticket,
  onResponded,
}: {
  ticket: SupportTicket;
  onResponded: () => void;
}) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [reply, setReply] = useState(ticket.adminResponse ?? "");
  const [status, setStatus] = useState<"in_progress" | "resolved" | "closed">("resolved");
  const [busy, setBusy] = useState(false);

  const send = async () => {
    if (!user?.id || reply.trim().length < 1) return;
    setBusy(true);
    try {
      await respondToTicket({
        data: {
          userId: user.id,
          ticketId: ticket.id,
          response: reply.trim(),
          status,
        },
      });
      toast.success("تم إرسال الرد");
      onResponded();
      setOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "error");
    } finally {
      setBusy(false);
    }
  };

  const priorityColor =
    ticket.priority === "urgent"
      ? "border-rose-500/50 bg-rose-50/50 dark:bg-rose-900/10"
      : ticket.priority === "high"
        ? "border-amber-500/50 bg-amber-50/50 dark:bg-amber-900/10"
        : "border-border";

  return (
    <article className={`rounded-2xl border-2 p-4 ${priorityColor}`}>
      <header className="flex flex-wrap items-center gap-2 justify-between">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {ticket.priority === "urgent" && (
            <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 text-rose-700 px-2 py-0.5 text-xs font-bold">
              <Zap className="h-3 w-3" /> Gold عاجل
            </span>
          )}
          {ticket.priority === "high" && (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 text-amber-700 px-2 py-0.5 text-xs font-bold">
              <AlertCircle className="h-3 w-3" /> Premium مهم
            </span>
          )}
          <span className="text-xs text-muted-foreground">
            {ticket.userName ?? "—"} · {ticket.category}
          </span>
          <h3 className="font-semibold truncate">{ticket.subject}</h3>
        </div>
        <div className="text-xs text-muted-foreground">
          {new Date(ticket.createdAt).toLocaleString("ar-EG")}
        </div>
      </header>

      <p className="mt-2 text-sm text-foreground whitespace-pre-line">{ticket.body}</p>

      {ticket.adminResponse && (
        <div className="mt-3 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg p-3 text-sm">
          <div className="flex items-center gap-1 text-xs font-semibold text-emerald-700 mb-1">
            <CheckCircle2 className="h-3.5 w-3.5" />
            ردك السابق
          </div>
          {ticket.adminResponse}
        </div>
      )}

      <div className="mt-3 flex items-center justify-between gap-2">
        <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
          {labelFor(ticket.status as TicketStatus)}
        </span>
        <button
          onClick={() => setOpen((v) => !v)}
          className="text-sm font-semibold text-primary hover:underline"
        >
          {open ? "إخفاء" : ticket.adminResponse ? "تعديل الرد" : "الرد"}
        </button>
      </div>

      {open && (
        <div className="mt-3 border-t border-border pt-3">
          <textarea
            rows={4}
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            placeholder="اكتب ردك هنا…"
            className="w-full border border-border rounded-lg px-3 py-2 bg-background text-sm"
          />
          <div className="mt-2 flex items-center justify-between gap-2">
            <select
              value={status}
              onChange={(e) =>
                setStatus(e.target.value as "in_progress" | "resolved" | "closed")
              }
              className="border border-border rounded-lg px-3 py-1.5 bg-background text-sm"
            >
              <option value="in_progress">قيد المعالجة</option>
              <option value="resolved">تم الحل</option>
              <option value="closed">مغلق</option>
            </select>
            <button
              onClick={send}
              disabled={busy || reply.trim().length < 1}
              className="inline-flex items-center gap-2 bg-primary text-primary-foreground rounded-lg px-4 py-1.5 text-sm font-semibold hover:bg-primary/90 transition disabled:opacity-60"
            >
              {busy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
              إرسال
            </button>
          </div>
        </div>
      )}
    </article>
  );
}
