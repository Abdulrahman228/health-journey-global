/**
 * /admin/ai-references — the medical reference library the AI assistant
 * retrieves from and cites (public.medical_sources / medical_chunks).
 *
 * Admins can: see every source and how many passages it holds, switch a
 * source on/off, delete it, upload a licensed PDF/text (queued as a job),
 * and queue a MedlinePlus refresh. Jobs are processed by
 * `npm run ingest:references -- jobs` (needs the service-role + OpenAI keys,
 * so it runs on the owner's machine/CI — never in the browser).
 */
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { AdminShell } from "@/components/admin/AdminNav";
import { useAuth } from "@/hooks/useAuth";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { supabase } from "@/integrations/supabase/client";
import {
  BookOpen,
  Loader2,
  Power,
  RefreshCw,
  ShieldAlert,
  Trash2,
  Upload,
  CheckCircle2,
  Clock,
  XCircle,
} from "lucide-react";

export const Route = createFileRoute("/admin/ai-references")({
  head: () => ({
    meta: [
      { title: "المكتبة الطبية للمساعد الذكي — Admin | طبانا" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: AdminAiReferencesPage,
});

type Source = {
  id: string;
  slug: string;
  title: string;
  publisher: string | null;
  url: string | null;
  license: string;
  kind: string;
  language: string;
  specialties: string[];
  is_active: boolean;
  chunk_count: number;
  updated_at: string;
};

type Job = {
  id: string;
  kind: string;
  status: string;
  params: { title?: string; storage_path?: string } | null;
  total: number | null;
  processed: number;
  chunks: number;
  error: string | null;
  created_at: string;
};

const LICENSES: { value: string; label: string }[] = [
  { value: "owned-license", label: "مرخّص لنا (شراء/اشتراك مؤسسي)" },
  { value: "moh-protocol", label: "بروتوكول وزارة الصحة / هيئة الدواء" },
  { value: "public-domain", label: "ملك عام (حكومي أمريكي، NLM…)" },
  { value: "cc-by", label: "Creative Commons BY (يسمح بالاستخدام التجاري)" },
  { value: "own-content", label: "محتوى من تأليفنا" },
];

const KINDS = [
  { value: "textbook", label: "كتاب / مرجع" },
  { value: "guideline", label: "إرشادات سريرية" },
  { value: "protocol", label: "بروتوكول علاجي" },
  { value: "drug_label", label: "نشرة دواء" },
  { value: "reference", label: "أخرى" },
];

function AdminAiReferencesPage() {
  const { user, isLoading: authLoading } = useAuth();
  const { isAdmin, isLoading: roleLoading } = useIsAdmin();
  const navigate = useNavigate();
  const [sources, setSources] = useState<Source[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const [title, setTitle] = useState("");
  const [publisher, setPublisher] = useState("");
  const [license, setLicense] = useState("owned-license");
  const [kind, setKind] = useState("textbook");
  const [specialties, setSpecialties] = useState("");
  const [language, setLanguage] = useState("en");
  const [attest, setAttest] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: s }, { data: j }] = await Promise.all([
      supabase
        .from("medical_sources" as never)
        .select("*")
        .order("created_at", { ascending: false }),
      supabase
        .from("medical_ingest_jobs" as never)
        .select("*")
        .order("created_at", { ascending: false })
        .limit(30),
    ]);
    setSources((s ?? []) as unknown as Source[]);
    setJobs((j ?? []) as unknown as Job[]);
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

  const toggleActive = async (src: Source) => {
    const { error } = await supabase
      .from("medical_sources" as never)
      .update({ is_active: !src.is_active } as never)
      .eq("id", src.id);
    if (error) return toast.error(error.message);
    setSources((prev) =>
      prev.map((x) => (x.id === src.id ? { ...x, is_active: !x.is_active } : x)),
    );
  };

  const remove = async (src: Source) => {
    if (!window.confirm(`حذف «${src.title}» وكل مقاطعه (${src.chunk_count})؟ لا يمكن التراجع.`))
      return;
    const { error } = await supabase
      .from("medical_sources" as never)
      .delete()
      .eq("id", src.id);
    if (error) return toast.error(error.message);
    setSources((prev) => prev.filter((x) => x.id !== src.id));
    toast.success("تم الحذف");
  };

  const queueMedlinePlus = async () => {
    const { error } = await supabase.from("medical_ingest_jobs" as never).insert({
      kind: "medlineplus",
      params: { title: "MedlinePlus Health Topics", language: "en" },
      created_by: user?.id,
    } as never);
    if (error) return toast.error(error.message);
    toast.success("تمت جدولة تحديث MedlinePlus — شغّل أمر الإدخال لمعالجته");
    void load();
  };

  const handleFile = async (file: File) => {
    if (!title.trim()) return toast.error("أدخل عنوان المرجع أولاً");
    if (!attest) return toast.error("أكّد أن لديك ترخيصاً يسمح بالاستخدام التجاري لهذا المحتوى");
    const isPdf = file.type === "application/pdf" || /\.pdf$/i.test(file.name);
    const isText = file.type.startsWith("text/") || /\.(txt|md)$/i.test(file.name);
    if (!isPdf && !isText) return toast.error("الملفات المدعومة: PDF أو نص");
    if (file.size > 200 * 1024 * 1024) return toast.error("الحد الأقصى 200 ميجابايت");
    setUploading(true);
    try {
      const safeName = file.name.replace(/[^\w.\-؀-ۿ]+/g, "_");
      const path = `${crypto.randomUUID()}/${safeName}`;
      const { error: upErr } = await supabase.storage
        .from("medical-references")
        .upload(path, file, {
          contentType: isPdf ? "application/pdf" : "text/plain",
          upsert: false,
        });
      if (upErr) throw upErr;
      const { error: jobErr } = await supabase.from("medical_ingest_jobs" as never).insert({
        kind: isPdf ? "pdf" : "text",
        params: {
          title: title.trim(),
          publisher: publisher.trim() || null,
          license,
          kind,
          language,
          specialties: specialties
            .split(",")
            .map((s) => s.trim().toLowerCase())
            .filter(Boolean),
          storage_path: path,
          attested_by: user?.id,
          attested_at: new Date().toISOString(),
        },
        created_by: user?.id,
      } as never);
      if (jobErr) throw jobErr;
      toast.success("تم الرفع وجدولة الإدخال — شغّل أمر الإدخال لمعالجته");
      setTitle("");
      setPublisher("");
      setSpecialties("");
      setAttest(false);
      void load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذّر الرفع");
    } finally {
      setUploading(false);
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
      <div className="mx-auto max-w-md px-4 py-24 text-center">
        <ShieldAlert className="mx-auto h-10 w-10 text-destructive" />
        <p className="mt-3 font-medium">هذه الصفحة للمشرفين فقط.</p>
      </div>
    );
  }

  const totalChunks = sources.reduce((a, s) => a + (s.is_active ? s.chunk_count : 0), 0);
  const inputCls =
    "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20";

  return (
    <AdminShell>
      <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">المكتبة الطبية للمساعد الذكي</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            المساعد يجيب فقط من هذه المراجع ويذكرها مع كل اقتراح. مقاطع فعّالة الآن:{" "}
            <span className="font-semibold text-foreground">
              {totalChunks.toLocaleString("ar-EG")}
            </span>
          </p>
        </div>
        <button
          type="button"
          onClick={queueMedlinePlus}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-accent"
        >
          <RefreshCw className="h-4 w-4" /> تحديث MedlinePlus (ملك عام)
        </button>
      </header>

      <section className="mb-8 rounded-xl border border-border bg-card p-5">
        <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold text-foreground">
          <Upload className="h-5 w-5 text-primary" /> إضافة مرجع مرخّص (PDF أو نص)
        </h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="mb-1 block text-sm font-medium">عنوان المرجع *</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className={inputCls}
              placeholder="مثال: بروتوكول علاج ارتفاع ضغط الدم — وزارة الصحة 2025"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">الناشر</label>
            <input
              value={publisher}
              onChange={(e) => setPublisher(e.target.value)}
              className={inputCls}
              placeholder="وزارة الصحة والسكان"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">نوع الترخيص *</label>
            <select
              value={license}
              onChange={(e) => setLicense(e.target.value)}
              className={inputCls}
            >
              {LICENSES.map((l) => (
                <option key={l.value} value={l.value}>
                  {l.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">النوع</label>
            <select value={kind} onChange={(e) => setKind(e.target.value)} className={inputCls}>
              {KINDS.map((k) => (
                <option key={k.value} value={k.value}>
                  {k.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium">اللغة</label>
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className={inputCls}
            >
              <option value="en">English</option>
              <option value="ar">العربية</option>
            </select>
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1 block text-sm font-medium">
              التخصصات (مفصولة بفاصلة، بالإنجليزية)
            </label>
            <input
              value={specialties}
              onChange={(e) => setSpecialties(e.target.value)}
              className={inputCls}
              placeholder="cardiology, internal medicine"
              dir="ltr"
            />
          </div>
        </div>
        <label className="mt-4 flex items-start gap-2 rounded-lg border border-warning/40 bg-warning-soft p-3 text-xs leading-relaxed">
          <input
            type="checkbox"
            checked={attest}
            onChange={(e) => setAttest(e.target.checked)}
            className="mt-0.5 h-4 w-4"
          />
          <span>
            أقرّ بأن طبانا تملك الحق في استخدام هذا المحتوى تجارياً (ملك عام، أو ترخيص CC-BY، أو
            ترخيص مشترى، أو محتوى من تأليفنا). الكتب المحمية بحقوق النشر بدون ترخيص لا يجوز رفعها.
          </span>
        </label>
        <div className="mt-4 flex items-center gap-3">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-50"
          >
            {uploading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Upload className="h-4 w-4" />
            )}{" "}
            اختيار الملف ورفعه
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".pdf,.txt,.md,application/pdf,text/plain"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleFile(f);
              e.target.value = "";
            }}
          />
          <span className="text-xs text-muted-foreground">
            بعد الرفع شغّل على جهاز المالك: <code dir="ltr">npm run ingest:references -- jobs</code>
          </span>
        </div>
      </section>

      {jobs.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-2 text-lg font-semibold text-foreground">مهام الإدخال</h2>
          <ul className="divide-y divide-border rounded-xl border border-border bg-card">
            {jobs.map((j) => (
              <li
                key={j.id}
                className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm"
              >
                <span className="flex items-center gap-2">
                  {j.status === "done" ? (
                    <CheckCircle2 className="h-4 w-4 text-success" />
                  ) : j.status === "failed" ? (
                    <XCircle className="h-4 w-4 text-destructive" />
                  ) : (
                    <Clock className="h-4 w-4 text-warning" />
                  )}
                  <span className="font-medium">{j.params?.title ?? j.kind}</span>
                  <span className="text-xs text-muted-foreground">({j.kind})</span>
                </span>
                <span className="text-xs text-muted-foreground">
                  {j.status === "done"
                    ? `${j.chunks} مقطع`
                    : j.status === "failed"
                      ? (j.error ?? "فشل")
                      : j.status === "running"
                        ? `جارٍ… ${j.chunks} مقطع`
                        : "في الانتظار"}
                  {" · "}
                  {new Date(j.created_at).toLocaleString("ar-EG")}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <h2 className="mb-2 text-lg font-semibold text-foreground">المصادر</h2>
        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : sources.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-card py-12 text-center text-sm text-muted-foreground">
            <BookOpen className="mx-auto mb-2 h-8 w-8 text-muted-foreground/60" />
            لا توجد مراجع بعد. ابدأ بتحديث MedlinePlus (ملك عام) ثم أضف بروتوكولاتك وكتبك المرخّصة.
          </div>
        ) : (
          <ul className="grid gap-3 md:grid-cols-2">
            {sources.map((s) => (
              <li
                key={s.id}
                className={`rounded-xl border bg-card p-4 ${s.is_active ? "border-border" : "border-dashed border-border opacity-60"}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h3 className="truncate font-semibold text-foreground">{s.title}</h3>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {s.publisher ? `${s.publisher} · ` : ""}
                      {LICENSES.find((l) => l.value === s.license)?.label ?? s.license} ·{" "}
                      {s.language}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {s.chunk_count.toLocaleString("ar-EG")} مقطع
                      {s.specialties.length > 0 && ` · ${s.specialties.slice(0, 4).join("، ")}`}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <button
                      type="button"
                      onClick={() => toggleActive(s)}
                      title={s.is_active ? "إيقاف" : "تفعيل"}
                      className={`rounded-md border p-1.5 ${s.is_active ? "border-success/40 text-success" : "border-border text-muted-foreground"} hover:bg-accent`}
                    >
                      <Power className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => remove(s)}
                      title="حذف"
                      className="rounded-md border border-border p-1.5 text-destructive hover:bg-destructive/10"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </AdminShell>
  );
}
