import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { AdminShell } from "@/components/admin/AdminNav";
import { EmptyState } from "@/components/admin/EmptyState";
import { useAuth } from "@/hooks/useAuth";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { supabase } from "@/integrations/supabase/client";
import { Check, Loader2, Receipt, Stethoscope, User, X } from "lucide-react";

export const Route = createFileRoute("/admin/appointment-payments")({
  head: () => ({
    meta: [
      { title: "مدفوعات المواعيد — Admin | طبانا" },
      { name: "description", content: "مراجعة إيصالات تحويل المواعيد وتأكيد الدفع." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: AppointmentPaymentsPage,
});

interface ReviewRow {
  id: string;
  patient_name: string | null;
  doctor_name: string | null;
  fee: number | null;
  currency: string;
  scheduled_at: string;
  appointment_type: string | null;
  receipt_url: string | null; // storage path in the `receipts` bucket
  receipt_at: string | null;
  signedUrl?: string;
}

function AppointmentPaymentsPage() {
  const { user, isLoading: authLoading } = useAuth();
  const { isAdmin, isLoading: roleLoading } = useIsAdmin();
  const navigate = useNavigate();

  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.rpc("list_appointment_payment_reviews");
    const list = (data as ReviewRow[]) ?? [];
    // Sign each receipt path so the admin can view it.
    const signed = await Promise.all(
      list.map(async (r) => {
        if (!r.receipt_url) return r;
        const { data: s } = await supabase.storage.from("receipts").createSignedUrl(r.receipt_url, 3600);
        return { ...r, signedUrl: s?.signedUrl };
      }),
    );
    setRows(signed);
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

  const decide = async (id: string, approve: boolean) => {
    setBusyId(id);
    try {
      const { error } = await supabase.rpc("confirm_appointment_payment", {
        p_appointment_id: id,
        p_approve: approve,
      });
      if (error) throw error;
      toast.success(approve ? "تم تأكيد الدفع وإخطار المريض" : "تم رفض الإيصال");
      setRows((prev) => prev.filter((r) => r.id !== id));
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  if (authLoading || roleLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }
  if (!isAdmin) {
    return (
      <div className="mx-auto max-w-md px-4 py-24 text-center text-muted-foreground">غير مصرّح لك بالوصول.</div>
    );
  }

  return (
    <AdminShell>
      <div className="mb-6 flex items-center gap-2">
        <Receipt className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold text-foreground">مدفوعات المواعيد</h1>
        <span className="rounded-full bg-primary/10 px-2.5 py-0.5 text-sm font-medium text-primary">{rows.length}</span>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : rows.length === 0 ? (
        <EmptyState title="لا توجد إيصالات بانتظار المراجعة" description="ستظهر هنا إيصالات المواعيد التي رفعها المرضى." />
      ) : (
        <div className="space-y-3">
          {rows.map((r) => (
            <div key={r.id} className="rounded-2xl border border-border bg-card p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1.5">
                  <p className="flex items-center gap-1.5 text-sm font-bold text-foreground">
                    <User className="h-4 w-4 text-muted-foreground" />
                    {r.patient_name || "مريض"}
                  </p>
                  <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
                    <Stethoscope className="h-4 w-4" />
                    {r.doctor_name || "طبيب"}
                    {r.appointment_type && <span>· {r.appointment_type === "online" ? "أونلاين" : "عيادة"}</span>}
                  </p>
                  <p className="text-sm font-semibold text-foreground">
                    {(r.fee ?? 0).toLocaleString("ar-EG")} {r.currency}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    موعد: {new Date(r.scheduled_at).toLocaleString("ar-EG")}
                  </p>
                </div>

                <div className="flex flex-col items-stretch gap-2">
                  {r.signedUrl && (
                    <a
                      href={r.signedUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-border bg-background px-3 py-1.5 text-sm font-medium hover:bg-accent"
                    >
                      <Receipt className="h-4 w-4" /> عرض الإيصال
                    </a>
                  )}
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={busyId === r.id}
                      onClick={() => decide(r.id, true)}
                      className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                    >
                      <Check className="h-4 w-4" /> تأكيد الدفع
                    </button>
                    <button
                      type="button"
                      disabled={busyId === r.id}
                      onClick={() => decide(r.id, false)}
                      className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-rose-500/40 bg-background px-3 py-1.5 text-sm font-medium text-rose-600 hover:bg-rose-500/10 disabled:opacity-50 dark:text-rose-400"
                    >
                      <X className="h-4 w-4" /> رفض
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </AdminShell>
  );
}
