/**
 * /notifications — full notification center (the bell dropdown shows only the
 * latest few and its "see all" + deep links point here). Reading a notification
 * marks it read; a feedback reply from a doctor is shown in full so the patient
 * can read it here, not only as a toast.
 */
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/hooks/useLanguage";
import { PatientShell } from "@/components/patient/PatientNav";
import {
  Bell,
  Microscope,
  MessageSquare,
  Calendar,
  Bolt,
  CheckCheck,
  Loader2,
  Star,
} from "lucide-react";

interface NotifRow {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  link: string | null;
  is_read: boolean;
  created_at: string;
}

export const Route = createFileRoute("/notifications")({
  head: () => ({
    meta: [
      { title: "الإشعارات — طبانا" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: NotificationsPage,
});

function iconFor(kind: string) {
  switch (kind) {
    case "lab_ready":
      return <Microscope className="h-4 w-4" />;
    case "feedback_reply":
      return <MessageSquare className="h-4 w-4" />;
    case "appointment_reminder":
    case "booking_classification":
      return <Calendar className="h-4 w-4" />;
    case "emergency_alert":
    case "emergency_shift":
      return <Bolt className="h-4 w-4" />;
    case "review_reply":
      return <Star className="h-4 w-4" />;
    default:
      return <Bell className="h-4 w-4" />;
  }
}

function NotificationsPage() {
  const { user, isLoading: authLoading, isAuthenticated } = useAuth();
  const { t, isRTL } = useLanguage();
  const navigate = useNavigate();
  const qc = useQueryClient();

  useEffect(() => {
    if (!authLoading && !isAuthenticated) navigate({ to: "/login" });
  }, [authLoading, isAuthenticated, navigate]);

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["notifications", user?.id],
    enabled: !!user?.id,
    queryFn: async (): Promise<NotifRow[]> => {
      const { data, error } = await supabase
        .from("notifications")
        .select("id, kind, title, body, link, is_read, created_at")
        .eq("user_id", user!.id)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return (data ?? []) as NotifRow[];
    },
  });

  const markRead = useMutation({
    mutationFn: async (ids: string[]) => {
      if (ids.length === 0) return;
      await supabase.rpc("mark_notifications_read", { _ids: ids });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });

  const unreadIds = items.filter((n) => !n.is_read).map((n) => n.id);

  const openItem = async (n: NotifRow) => {
    if (!n.is_read) await markRead.mutateAsync([n.id]);
    if (n.link && n.link !== "/notifications") window.location.href = n.link;
  };

  if (authLoading || isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" aria-label="جاري التحميل" />
      </div>
    );
  }

  return (
    <PatientShell>
      <div dir={isRTL ? "rtl" : "ltr"}>
      <div className="mb-6 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Bell className="h-6 w-6 text-primary" aria-hidden="true" />
          <h1 className="text-2xl font-bold">{t("Notifications", "الإشعارات")}</h1>
        </div>
        {unreadIds.length > 0 && (
          <button
            type="button"
            onClick={() => markRead.mutate(unreadIds)}
            disabled={markRead.isPending}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-sm font-medium hover:bg-accent disabled:opacity-50"
          >
            <CheckCheck className="h-4 w-4" />
            {t("Mark all read", "تعليم الكل كمقروء")}
          </button>
        )}
      </div>

      {items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border p-12 text-center">
          <Bell className="mx-auto h-10 w-10 text-muted-foreground" aria-hidden="true" />
          <p className="mt-3 text-sm text-muted-foreground">
            {t("No notifications yet.", "لا توجد إشعارات بعد.")}
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {items.map((n) => {
            const clickable = !!n.link && n.link !== "/notifications";
            return (
              <li key={n.id}>
                <button
                  type="button"
                  onClick={() => openItem(n)}
                  className={`w-full rounded-xl border p-4 text-start transition ${
                    n.is_read ? "border-border bg-card" : "border-primary/30 bg-primary/5"
                  } ${clickable ? "hover:border-primary cursor-pointer" : "cursor-default"}`}
                >
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 shrink-0 text-primary">{iconFor(n.kind)}</span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-foreground">{n.title}</span>
                        {!n.is_read && (
                          <span className="h-2 w-2 rounded-full bg-primary shrink-0" aria-hidden />
                        )}
                      </div>
                      {n.body && (
                        <p className="mt-1 text-sm text-muted-foreground whitespace-pre-wrap">
                          {n.body}
                        </p>
                      )}
                      <div className="mt-1.5 text-[11px] text-muted-foreground">
                        {new Date(n.created_at).toLocaleString(isRTL ? "ar-EG" : "en-GB", {
                          dateStyle: "medium",
                          timeStyle: "short",
                        })}
                      </div>
                    </div>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      </div>
    </PatientShell>
  );
}
