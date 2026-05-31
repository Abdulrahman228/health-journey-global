import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { Loader2, ShieldCheck, BadgeCheck, XCircle, Clock } from "lucide-react";
import { toast } from "sonner";
import { pingIndexNowForDoctor } from "@/lib/indexnow.functions";
import { AdminNav } from "@/components/admin/AdminNav";

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
  const [actingId, setActingId] = useState<string | null>(null);
  const [notesById, setNotesById] = useState<Record<string, string>>({});

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

  const review = async (row: Row, approve: boolean) => {
    setActingId(row.id);
    const notes = notesById[row.id] ?? null;
    if (!approve && !notes) {
      toast.error("اكتب سبب الرفض");
      setActingId(null);
      return;
    }
    const { error } = await supabase
      .from("doctor_details")
      .update({
        is_verified: approve,
        verification_status: approve ? "approved" : "rejected",
        telemedicine_enabled: approve ? true : false,
        verification_reviewed_at: new Date().toISOString(),
        verification_reviewed_by: user?.id ?? null,
        verification_notes: notes,
      })
      .eq("id", row.id);

    if (!error) {
      await supabase.from("audit_logs").insert({
        user_id: user?.id ?? null,
        action: approve ? "doctor_verified" : "doctor_rejected",
        resource_type: "doctor_details",
        resource_id: row.id,
        metadata: { syndicate_number: row.syndicate_number, notes },
      });
      toast.success(approve ? "تم التوثيق" : "تم الرفض");
      if (approve) {
        // Fire-and-forget: tell IndexNow about the freshly-public profile
        // so Bing/Yandex/etc. crawl it within minutes (module 3.3 in the
        // Rank Math course). Failure is non-fatal — sitemap still works.
        pingIndexNowForDoctor({ data: { doctorId: row.id } })
          .then((r) => {
            if (r.ok) console.info(`[IndexNow] submitted ${r.submitted} URLs`);
          })
          .catch((e) => console.warn("[IndexNow] ping failed:", e));
      }
      await load();
    } else {
      toast.error("حصل خطأ");
    }
    setActingId(null);
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
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <p className="text-muted-foreground">صلاحية الأدمن فقط.</p>
        <Link to="/" className="mt-3 inline-block text-primary hover:underline">العودة للرئيسية</Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6" dir="rtl">
      <AdminNav />
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
        <p className="mt-10 text-center text-muted-foreground">لا توجد طلبات.</p>
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
                <div className="mt-4 space-y-2">
                  <input
                    type="text"
                    value={notesById[row.id] ?? ""}
                    onChange={(e) => setNotesById((s) => ({ ...s, [row.id]: e.target.value }))}
                    placeholder="ملاحظات (إلزامية عند الرفض)"
                    className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm"
                  />
                  <div className="flex gap-2">
                    <button
                      onClick={() => review(row, true)}
                      disabled={actingId === row.id}
                      className="flex-1 rounded-lg bg-success py-2 text-sm font-medium text-success-foreground hover:opacity-90 disabled:opacity-50"
                    >
                      توثيق
                    </button>
                    <button
                      onClick={() => review(row, false)}
                      disabled={actingId === row.id}
                      className="flex-1 rounded-lg bg-destructive py-2 text-sm font-medium text-destructive-foreground hover:opacity-90 disabled:opacity-50"
                    >
                      رفض
                    </button>
                  </div>
                </div>
              )}

              {row.verification_notes && (
                <p className="mt-3 text-xs text-muted-foreground">ملاحظات: {row.verification_notes}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
