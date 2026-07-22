import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { AdminShell } from "@/components/admin/AdminNav";
import { useAuth } from "@/hooks/useAuth";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { supabase } from "@/integrations/supabase/client";
import { adminBanUser } from "@/lib/admin/users";
import { AdminBanUserSchema } from "@/lib/admin/_schemas";
import {
  AlertTriangle,
  Ban,
  CalendarDays,
  Loader2,
  Search,
  ShieldAlert,
  ShieldCheck,
  UserRound,
  X,
} from "lucide-react";

export const Route = createFileRoute("/admin/patients")({
  head: () => ({
    meta: [
      { title: "إدارة المرضى — Super Admin | طبيبي" },
      { name: "description", content: "إدارة ومراجعة حسابات المرضى في منصة طبيبي." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: AdminPatientsPage,
});

type PatientRow = {
  id: string;
  user_id: string;
  full_name: string | null;
  city: string | null;
  country: string | null;
  avatar_url: string | null;
  created_at: string;
  status: string;
  appointments_count: number;
};

function AdminPatientsPage() {
  const { user, isLoading: authLoading } = useAuth();
  const { isAdmin, isLoading: roleLoading } = useIsAdmin();
  const navigate = useNavigate();
  const [rows, setRows] = useState<PatientRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [banTarget, setBanTarget] = useState<PatientRow | null>(null);

  // Optimistic update: reflect the new ban status immediately without a full reload.
  const applyStatus = useCallback((userId: string, status: string) => {
    setRows((prev) => prev.map((r) => (r.user_id === userId ? { ...r, status } : r)));
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    const { data: roles } = await supabase.from("user_roles").select("user_id").eq("role", "patient");
    const userIds = Array.from(new Set((roles ?? []).map((role) => role.user_id)));
    if (userIds.length === 0) {
      setRows([]);
      setLoading(false);
      return;
    }

    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, user_id, full_name, city, country, avatar_url, created_at, status")
      .in("user_id", userIds)
      .order("created_at", { ascending: false });

    const profileIds = (profiles ?? []).map((profile) => profile.id);
    const { data: appointments } = profileIds.length
      ? await supabase.from("appointments").select("patient_id").in("patient_id", profileIds)
      : { data: [] };

    const appointmentCountByPatient = new Map<string, number>();
    (appointments ?? []).forEach((appointment) => {
      const patientId = appointment.patient_id;
      appointmentCountByPatient.set(patientId, (appointmentCountByPatient.get(patientId) ?? 0) + 1);
    });

    setRows(
      (profiles ?? []).map((profile) => ({
        ...profile,
        appointments_count: appointmentCountByPatient.get(profile.id) ?? 0,
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

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) =>
      [row.full_name, row.city, row.country, row.user_id]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(q),
    );
  }, [rows, search]);

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
        <h1 className="text-3xl font-bold">إدارة المرضى</h1>
        <p className="mt-1 text-sm text-muted-foreground">أرشيف حسابات المرضى وحجم نشاطهم داخل المنصة.</p>
      </header>

      <div className="mb-5 grid gap-3 sm:grid-cols-2">
        <SummaryCard icon={UserRound} label="إجمالي المرضى" value={rows.length} />
        <SummaryCard
          icon={CalendarDays}
          label="إجمالي حجوزاتهم"
          value={rows.reduce((sum, row) => sum + row.appointments_count, 0)}
        />
      </div>

      <div className="mb-5 relative">
        <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="search"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="بحث بالاسم أو المدينة أو معرف المستخدم..."
          className="w-full rounded-lg border border-border bg-card py-2 ps-10 pe-3 text-sm outline-none focus:border-primary"
        />
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-muted/40 text-xs font-semibold text-muted-foreground">
            <tr>
              <th className="px-4 py-3 text-start">المريض</th>
              <th className="px-4 py-3 text-start">المدينة</th>
              <th className="px-4 py-3 text-start">تاريخ التسجيل</th>
              <th className="px-4 py-3 text-start">الحجوزات</th>
              <th className="px-4 py-3 text-start">User ID</th>
              <th className="px-4 py-3 text-end">إجراءات</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-16 text-center text-sm text-muted-foreground">
                  {search ? "لا توجد نتائج تطابق بحثك." : "لا يوجد مرضى مسجّلون بعد."}
                </td>
              </tr>
            ) : filtered.map((row) => (
              <tr key={row.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    {row.avatar_url ? (
                      <img src={row.avatar_url} alt="" className="h-9 w-9 rounded-full object-cover" />
                    ) : (
                      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10">
                        <UserRound className="h-4 w-4 text-primary" />
                      </div>
                    )}
                    <span className="font-semibold">{row.full_name ?? "مريض بدون اسم"}</span>
                    {row.status === "banned" && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">
                        <Ban className="h-3 w-3" /> محظور
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3">{row.city ?? row.country ?? "—"}</td>
                <td className="px-4 py-3">{new Date(row.created_at).toLocaleDateString("ar-EG")}</td>
                <td className="px-4 py-3">{row.appointments_count.toLocaleString("ar-EG")}</td>
                <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{row.user_id.slice(0, 8)}...</td>
                <td className="px-4 py-3 text-end">
                  {row.status === "banned" ? (
                    <button
                      type="button"
                      onClick={() => setBanTarget(row)}
                      className="inline-flex items-center gap-1 rounded-md border border-emerald-500/30 px-2.5 py-1 text-xs font-medium text-emerald-600 hover:bg-emerald-500/10"
                    >
                      <ShieldCheck className="h-3 w-3" /> رفع الحظر
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setBanTarget(row)}
                      className="inline-flex items-center gap-1 rounded-md border border-destructive/30 px-2.5 py-1 text-xs font-medium text-destructive hover:bg-destructive/10"
                    >
                      <Ban className="h-3 w-3" /> حظر
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {banTarget && (
        <BanUserModal
          target={banTarget}
          onClose={() => setBanTarget(null)}
          onDone={(status) => {
            applyStatus(banTarget.user_id, status);
            setBanTarget(null);
          }}
        />
      )}
    </AdminShell>
  );
}

// =====================================================================
// Ban / Unban confirmation modal — validates with AdminBanUserSchema and
// calls the adminBanUser server function.
// =====================================================================
function BanUserModal({
  target,
  onClose,
  onDone,
}: {
  target: PatientRow;
  onClose: () => void;
  onDone: (status: string) => void;
}) {
  const isUnban = target.status === "banned";
  const [reason, setReason] = useState("");
  const [durationHours, setDurationHours] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setError(null);
    // Validate with the SAME schema the server enforces (single source of truth).
    const input = {
      targetUserId: target.user_id,
      reason: reason.trim(),
      ...(isUnban ? { unban: true } : {}),
      ...(!isUnban && durationHours.trim() ? { durationHours: Number(durationHours) } : {}),
    };
    const parsed = AdminBanUserSchema.safeParse(input);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "بيانات غير صالحة");
      return;
    }

    setBusy(true);
    try {
      await adminBanUser({ data: parsed.data });
      toast.success(isUnban ? "تم رفع الحظر عن المستخدم" : "تم حظر المستخدم");
      onDone(isUnban ? "active" : "banned");
    } catch (e) {
      toast.error((isUnban ? "فشل رفع الحظر: " : "فشل الحظر: ") + (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const name = target.full_name ?? "هذا المستخدم";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={isUnban ? "رفع الحظر" : "حظر مستخدم"}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md overflow-hidden rounded-xl bg-card shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-border px-5 py-3">
          <h2 className="text-lg font-bold">{isUnban ? "رفع الحظر" : "حظر المستخدم"}</h2>
          <button type="button" onClick={onClose} aria-label="إغلاق" className="rounded-md p-1 hover:bg-muted">
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="space-y-4 p-5">
          <div className="flex gap-2 rounded-lg bg-muted/50 p-3 text-sm">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
            <p className="text-muted-foreground">
              {isUnban ? (
                <>سيتم رفع الحظر عن <span className="font-semibold text-foreground">{name}</span> وإعادة تفعيل حسابه.</>
              ) : (
                <>سيتم حظر <span className="font-semibold text-foreground">{name}</span> على مستوى تسجيل الدخول (تُلغى جلساته الحالية فوراً).</>
              )}
            </p>
          </div>

          <label className="block text-sm">
            <span className="font-medium text-foreground">السبب *</span>
            <textarea
              rows={2}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="سبب الإجراء (3 أحرف على الأقل)"
              className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
            />
          </label>

          {!isUnban && (
            <label className="block text-sm">
              <span className="font-medium text-foreground">مدة الحظر (ساعات)</span>
              <input
                type="number"
                min={1}
                value={durationHours}
                onChange={(e) => setDurationHours(e.target.value)}
                placeholder="اتركه فارغاً للحظر الدائم"
                className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
              />
            </label>
          )}

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
            disabled={busy || reason.trim().length < 3}
            className={
              "inline-flex items-center gap-2 rounded-md px-4 py-2 text-sm font-semibold text-white disabled:opacity-60 " +
              (isUnban ? "bg-emerald-600 hover:bg-emerald-700" : "bg-destructive hover:bg-destructive/90")
            }
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : isUnban ? <ShieldCheck className="h-4 w-4" /> : <Ban className="h-4 w-4" />}
            {isUnban ? "تأكيد رفع الحظر" : "تأكيد الحظر"}
          </button>
        </footer>
      </div>
    </div>
  );
}

function SummaryCard({ icon: Icon, label, value }: { icon: typeof UserRound; label: string; value: number }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <p className="text-2xl font-bold">{value.toLocaleString("ar-EG")}</p>
          <p className="text-sm text-muted-foreground">{label}</p>
        </div>
      </div>
    </div>
  );
}
