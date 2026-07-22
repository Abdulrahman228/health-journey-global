import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { Loader2, ShieldCheck, BadgeCheck, XCircle, Clock, AlertTriangle, X } from "lucide-react";
import { toast } from "sonner";
import { pingIndexNowForDoctor } from "@/lib/indexnow.functions";
import { adminVerifyDoctor } from "@/lib/admin/clinical";
import { AdminVerifyDoctorSchema } from "@/lib/admin/_schemas";
import { AdminShell } from "@/components/admin/AdminNav";
import { EmptyState } from "@/components/admin/EmptyState";

export const Route = createFileRoute("/admin/verifications")({
  head: () => ({
    meta: [
      { title: "لوحة الأدمن - توثيق الأطباء" },
      { name: "description", content: "مراجعة طلبات توثيق الأطباء." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: AdminVerificationsPage,
});

interface Row {
  id: string;
  profile_id: string;
  specialty: string | null;
  syndicate_number: string | null;
  national_id_last4: string | null;
  is_verified: boolean;
  verification_status: string | null;
  verification_submitted_at: string | null;
  verification_notes: string | null;
  profile: { full_name: string | null; city: string | null } | null;
}

function AdminVerificationsPage() {
  const { user, isLoading: authLoading } = useAuth();
  const { isAdmin, isLoading: roleLoading } = useIsAdmin();
  const navigate = useNavigate();
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"pending" | "all">("pending");
  const [verifyTarget, setVerifyTarget] = useState<{ row: Row; decision: "approve" | "reject" } | null>(null);

  // Optimistic update: reflect the decision on the row without a full reload.
  const applyDecision = useCallback((id: string, approved: boolean) => {
    setRows((prev) =>
      prev.map((r) =>
        r.id === id
          ? { ...r, is_verified: approved, verification_status: approved ? "approved" : "rejected" }
          : r,
      ),
    );
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    let query = supabase
      .from("doctor_details")
      .select("id,profile_id,specialty,syndicate_number,national_id_last4,is_verified,verification_status,verification_submitted_at,verification_notes")
      .order("verification_submitted_at", { ascending: false, nullsFirst: false });
    if (tab === "pending") query = query.eq("verification_status", "pending");
    const { data: docs } = await query;
    const list = (docs ?? []) as Omit<Row, "profile">[];
    const ids = list.map((d) => d.profile_id);
    const profileMap: Record<string, { full_name: string | null; city: string | null }> = {};
    if (ids.length) {
      const { data: profs } = await supabase.from("profiles").select("id,full_name,city").in("id", ids);
      (profs ?? []).forEach((p) => {
        profileMap[p.id as string] = { full_name: p.full_name as string | null, city: p.city as string | null };
      });
    }
    setRows(list.map((d) => ({ ...d, profile: profileMap[d.profile_id] ?? null })));
    setLoading(false);
  }, [tab]);

  useEffect(() => {
    if (authLoading || roleLoading) return;
    if (!user) {
      navigate({ to: "/login" });
      return;
    }
    if (!isAdmin) return;
    load();
  }, [authLoading, roleLoading, user, isAdmin, navigate, load]);

  if (authLoading || roleLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <p className="text-muted-foreground">صلاحية الأدمن فقط.</p>
        <Link to="/" className="mt-3 inline-block text-primary hover:underline">العودة للرئيسية</Link>
      </div>
    );
  }

  return (
    <AdminShell>
      <div className="flex items-center gap-2">
        <ShieldCheck className="h-6 w-6 text-primary" />
        <h1 className="text-2xl font-bold">توثيق الأطباء</h1>
      </div>

      <div className="mt-4 flex gap-2">
        {(["pending", "all"] as const).map((k) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
              tab === k ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/70"
            }`}
          >
            {k === "pending" ? "قيد المراجعة" : "الكل"}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="mt-10 flex justify-center"><Loader2 className="h-5 w-5 animate-spin" /></div>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={ShieldCheck}
          description={
            tab === "pending"
              ? "لا توجد طلبات توثيق قيد المراجعة حالياً. عند تقديم طبيب لطلب توثيق سيظهر هنا."
              : "لا توجد طلبات توثيق بعد."
          }
        />
      ) : (
        <div className="mt-6 space-y-4">
          {rows.map((row) => (
            <div key={row.id} className="rounded-2xl border border-border bg-card p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold">{row.profile?.full_name ?? "—"}</h3>
                    {row.is_verified ? (
                      <span className="inline-flex items-center gap-1 text-xs text-success"><BadgeCheck className="h-3.5 w-3.5" />موثّق</span>
                    ) : row.verification_status === "rejected" ? (
                      <span className="inline-flex items-center gap-1 text-xs text-destructive"><XCircle className="h-3.5 w-3.5" />مرفوض</span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-xs text-amber-600"><Clock className="h-3.5 w-3.5" />قيد المراجعة</span>
                    )}
                  </div>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    {row.specialty ?? "—"} {row.profile?.city ? `· ${row.profile.city}` : ""}
                  </p>
                </div>
                <div className="text-end text-xs text-muted-foreground">
                  {row.verification_submitted_at && new Date(row.verification_submitted_at).toLocaleDateString("ar-EG")}
                </div>
              </div>

              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <div className="rounded-lg bg-muted/30 p-3 text-sm">
                  <p className="text-xs text-muted-foreground">رقم النقابة</p>
                  <p className="font-mono font-medium">{row.syndicate_number ?? "—"}</p>
                </div>
                <div className="rounded-lg bg-muted/30 p-3 text-sm">
                  <p className="text-xs text-muted-foreground">آخر 4 أرقام قومي</p>
                  <p className="font-mono font-medium">{row.national_id_last4 ?? "—"}</p>
                </div>
              </div>

              {!row.is_verified && row.verification_status === "pending" && (
                <div className="mt-4 flex gap-2">
                  <button
                    onClick={() => setVerifyTarget({ row, decision: "approve" })}
                    className="flex-1 rounded-lg bg-success py-2 text-sm font-medium text-success-foreground hover:opacity-90"
                  >
                    توثيق
                  </button>
                  <button
                    onClick={() => setVerifyTarget({ row, decision: "reject" })}
                    className="flex-1 rounded-lg bg-destructive py-2 text-sm font-medium text-destructive-foreground hover:opacity-90"
                  >
                    رفض
                  </button>
                </div>
              )}

              {row.verification_notes && (
                <p className="mt-3 text-xs text-muted-foreground">ملاحظات: {row.verification_notes}</p>
              )}
            </div>
          ))}
        </div>
      )}

      {verifyTarget && (
        <VerifyDoctorModal
          row={verifyTarget.row}
          decision={verifyTarget.decision}
          onClose={() => setVerifyTarget(null)}
          onDone={(approved) => {
            applyDecision(verifyTarget.row.id, approved);
            setVerifyTarget(null);
          }}
        />
      )}
    </AdminShell>
  );
}

// =====================================================================
// Approve / Reject confirmation modal — validates with AdminVerifyDoctorSchema
// and calls the adminVerifyDoctor server function.
// =====================================================================
function VerifyDoctorModal({
  row,
  decision,
  onClose,
  onDone,
}: {
  row: Row;
  decision: "approve" | "reject";
  onClose: () => void;
  onDone: (approved: boolean) => void;
}) {
  const approve = decision === "approve";
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    // House rule: rejection requires a reason.
    if (!approve && note.trim().length < 3) {
      setError("اكتب سبب الرفض (3 أحرف على الأقل)");
      return;
    }
    const input = {
      doctorDetailsId: row.id,
      decision,
      ...(note.trim() ? { note: note.trim() } : {}),
    };
    const parsed = AdminVerifyDoctorSchema.safeParse(input);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "بيانات غير صالحة");
      return;
    }

    setBusy(true);
    try {
      await adminVerifyDoctor({ data: parsed.data });
      toast.success(approve ? "تم التوثيق" : "تم الرفض");
      if (approve) {
        // Fire-and-forget: notify IndexNow about the freshly-public profile.
        pingIndexNowForDoctor({ data: { doctorId: row.id } })
          .then((r) => {
            if (r.ok) console.info(`[IndexNow] submitted ${r.submitted} URLs`);
          })
          .catch((e) => console.warn("[IndexNow] ping failed:", e));
      }
      onDone(approve);
    } catch (e) {
      toast.error("حصل خطأ: " + (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const name = row.profile?.full_name ?? "هذا الطبيب";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={approve ? "توثيق طبيب" : "رفض طبيب"}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md overflow-hidden rounded-xl bg-card shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-border px-5 py-3">
          <h2 className="text-lg font-bold">{approve ? "توثيق الطبيب" : "رفض الطلب"}</h2>
          <button type="button" onClick={onClose} aria-label="إغلاق" className="rounded-md p-1 hover:bg-muted">
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="space-y-4 p-5">
          <div className="flex gap-2 rounded-lg bg-muted/50 p-3 text-sm">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
            <p className="text-muted-foreground">
              {approve ? (
                <>سيتم توثيق <span className="font-semibold text-foreground">{name}</span> وتفعيل ملفه العام والاستشارات عن بُعد.</>
              ) : (
                <>سيتم رفض طلب <span className="font-semibold text-foreground">{name}</span>. يجب توضيح السبب.</>
              )}
            </p>
          </div>

          <label className="block text-sm">
            <span className="font-medium text-foreground">
              ملاحظات {approve ? "(اختياري)" : "*"}
            </span>
            <textarea
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={approve ? "ملاحظة اختيارية" : "سبب الرفض (3 أحرف على الأقل)"}
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
            />
          </label>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <footer className="flex justify-end gap-2 border-t border-border px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded-md border border-border px-4 py-2 text-sm font-medium hover:bg-muted disabled:opacity-60"
          >
            إلغاء
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={busy || (!approve && note.trim().length < 3)}
            className={
              "inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-semibold text-white disabled:opacity-60 " +
              (approve ? "bg-success hover:opacity-90" : "bg-destructive hover:bg-destructive/90")
            }
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : approve ? <BadgeCheck className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
            {approve ? "تأكيد التوثيق" : "تأكيد الرفض"}
          </button>
        </footer>
      </div>
    </div>
  );
}
