/**
 * /admin/doctors — admin doctor management.
 *
 * Lists all doctor_details rows joined with their profile (name, city,
 * avatar), with quick filters (verified/pending), search, inline
 * verification toggle, and edit of key SEO-impacting fields:
 *   specialty, consultation_fee, years_experience, bio.
 *
 * RLS still enforces admin-only writes; the page is also gated client-side
 * via useIsAdmin and excluded from indexing via noindex,nofollow.
 *
 * SEO note (Rank Math course module 5 — YMYL trust signals):
 *  - Verifying doctors flips `is_verified=true`, which is what the
 *    sitemap-doctors.xml fetcher uses to decide indexability. So this
 *    page directly controls what enters Google's index.
 */
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { AdminNav } from "@/components/admin/AdminNav";
import { pingIndexNow } from "@/lib/indexnow.functions";
import { siteConfig } from "@/lib/seo";
import {
  CheckCircle2,
  Loader2,
  Save,
  Search,
  ShieldAlert,
  Stethoscope,
  X,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/doctors")({
  head: () => ({
    meta: [
      { title: "إدارة الأطباء — لوحة الأدمن | طبيبي" },
      { name: "description", content: "توثيق وتحرير ملفات الأطباء على طبيبي." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: AdminDoctorsPage,
});

interface DoctorRow {
  id: string;
  profile_id: string;
  specialty: string | null;
  clinic_name: string | null;
  clinic_address: string | null;
  bio: string | null;
  consultation_fee: number | null;
  years_experience: number | null;
  rating: number | null;
  is_verified: boolean;
  verification_status: string | null;
  updated_at: string;
  profile?: {
    full_name: string | null;
    avatar_url: string | null;
    city: string | null;
  } | null;
}

type EditDraft = {
  id: string;
  specialty: string;
  clinic_name: string;
  clinic_address: string;
  bio: string;
  consultation_fee: number;
  years_experience: number;
};

function AdminDoctorsPage() {
  const { user, isLoading: authLoading } = useAuth();
  const { isAdmin, isLoading: roleLoading } = useIsAdmin();
  const navigate = useNavigate();
  const [rows, setRows] = useState<DoctorRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"all" | "pending" | "verified">("all");
  const [search, setSearch] = useState("");
  const [edit, setEdit] = useState<EditDraft | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("doctor_details")
      .select(
        "id, profile_id, specialty, clinic_name, clinic_address, bio, consultation_fee, years_experience, rating, is_verified, verification_status, updated_at",
      )
      .order("updated_at", { ascending: false });
    if (error || !data) {
      toast.error("تعذّر تحميل الأطباء");
      setLoading(false);
      return;
    }
    const profileIds = data.map((d) => d.profile_id);
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name, avatar_url, city")
      .in("id", profileIds);
    const byId = new Map(
      (profiles ?? []).map((p) => [p.id, p as DoctorRow["profile"]]),
    );
    setRows(
      (data as DoctorRow[]).map((d) => ({
        ...d,
        profile: byId.get(d.profile_id) ?? null,
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
    if (!isAdmin) return;
    load();
  }, [authLoading, roleLoading, user, isAdmin, navigate, load]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (filter === "pending" && r.is_verified) return false;
      if (filter === "verified" && !r.is_verified) return false;
      if (search) {
        const q = search.toLowerCase();
        const hay = [
          r.profile?.full_name ?? "",
          r.specialty ?? "",
          r.profile?.city ?? "",
          r.clinic_name ?? "",
        ]
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [rows, filter, search]);

  const counts = useMemo(
    () => ({
      all: rows.length,
      pending: rows.filter((r) => !r.is_verified).length,
      verified: rows.filter((r) => r.is_verified).length,
    }),
    [rows],
  );

  const toggleVerify = useCallback(
    async (row: DoctorRow) => {
      const next = !row.is_verified;
      const { error } = await supabase
        .from("doctor_details")
        .update({
          is_verified: next,
          verification_status: next ? "verified" : "pending",
        })
        .eq("id", row.id);
      if (error) {
        toast.error("فشل التحديث: " + error.message);
        return;
      }
      toast.success(next ? "تم توثيق الطبيب" : "تم إلغاء التوثيق");
      // When verifying, ping IndexNow so Google/Bing crawl the new doctor URL
      if (next) {
        try {
          await pingIndexNow({
            data: {
              urls: [
                `${siteConfig.url}/doctor/${row.id}`,
                `${siteConfig.url}/doctors`,
                `${siteConfig.url}/sitemap-doctors.xml`,
              ],
            },
          });
        } catch {
          /* non-fatal */
        }
      }
      load();
    },
    [load],
  );

  const startEdit = (row: DoctorRow) => {
    setEdit({
      id: row.id,
      specialty: row.specialty ?? "",
      clinic_name: row.clinic_name ?? "",
      clinic_address: row.clinic_address ?? "",
      bio: row.bio ?? "",
      consultation_fee: row.consultation_fee ?? 0,
      years_experience: row.years_experience ?? 0,
    });
  };

  const saveEdit = useCallback(async () => {
    if (!edit) return;
    setSaving(true);
    const { error } = await supabase
      .from("doctor_details")
      .update({
        specialty: edit.specialty || null,
        clinic_name: edit.clinic_name || null,
        clinic_address: edit.clinic_address || null,
        bio: edit.bio || null,
        consultation_fee: edit.consultation_fee || null,
        years_experience: edit.years_experience || null,
      })
      .eq("id", edit.id);
    setSaving(false);
    if (error) {
      toast.error("فشل الحفظ: " + error.message);
      return;
    }
    toast.success("تم الحفظ");
    setEdit(null);
    load();
  }, [edit, load]);

  // Gate
  if (authLoading || roleLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }
  if (!user) return null;
  if (!isAdmin) {
    return (
      <div className="mx-auto max-w-md px-4 py-24 text-center">
        <ShieldAlert className="mx-auto h-12 w-12 text-destructive" />
        <h1 className="mt-4 text-xl font-bold">صلاحيات غير كافية</h1>
        <p className="mt-2 text-muted-foreground">
          هذه الصفحة مخصصة لمشرفي المنصة فقط.
        </p>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-10" dir="rtl">
      <AdminNav />
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">إدارة الأطباء</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            توثيق وتحرير ملفات الأطباء. التوثيق ينعكس فوراً في الـ sitemap.
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm">
          {(["all", "pending", "verified"] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={
                "rounded-full border px-3 py-1.5 font-medium transition " +
                (filter === f
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-foreground hover:bg-muted")
              }
            >
              {f === "all" ? "الكل" : f === "pending" ? "بانتظار التوثيق" : "موثّق"}{" "}
              ({counts[f]})
            </button>
          ))}
        </div>
      </header>

      <div className="mb-6 relative">
        <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="بحث بالاسم أو التخصص أو المدينة…"
          className="w-full rounded-lg border border-border bg-card py-2 ps-10 pe-3 text-sm outline-none focus:border-primary"
        />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card py-16 text-center text-muted-foreground">
          لا يوجد أطباء يطابقون المرشّحات.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-muted/40 text-start text-xs font-semibold uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-start">الطبيب</th>
                <th className="px-4 py-3 text-start">التخصص</th>
                <th className="px-4 py-3 text-start">المدينة</th>
                <th className="px-4 py-3 text-start">سعر الكشف</th>
                <th className="px-4 py-3 text-start">الخبرة</th>
                <th className="px-4 py-3 text-start">التقييم</th>
                <th className="px-4 py-3 text-start">الحالة</th>
                <th className="px-4 py-3 text-start">إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => (
                <tr
                  key={r.id}
                  className="border-b border-border last:border-0 hover:bg-muted/30"
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      {r.profile?.avatar_url ? (
                        <img
                          src={r.profile.avatar_url}
                          alt=""
                          width={36}
                          height={36}
                          loading="lazy"
                          decoding="async"
                          className="h-9 w-9 rounded-full object-cover"
                        />
                      ) : (
                        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10">
                          <Stethoscope className="h-4 w-4 text-primary" />
                        </div>
                      )}
                      <div>
                        <div className="font-semibold">
                          {r.profile?.full_name ?? "—"}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {r.id.slice(0, 8)}…
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3">{r.specialty ?? "—"}</td>
                  <td className="px-4 py-3">{r.profile?.city ?? "—"}</td>
                  <td className="px-4 py-3">{r.consultation_fee ?? "—"}</td>
                  <td className="px-4 py-3">{r.years_experience ?? "—"}</td>
                  <td className="px-4 py-3">{r.rating?.toFixed(1) ?? "—"}</td>
                  <td className="px-4 py-3">
                    {r.is_verified ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                        <CheckCircle2 className="h-3 w-3" />
                        موثّق
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-700">
                        بانتظار
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => toggleVerify(r)}
                        className={
                          "rounded-md border px-2.5 py-1 text-xs font-medium transition " +
                          (r.is_verified
                            ? "border-border text-foreground hover:bg-muted"
                            : "border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-700")
                        }
                      >
                        {r.is_verified ? "إلغاء التوثيق" : "توثيق"}
                      </button>
                      <button
                        type="button"
                        onClick={() => startEdit(r)}
                        className="rounded-md border border-border px-2.5 py-1 text-xs font-medium text-foreground hover:bg-muted"
                      >
                        تحرير
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Edit modal */}
      {edit && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="تحرير بيانات الطبيب"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
        >
          <div className="w-full max-w-2xl overflow-hidden rounded-xl bg-card shadow-xl">
            <header className="flex items-center justify-between border-b border-border px-5 py-3">
              <h2 className="text-lg font-bold">تحرير بيانات الطبيب</h2>
              <button
                type="button"
                onClick={() => setEdit(null)}
                aria-label="إغلاق"
                className="rounded-md p-1 hover:bg-muted"
              >
                <X className="h-4 w-4" />
              </button>
            </header>
            <div className="space-y-4 p-5">
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="text-sm font-medium">التخصص</span>
                  <input
                    type="text"
                    value={edit.specialty}
                    onChange={(e) =>
                      setEdit({ ...edit, specialty: e.target.value })
                    }
                    className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                  />
                </label>
                <label className="block">
                  <span className="text-sm font-medium">اسم العيادة</span>
                  <input
                    type="text"
                    value={edit.clinic_name}
                    onChange={(e) =>
                      setEdit({ ...edit, clinic_name: e.target.value })
                    }
                    className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                  />
                </label>
                <label className="block sm:col-span-2">
                  <span className="text-sm font-medium">عنوان العيادة</span>
                  <input
                    type="text"
                    value={edit.clinic_address}
                    onChange={(e) =>
                      setEdit({ ...edit, clinic_address: e.target.value })
                    }
                    className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                  />
                </label>
                <label className="block">
                  <span className="text-sm font-medium">سعر الكشف</span>
                  <input
                    type="number"
                    min={0}
                    value={edit.consultation_fee}
                    onChange={(e) =>
                      setEdit({
                        ...edit,
                        consultation_fee: Number(e.target.value),
                      })
                    }
                    className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                  />
                </label>
                <label className="block">
                  <span className="text-sm font-medium">سنوات الخبرة</span>
                  <input
                    type="number"
                    min={0}
                    value={edit.years_experience}
                    onChange={(e) =>
                      setEdit({
                        ...edit,
                        years_experience: Number(e.target.value),
                      })
                    }
                    className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                  />
                </label>
                <label className="block sm:col-span-2">
                  <span className="text-sm font-medium">
                    نبذة قصيرة (تظهر في ملف الطبيب)
                  </span>
                  <textarea
                    rows={5}
                    value={edit.bio}
                    onChange={(e) => setEdit({ ...edit, bio: e.target.value })}
                    className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                  />
                </label>
              </div>
            </div>
            <footer className="flex justify-end gap-2 border-t border-border px-5 py-3">
              <button
                type="button"
                onClick={() => setEdit(null)}
                className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-muted"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={saveEdit}
                disabled={saving}
                className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-60"
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Save className="h-4 w-4" />
                )}
                حفظ
              </button>
            </footer>
          </div>
        </div>
      )}
    </div>
  );
}
