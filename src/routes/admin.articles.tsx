import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
// The generated Database types don't yet include the `articles` table, so we
// cast for the local CRUD operations. RLS still enforces admin-only access.
const sb = supabase as unknown as {
  from: (t: string) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    [k: string]: any;
  };
};
import { useAuth } from "@/hooks/useAuth";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { AdminShell } from "@/components/admin/AdminNav";
import { EmptyState } from "@/components/admin/EmptyState";
import { pingIndexNowForArticle } from "@/lib/indexnow.functions";
import { marked } from "marked";
import { sanitizeHtml } from "@/lib/sanitize";
import { autoLinkSpecialties } from "@/lib/auto-link";
import { Loader2, Plus, Save, Trash2, Eye, FileText, Search } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/articles")({
  head: () => ({
    meta: [
      { title: "إدارة المقالات — لوحة الأدمن | طبيبي" },
      { name: "description", content: "إنشاء وتحرير ونشر المقالات الطبية." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: AdminArticlesPage,
});

interface ArticleRow {
  id: string;
  slug: string;
  language: "ar" | "en";
  title: string;
  excerpt: string | null;
  body_md: string;
  cover_image: string | null;
  specialty_slug: string | null;
  author_name: string | null;
  reading_minutes: number | null;
  is_published: boolean;
  published_at: string | null;
  updated_at: string;
}

const SPECIALTY_OPTIONS = [
  { slug: "", name: "— بدون تخصص —" },
  { slug: "general", name: "طب عام" },
  { slug: "cardiology", name: "أمراض القلب" },
  { slug: "dermatology", name: "الجلدية" },
  { slug: "pediatrics", name: "الأطفال" },
  { slug: "psychiatry", name: "الطب النفسي" },
  { slug: "orthopedics", name: "العظام" },
  { slug: "gynecology", name: "النساء والتوليد" },
  { slug: "internal", name: "الباطنة" },
  { slug: "dentistry", name: "الأسنان" },
  { slug: "ophthalmology", name: "العيون" },
  { slug: "ent", name: "أنف وأذن وحنجرة" },
  { slug: "neurology", name: "الأعصاب" },
];

const EMPTY_DRAFT: {
  id: string;
  slug: string;
  language: "ar" | "en";
  title: string;
  excerpt: string;
  body_md: string;
  cover_image: string;
  specialty_slug: string;
  author_name: string;
  reading_minutes: number;
  is_published: boolean;
} = {
  id: "",
  slug: "",
  language: "ar",
  title: "",
  excerpt: "",
  body_md: "",
  cover_image: "",
  specialty_slug: "",
  author_name: "",
  reading_minutes: 5,
  is_published: false,
};

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\u0600-\u06FF]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function estimateMinutes(md: string): number {
  const words = md.replace(/\s+/g, " ").trim().split(" ").length;
  return Math.max(1, Math.round(words / 200));
}

function AdminArticlesPage() {
  const { user, isLoading: authLoading } = useAuth();
  const { isAdmin, isLoading: roleLoading } = useIsAdmin();
  const navigate = useNavigate();
  const [rows, setRows] = useState<ArticleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "draft" | "published">("all");
  const [draft, setDraft] = useState<typeof EMPTY_DRAFT>(EMPTY_DRAFT);
  const [saving, setSaving] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await sb
      .from("articles")
      .select(
        "id,slug,language,title,excerpt,body_md,cover_image,specialty_slug,author_name,reading_minutes,is_published,published_at,updated_at",
      )
      .order("updated_at", { ascending: false });
    if (error) {
      toast.error("تعذّر تحميل المقالات");
      setLoading(false);
      return;
    }
    setRows(((data ?? []) as ArticleRow[]));
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

  const previewHtml = useMemo(() => {
    if (!draft.body_md) return "";
    const raw = marked.parse(draft.body_md) as string;
    const safe = sanitizeHtml(raw, { ADD_ATTR: ["target", "rel"] });
    return autoLinkSpecialties(safe, draft.specialty_slug || null);
  }, [draft.body_md, draft.specialty_slug]);

  const filtered = useMemo(() => {
    return rows.filter((r) => {
      if (filter === "draft" && r.is_published) return false;
      if (filter === "published" && !r.is_published) return false;
      if (search) {
        const q = search.toLowerCase();
        if (
          !r.title.toLowerCase().includes(q) &&
          !r.slug.toLowerCase().includes(q)
        )
          return false;
      }
      return true;
    });
  }, [rows, filter, search]);

  const startNew = () => {
    setDraft(EMPTY_DRAFT);
    setShowPreview(false);
    window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
  };

  const startEdit = (r: ArticleRow) => {
    setDraft({
      id: r.id,
      slug: r.slug,
      language: r.language,
      title: r.title,
      excerpt: r.excerpt ?? "",
      body_md: r.body_md,
      cover_image: r.cover_image ?? "",
      specialty_slug: r.specialty_slug ?? "",
      author_name: r.author_name ?? "",
      reading_minutes: r.reading_minutes ?? 5,
      is_published: r.is_published,
    });
    setShowPreview(false);
    window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" });
  };

  const save = async (publish: boolean) => {
    if (!draft.title.trim() || !draft.body_md.trim()) {
      toast.error("العنوان والمحتوى مطلوبان");
      return;
    }
    const slug = draft.slug.trim() || slugify(draft.title);
    const wasPublished = rows.find((r) => r.id === draft.id)?.is_published ?? false;
    const willPublish = publish ? true : draft.is_published;
    const minutes = draft.reading_minutes || estimateMinutes(draft.body_md);

    const payload = {
      slug,
      language: draft.language,
      title: draft.title.trim(),
      excerpt: draft.excerpt.trim() || null,
      body_md: draft.body_md,
      cover_image: draft.cover_image.trim() || null,
      specialty_slug: draft.specialty_slug || null,
      author_name: draft.author_name.trim() || null,
      reading_minutes: minutes,
      is_published: willPublish,
      published_at: willPublish && !wasPublished ? new Date().toISOString() : undefined,
    };

    setSaving(true);
    const op = draft.id
      ? sb.from("articles").update(payload).eq("id", draft.id)
      : sb.from("articles").insert(payload);
    const { error } = await op;
    if (error) {
      toast.error(error.message.includes("duplicate") ? "الـ slug موجود بالفعل" : "تعذّر الحفظ");
      setSaving(false);
      return;
    }
    toast.success(willPublish ? "تم النشر" : "تم الحفظ كمسودّة");

    // Ping IndexNow only when freshly publishing (Rank Math module 3.3).
    if (willPublish && !wasPublished) {
      pingIndexNowForArticle({
        data: { slug, specialtySlug: draft.specialty_slug || null },
      })
        .then((r) => {
          if (r.ok) console.info(`[IndexNow] submitted ${r.submitted} URLs`);
        })
        .catch((e) => console.warn("[IndexNow] ping failed:", e));
    }

    setDraft(EMPTY_DRAFT);
    setSaving(false);
    await load();
  };

  const remove = async (r: ArticleRow) => {
    if (!confirm(`حذف المقال "${r.title}" نهائياً؟`)) return;
    const { error } = await sb.from("articles").delete().eq("id", r.id);
    if (error) {
      toast.error("تعذّر الحذف");
      return;
    }
    toast.success("تم الحذف");
    await load();
  };

  if (authLoading || roleLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }
  if (!isAdmin) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-20 text-center">
        <h1 className="text-2xl font-bold">صلاحيات غير كافية</h1>
        <p className="mt-3 text-muted-foreground">هذه الصفحة مخصّصة للمسؤولين فقط.</p>
      </div>
    );
  }

  return (
    <AdminShell>
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-3xl font-bold tracking-tight">
            <FileText className="h-7 w-7 text-primary" />
            إدارة المقالات
          </h1>
          <p className="mt-2 text-muted-foreground">
            اكتب وانشر مقالات SEO تستهدف الكلمات المفتاحية طويلة الذيل في كل تخصص.
          </p>
        </div>
        <button
          type="button"
          onClick={startNew}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground shadow hover:opacity-90"
        >
          <Plus className="h-4 w-4" />
          مقال جديد
        </button>
      </header>

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="pointer-events-none absolute end-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="بحث بالعنوان أو الـ slug"
            className="w-full rounded-lg border border-border bg-background px-4 py-2 text-sm pe-10 outline-none focus:border-primary"
          />
        </div>
        <div className="flex rounded-lg border border-border bg-card p-1 text-sm">
          {(["all", "draft", "published"] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={`rounded-md px-3 py-1.5 font-medium transition-colors ${
                filter === f ? "bg-primary text-primary-foreground" : "text-foreground hover:bg-accent"
              }`}
            >
              {f === "all" ? "الكل" : f === "draft" ? "مسودّات" : "منشورة"}
              <span className="ms-1 text-xs opacity-70">
                ({f === "all" ? rows.length : rows.filter((r) => (f === "published") === r.is_published).length})
              </span>
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState icon={FileText} description="لا توجد مقالات مطابقة." />
      ) : (
        <ul className="grid gap-3">
          {filtered.map((r) => (
            <li
              key={r.id}
              className="flex flex-wrap items-center gap-4 rounded-xl border border-border bg-card p-4 transition-shadow hover:shadow-sm"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="truncate font-semibold text-foreground">{r.title}</h3>
                  {r.is_published ? (
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
                      منشور
                    </span>
                  ) : (
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                      مسودّة
                    </span>
                  )}
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                    {r.language === "ar" ? "AR" : "EN"}
                  </span>
                </div>
                <p className="mt-1 truncate text-sm text-muted-foreground">
                  /articles/{r.slug}
                  {r.specialty_slug ? ` · ${r.specialty_slug}` : ""}
                  {" · "}
                  {new Date(r.updated_at).toLocaleDateString("ar-EG")}
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                {r.is_published ? (
                  <a
                    href={`/articles/${r.slug}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 rounded-lg border border-border bg-background px-3 py-1.5 text-sm hover:bg-accent"
                  >
                    <Eye className="h-4 w-4" />
                    عرض
                  </a>
                ) : null}
                <button
                  type="button"
                  onClick={() => startEdit(r)}
                  className="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:opacity-90"
                >
                  تحرير
                </button>
                <button
                  type="button"
                  onClick={() => remove(r)}
                  aria-label="حذف"
                  className="rounded-lg border border-rose-300 bg-rose-50 p-1.5 text-rose-700 hover:bg-rose-100 dark:border-rose-800 dark:bg-rose-950 dark:text-rose-300"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* Editor */}
      <section className="mt-12 rounded-2xl border border-border bg-card p-6 shadow-sm">
        <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-bold">{draft.id ? "تحرير المقال" : "مقال جديد"}</h2>
          <button
            type="button"
            onClick={() => setShowPreview((v) => !v)}
            className="inline-flex items-center gap-1 rounded-lg border border-border bg-background px-3 py-1.5 text-sm hover:bg-accent"
          >
            <Eye className="h-4 w-4" />
            {showPreview ? "إخفاء المعاينة" : "معاينة"}
          </button>
        </header>

        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-4">
            <label className="block">
              <span className="text-sm font-medium">العنوان *</span>
              <input
                type="text"
                value={draft.title}
                onChange={(e) =>
                  setDraft((d) => ({
                    ...d,
                    title: e.target.value,
                    slug: d.slug || slugify(e.target.value),
                  }))
                }
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 outline-none focus:border-primary"
                placeholder="مثال: أعراض ارتفاع ضغط الدم ومتى تطلب الطبيب"
              />
            </label>

            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="text-sm font-medium">Slug</span>
                <input
                  type="text"
                  value={draft.slug}
                  onChange={(e) => setDraft((d) => ({ ...d, slug: slugify(e.target.value) }))}
                  className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 font-mono text-sm outline-none focus:border-primary"
                  placeholder="auto-from-title"
                />
              </label>
              <label className="block">
                <span className="text-sm font-medium">اللغة</span>
                <select
                  value={draft.language}
                  onChange={(e) => setDraft((d) => ({ ...d, language: e.target.value as "ar" | "en" }))}
                  className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 outline-none focus:border-primary"
                >
                  <option value="ar">العربية</option>
                  <option value="en">English</option>
                </select>
              </label>
            </div>

            <label className="block">
              <span className="text-sm font-medium">الوصف القصير (Meta description)</span>
              <textarea
                value={draft.excerpt}
                onChange={(e) => setDraft((d) => ({ ...d, excerpt: e.target.value }))}
                rows={2}
                maxLength={160}
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 outline-none focus:border-primary"
                placeholder="حد أقصى 160 حرف للحصول على snippet كامل في نتائج Google"
              />
              <span className="mt-1 block text-xs text-muted-foreground">
                {draft.excerpt.length}/160
              </span>
            </label>

            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="text-sm font-medium">التخصص</span>
                <select
                  value={draft.specialty_slug}
                  onChange={(e) => setDraft((d) => ({ ...d, specialty_slug: e.target.value }))}
                  className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 outline-none focus:border-primary"
                >
                  {SPECIALTY_OPTIONS.map((s) => (
                    <option key={s.slug} value={s.slug}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="text-sm font-medium">دقائق القراءة</span>
                <input
                  type="number"
                  min={1}
                  max={60}
                  value={draft.reading_minutes}
                  onChange={(e) =>
                    setDraft((d) => ({ ...d, reading_minutes: Number(e.target.value) || 5 }))
                  }
                  className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 outline-none focus:border-primary"
                />
              </label>
            </div>

            <label className="block">
              <span className="text-sm font-medium">اسم الكاتب</span>
              <input
                type="text"
                value={draft.author_name}
                onChange={(e) => setDraft((d) => ({ ...d, author_name: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 outline-none focus:border-primary"
                placeholder="د. أحمد محمد"
              />
            </label>

            <label className="block">
              <span className="text-sm font-medium">رابط صورة الغلاف</span>
              <input
                type="url"
                value={draft.cover_image}
                onChange={(e) => setDraft((d) => ({ ...d, cover_image: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 font-mono text-sm outline-none focus:border-primary"
                placeholder="https://..."
              />
            </label>
          </div>

          <div>
            <label className="block">
              <span className="text-sm font-medium">المحتوى (Markdown) *</span>
              <textarea
                value={draft.body_md}
                onChange={(e) => setDraft((d) => ({ ...d, body_md: e.target.value }))}
                rows={20}
                className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 font-mono text-sm outline-none focus:border-primary"
                placeholder={`## مقدمة\n\nاكتب المقال بصيغة Markdown:\n\n### عنوان فرعي\n\n- نقطة 1\n- نقطة 2\n\n[رابط داخلي](/specialty/cardiology)`}
              />
              <span className="mt-1 block text-xs text-muted-foreground">
                ~{estimateMinutes(draft.body_md)} دقيقة قراءة تلقائياً ·{" "}
                {draft.body_md.split(/\s+/).filter(Boolean).length} كلمة
              </span>
            </label>
          </div>
        </div>

        {showPreview && previewHtml ? (
          <div className="mt-6 rounded-xl border border-border bg-background p-6">
            <h3 className="mb-3 text-sm font-semibold text-muted-foreground">معاينة:</h3>
            <article
              className="prose prose-lg max-w-none rtl:prose-headings:text-right prose-a:text-primary"
              dangerouslySetInnerHTML={{ __html: previewHtml }}
            />
          </div>
        ) : null}

        <div className="mt-6 flex flex-wrap items-center justify-end gap-3 border-t border-border pt-5">
          {draft.id ? (
            <button
              type="button"
              onClick={() => setDraft(EMPTY_DRAFT)}
              className="rounded-lg border border-border bg-background px-4 py-2 text-sm hover:bg-accent"
            >
              إلغاء
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => save(false)}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-4 py-2 text-sm font-semibold hover:bg-accent disabled:opacity-60"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            حفظ كمسودّة
          </button>
          <button
            type="button"
            onClick={() => save(true)}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2 text-sm font-semibold text-primary-foreground shadow hover:opacity-90 disabled:opacity-60"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            نشر الآن
          </button>
        </div>
      </section>
    </AdminShell>
  );
}
