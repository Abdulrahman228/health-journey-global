import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, ShieldAlert, UserPlus } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { AdminShell } from "@/components/admin/AdminNav";
import { adminCreateUser } from "@/lib/admin/create-user";

export const Route = createFileRoute("/admin/users/new")({
  head: () => ({
    meta: [
      { title: "إنشاء مستخدم — لوحة الأدمن | طبانا" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: AdminNewUserPage,
});

const ROLES = [
  { v: "doctor", l: "طبيب" },
  { v: "patient", l: "مريض" },
  { v: "lab", l: "معمل / مركز أشعة" },
  { v: "pharmacy", l: "صيدلية" },
] as const;

function AdminNewUserPage() {
  const { user, isLoading: authLoading } = useAuth();
  const { isAdmin, isLoading: roleLoading } = useIsAdmin();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: "", password: "", fullName: "", role: "doctor" as (typeof ROLES)[number]["v"], phone: "", specialty: "", reason: "" });
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<{ userId: string; profileId: string; email: string } | null>(null);

  useEffect(() => {
    if (authLoading || roleLoading) return;
    if (!user) navigate({ to: "/login" });
  }, [authLoading, roleLoading, user, navigate]);

  if (authLoading || roleLoading) {
    return <div className="flex min-h-[50vh] items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }
  if (!isAdmin) {
    return (
      <div className="mx-auto max-w-md p-10 text-center">
        <ShieldAlert className="mx-auto h-10 w-10 text-destructive" />
        <p className="mt-3 font-semibold">هذه الصفحة للأدمن فقط.</p>
      </div>
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await adminCreateUser({
        data: {
          email: form.email,
          password: form.password,
          fullName: form.fullName,
          role: form.role,
          phone: form.phone || undefined,
          specialty: form.role === "doctor" && form.specialty ? form.specialty : undefined,
          reason: form.reason,
        },
      });
      setCreated(res);
      toast.success("تم إنشاء الحساب");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const input = "w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30";

  return (
    <AdminShell>
      <h1 className="flex items-center gap-2 text-2xl font-bold text-foreground"><UserPlus className="h-6 w-6 text-primary" /> إنشاء مستخدم</h1>
      <p className="mt-1 text-sm text-muted-foreground">حساب مؤكَّد فورًا (بدون بريد تأكيد) بنفس بيانات التسجيل العادي. مناسب لتسجيل طبيب نيابةً عنه أو لحسابات الاختبار.</p>

      {created ? (
        <div className="mt-6 rounded-2xl border border-success/40 bg-success-soft p-5 text-sm">
          <p className="font-semibold text-foreground">تم إنشاء {created.email}</p>
          <p className="mt-1 text-muted-foreground">كلمة السر هي التي أدخلتها الآن — لن تُعرض مرة أخرى.</p>
          <div className="mt-3 flex flex-wrap gap-3">
            <Link to="/admin/data/$entity" params={{ entity: "profiles" }} search={{ id: created.profileId, user_id: undefined, q: undefined }} className="text-primary hover:underline">فتح الملف</Link>
            <button type="button" onClick={() => { setCreated(null); setForm((f) => ({ ...f, email: "", password: "", fullName: "", phone: "" })); }} className="text-primary hover:underline">إنشاء آخر</button>
          </div>
        </div>
      ) : (
        <form onSubmit={submit} className="mt-6 grid max-w-2xl gap-4 rounded-2xl border border-border bg-card p-6 sm:grid-cols-2">
          <label className="block text-sm"><span className="mb-1 block font-semibold">الاسم الكامل *</span><input required className={input} value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} /></label>
          <label className="block text-sm"><span className="mb-1 block font-semibold">الدور *</span>
            <select className={input} value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as typeof form.role })}>
              {ROLES.map((r) => <option key={r.v} value={r.v}>{r.l}</option>)}
            </select>
          </label>
          <label className="block text-sm"><span className="mb-1 block font-semibold">البريد الإلكتروني *</span><input required type="email" dir="ltr" className={input} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></label>
          <label className="block text-sm"><span className="mb-1 block font-semibold">كلمة السر * (8 أحرف على الأقل)</span><input required minLength={8} type="text" dir="ltr" className={input} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} /></label>
          <label className="block text-sm"><span className="mb-1 block font-semibold">الهاتف</span><input dir="ltr" className={input} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+2010…" /></label>
          {form.role === "doctor" && (
            <label className="block text-sm"><span className="mb-1 block font-semibold">التخصص (بالعربية كما في قائمة التخصصات)</span><input className={input} value={form.specialty} onChange={(e) => setForm({ ...form, specialty: e.target.value })} placeholder="طب عام" /></label>
          )}
          <label className="block text-sm sm:col-span-2"><span className="mb-1 block font-semibold">السبب * (يُسجَّل في سجل التدقيق)</span><input required minLength={3} className={input} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder="مثال: تسجيل طبيب نيابةً عنه / حساب اختبار" /></label>
          <div className="sm:col-span-2">
            <button type="submit" disabled={busy} className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
              {busy && <Loader2 className="h-4 w-4 animate-spin" />} إنشاء الحساب
            </button>
          </div>
        </form>
      )}
    </AdminShell>
  );
}
