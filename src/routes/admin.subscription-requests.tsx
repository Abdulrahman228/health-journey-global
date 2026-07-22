import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AdminShell } from "@/components/admin/AdminNav";
import { EmptyState } from "@/components/admin/EmptyState";
import { useAuth } from "@/hooks/useAuth";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { supabase } from "@/integrations/supabase/client";
import { adminReviewManualSubscription } from "@/lib/admin/financial";
import { manualAccessExpiresAt } from "@/lib/subscriptions.access";
import { BadgeCheck, Check, Clock, ExternalLink, Loader2, Receipt, ShieldAlert, X } from "lucide-react";

export const Route = createFileRoute("/admin/subscription-requests")({
  head: () => ({
    meta: [
      { title: "طلبات الاشتراك — Admin | طبيبي" },
      { name: "description", content: "مراجعة إيصالات الدفع اليدوي وتفعيل اشتراكات Gold." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: SubscriptionRequestsPage,
});

type RequestRow = {
  id: string;
  user_id: string;
  plan_code: string | null;
  access_status: string;
  access_granted_at: string | null;
  receipt_url: string | null;
  created_at: string;
  doctorName: string | null;
  city: string | null;
};

const PLAN_LABEL: Record<string, string> = {
  doctor_gold_monthly: "Gold شهري",
  doctor_gold_yearly: "Gold سنوي",
};

function SubscriptionRequestsPage() {
  const { user, isLoading: authLoading } = useAuth();
  const { isAdmin, isLoading: roleLoading } = useIsAdmin();
  const navigate = useNavigate();
  const review = useServerFn(adminReviewManualSubscription);

  const [rows, setRows] = useState<RequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data: subs } = await supabase
      .from("subscriptions")
      .select("id, user_id, plan_code, access_status, access_granted_at, receipt_url, created_at")
      .eq("is_manual", true)
      .eq("access_status", "pending")
      .order("created_at", { ascending: true });

    const userIds = Array.from(new Set((subs ?? []).map((s) => s.user_id)));
    const { data: profiles } = userIds.length
      ? await supabase.from("profiles").select("user_id, full_name, city").in("user_id", userIds)
      : { data: [] as { user_id: string; full_name: string | null; city: string | null }[] };
    const profByUser = new Map((profiles ?? []).map((p) => [p.user_id, p]));

    setRows(
      (subs ?? []).map((s) => ({
        ...s,
        doctorName: profByUser.get(s.user_id)?.full_name ?? null,
        city: profByUser.get(s.user_id)?.city ?? null,
      })),
    );
    setLoading(false);
  }, []);

  useEffect(() => {
    if (authLoading || roleLoading) return;
    if (!user) {
      navigate({ to: "/login" });
      return;
    }
    if (isAdmin) void load();
  }, [authLoading, roleLoading, user, isAdmin, navigate, load]);

  const decide = async (id: string, decision: "approve" | "reject") => {
    setBusyId(id);
    try {
      await review({ data: { subscriptionId: id, decision } });
      toast.success(
        decision === "approve" ? "تم تفعيل الاشتراك بنجاح" : "تم رفض الطلب وإخطار الطبيب",
      );
      setRows((prev) => prev.filter((r) => r.id !== id));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  if (authLoading || roleLoading || loading) {
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
    <AdminShell>
      <header className="mb-6">
        <h1 className="text-3xl font-bold">طلبات الاشتراك</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          مراجعة إيصالات الدفع اليدوي. الأطباء حصلوا على مزايا Gold مؤقتاً — راجع خلال 24 ساعة قبل انتهاء صلاحية الوصول.
        </p>
      </header>

      {rows.length === 0 ? (
        <EmptyState
          icon={BadgeCheck}
          title="لا توجد طلبات بانتظار المراجعة"
          description="ستظهر هنا إيصالات الدفع اليدوي فور رفعها من الأطباء."
        />
      ) : (
        <ul className="space-y-3">
          {rows.map((r) => (
            <li
              key={r.id}
              className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <p className="truncate font-bold text-foreground">{r.doctorName ?? "طبيب"}</p>
                <p className="mt-0.5 text-sm text-muted-foreground">
                  {PLAN_LABEL[r.plan_code ?? ""] ?? r.plan_code ?? "—"}
                  {r.city ? ` · ${r.city}` : ""}
                </p>
                <ExpiryHint grantedAt={r.access_granted_at} />
              </div>

              <div className="flex shrink-0 items-center gap-2">
                {r.receipt_url && (
                  <a
                    href={r.receipt_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-sm font-medium hover:bg-muted"
                  >
                    <Receipt className="h-4 w-4" />
                    الإيصال
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                )}
                <button
                  type="button"
                  disabled={busyId === r.id}
                  onClick={() => decide(r.id, "reject")}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-destructive/40 px-3 py-2 text-sm font-semibold text-destructive hover:bg-destructive/10 disabled:opacity-60"
                >
                  {busyId === r.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <X className="h-4 w-4" />}
                  رفض
                </button>
                <button
                  type="button"
                  disabled={busyId === r.id}
                  onClick={() => decide(r.id, "approve")}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
                >
                  {busyId === r.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                  تفعيل
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </AdminShell>
  );
}

/** Small "expires in Nh" hint driven by the 24h manual grace window. */
function ExpiryHint({ grantedAt }: { grantedAt: string | null }) {
  const expiresAt = manualAccessExpiresAt({ access_status: "pending", access_granted_at: grantedAt });
  if (!expiresAt) return null;
  const msLeft = expiresAt.getTime() - Date.now();
  const expired = msLeft <= 0;
  const hours = Math.max(0, Math.floor(msLeft / 3_600_000));
  const mins = Math.max(0, Math.floor((msLeft % 3_600_000) / 60_000));
  return (
    <p
      className={
        "mt-1 inline-flex items-center gap-1 text-xs " +
        (expired ? "text-destructive" : "text-amber-600 dark:text-amber-400")
      }
    >
      <Clock className="h-3.5 w-3.5" />
      {expired ? "انتهت صلاحية الوصول المؤقت" : `يتبقّى على انتهاء الوصول المؤقت: ${hours}س ${mins}د`}
    </p>
  );
}
