/**
 * NotificationBell — header bell icon with unread count + dropdown.
 *
 * Polls unread count every 60s while authenticated. Clicking the bell opens
 * a list of recent notifications; clicking one marks it read and routes to
 * its link target.
 */
import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Bell, Microscope } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useLanguage } from "@/hooks/useLanguage";

interface NotifRow {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  link: string | null;
  is_read: boolean;
  created_at: string;
}

export function NotificationBell() {
  const { user, isAuthenticated } = useAuth();
  const { t, isRTL } = useLanguage();
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(0);
  const [items, setItems] = useState<NotifRow[]>([]);
  const ref = useRef<HTMLDivElement>(null);

  // Poll unread count.
  useEffect(() => {
    if (!isAuthenticated || !user) {
      setCount(0);
      return;
    }
    let alive = true;
    const fetchCount = async () => {
      const { data } = await supabase.rpc("unread_notifications_count");
      if (alive) setCount(typeof data === "number" ? data : 0);
    };
    fetchCount();
    const id = setInterval(fetchCount, 60_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [isAuthenticated, user]);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const toggle = async () => {
    const next = !open;
    setOpen(next);
    if (next && user) {
      const { data } = await supabase
        .from("notifications")
        .select("id, kind, title, body, link, is_read, created_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(15);
      setItems((data ?? []) as NotifRow[]);
    }
  };

  const onItemClick = async (n: NotifRow) => {
    if (!n.is_read) {
      await supabase.rpc("mark_notifications_read", { _ids: [n.id] });
      setCount((c) => Math.max(0, c - 1));
    }
    setOpen(false);
    // Hard-navigate so deep links to non-typed paths work safely.
    if (n.link) window.location.href = n.link;
  };

  if (!isAuthenticated) return null;

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={toggle}
        className="relative rounded-lg p-2 text-muted-foreground hover:bg-accent hover:text-accent-foreground transition"
        aria-label={t("Notifications", "الإشعارات")}
      >
        <Bell className="h-5 w-5" />
        {count > 0 && (
          <span className="absolute -top-0.5 -end-0.5 min-w-[18px] h-[18px] bg-rose-600 text-white text-[10px] font-bold rounded-full flex items-center justify-center px-1">
            {count > 99 ? "99+" : count}
          </span>
        )}
      </button>

      {open && (
        <div
          className={`absolute mt-2 w-80 max-w-[calc(100vw-2rem)] bg-popover border border-border rounded-xl shadow-lg z-50 overflow-hidden ${
            isRTL ? "start-0" : "end-0"
          }`}
          role="menu"
        >
          <div className="px-3 py-2 border-b border-border bg-muted/30">
            <h3 className="text-sm font-semibold">
              {t("Notifications", "الإشعارات")}
            </h3>
          </div>
          {items.length === 0 ? (
            <div className="px-4 py-6 text-center text-sm text-muted-foreground">
              {t("No notifications yet.", "لا توجد إشعارات بعد.")}
            </div>
          ) : (
            <ul className="max-h-96 overflow-y-auto">
              {items.map((n) => (
                <li key={n.id}>
                  <button
                    onClick={() => onItemClick(n)}
                    className={`w-full text-start px-3 py-2.5 text-sm border-b border-border/50 last:border-0 hover:bg-accent transition ${
                      n.is_read ? "" : "bg-primary/5"
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      <span className="mt-0.5 shrink-0 text-primary">
                        {n.kind === "lab_ready" ? (
                          <Microscope className="h-4 w-4" />
                        ) : (
                          <Bell className="h-4 w-4" />
                        )}
                      </span>
                      <div className="min-w-0">
                        <div className="font-medium truncate">{n.title}</div>
                        {n.body && (
                          <div className="text-xs text-muted-foreground line-clamp-2">
                            {n.body}
                          </div>
                        )}
                        <div className="text-[10px] text-muted-foreground mt-0.5">
                          {new Date(n.created_at).toLocaleString(isRTL ? "ar-EG" : "en-GB", {
                            dateStyle: "short",
                            timeStyle: "short",
                          })}
                        </div>
                      </div>
                      {!n.is_read && (
                        <span className="mt-1.5 h-2 w-2 rounded-full bg-primary shrink-0" aria-hidden />
                      )}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <Link
            to="/profile/lab-results"
            onClick={() => setOpen(false)}
            className="block px-3 py-2 text-xs text-center text-primary hover:underline border-t border-border"
          >
            {t("View lab results →", "عرض نتائج التحاليل ←")}
          </Link>
        </div>
      )}
    </div>
  );
}
