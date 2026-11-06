import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { AlertCircle, BadgeCheck, ClipboardCheck, Receipt, Wallet, HeadphonesIcon, CheckCircle2, ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

interface Item {
  key: string;
  label: string;
  count: number;
  to: string;
  icon: typeof BadgeCheck;
}

/**
 * "Needs your attention" — every pending operational queue on one panel so an
 * admin never misses a review. Counts are best-effort; a blocked/zero query
 * simply hides its row.
 */
export function AdminAttentionPanel() {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    (async () => {
      const head = { count: "exact" as const, head: true };
      const [verif, subs, withdrawals, tickets, apptPay] = await Promise.all([
        // Same queue /admin/verifications shows on its "pending" tab.
        supabase
          .from("doctor_details")
          .select("id", head)
          .eq("verification_status", "pending"),
        supabase.from("subscriptions").select("id", head).eq("is_manual", true).eq("access_status", "pending"),
        supabase.from("doctor_withdrawals").select("id", head).eq("status", "requested"),
        supabase.from("support_tickets").select("id", head).eq("status", "open"),
        supabase.rpc("list_appointment_payment_reviews"),
      ]);

      setFailed([verif, subs, withdrawals, tickets, apptPay].some((r) => r.error));
      const apptCount = Array.isArray(apptPay.data) ? apptPay.data.length : 0;
      const next: Item[] = [
        { key: "verif", label: "توثيقات أطباء بانتظار الاعتماد", count: verif.count ?? 0, to: "/admin/verifications", icon: BadgeCheck },
        { key: "subs", label: "طلبات اشتراك بانتظار المراجعة", count: subs.count ?? 0, to: "/admin/subscription-requests", icon: ClipboardCheck },
        { key: "appt", label: "مدفوعات مواعيد بانتظار التأكيد", count: apptCount, to: "/admin/appointment-payments", icon: Receipt },
        { key: "wd", label: "طلبات سحب بانتظار المعالجة", count: withdrawals.count ?? 0, to: "/admin/withdrawals", icon: Wallet },
        { key: "tickets", label: "تذاكر دعم مفتوحة", count: tickets.count ?? 0, to: "/admin/support-tickets", icon: HeadphonesIcon },
      ].filter((i) => i.count > 0);

      setItems(next);
      setLoading(false);
    })();
  }, []);

  if (loading) return null;

  const total = items.reduce((s, i) => s + i.count, 0);

  return (
    <section className="mb-8 rounded-2xl border border-border bg-card p-5">
      <div className="mb-3 flex items-center gap-2">
        <AlertCircle className="h-5 w-5 text-amber-500" />
        <h2 className="text-lg font-bold text-foreground">يحتاج انتباهك</h2>
        {total > 0 && (
          <span className="rounded-full bg-amber-500/15 px-2.5 py-0.5 text-sm font-bold text-amber-600 dark:text-amber-400">
            {total}
          </span>
        )}
      </div>

      {failed && (
        <p className="mb-2 text-xs text-destructive">
          تعذّر تحميل بعض العدادات — قد تكون الأرقام غير مكتملة.
        </p>
      )}
      {items.length === 0 && !failed ? (
        <div className="flex items-center gap-2 rounded-xl bg-emerald-500/5 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-400">
          <CheckCircle2 className="h-4 w-4" />
          كل الطوابير فارغة — لا يوجد ما يحتاج إجراءً الآن.
        </div>
      ) : items.length === 0 ? null : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {items.map((i) => {
            const Icon = i.icon;
            return (
              <li key={i.key}>
                <Link
                  to={i.to}
                  className="flex items-center gap-3 rounded-xl border border-border bg-background px-4 py-3 transition hover:border-primary/50 hover:bg-accent"
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600 dark:text-amber-400">
                    <Icon className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1 text-sm font-medium text-foreground">{i.label}</span>
                  <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-sm font-bold tabular-nums text-primary">
                    {i.count}
                  </span>
                  <ArrowLeft className="h-4 w-4 shrink-0 text-muted-foreground" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
