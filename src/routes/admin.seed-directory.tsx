import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AdminShell } from "@/components/admin/AdminNav";
import { useAuth } from "@/hooks/useAuth";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { importSeededDoctors, adminListSeededDoctors } from "@/lib/seed.functions";
import { Ban, Loader2, RefreshCw, ShieldAlert, UploadCloud, UserCheck, Info } from "lucide-react";

export const Route = createFileRoute("/admin/seed-directory")({
  head: () => ({
    meta: [
      { title: "استيراد دليل الأطباء — Admin | طبيبي" },
      { name: "description", content: "استيراد بذور الأطباء غير المُفعّلين من مصادر مشروعة." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: SeedDirectoryPage,
});

type SourceKind = "syndicate" | "referral" | "public_listing";

type SeedRowInput = {
  full_name: string;
  specialty?: string;
  phone?: string;
  address?: string;
  city?: string;
  governorate?: string;
  lat?: number;
  lng?: number;
  external_rating?: number;
  external_review_cnt?: number;
  source: SourceKind;
  source_ref?: string;
};

const NUM_FIELDS = new Set(["lat", "lng", "external_rating", "external_review_cnt"]);

/** Parse pasted JSON array OR simple CSV (header row) into seed rows. */
function parseInput(text: string, defaultSource: SourceKind): SeedRowInput[] {
  const t = text.trim();
  if (!t) return [];

  const normalize = (o: Record<string, unknown>): SeedRowInput | null => {
    const name = String(o.full_name ?? "").trim();
    if (!name) return null;
    const row: Record<string, unknown> = {
      full_name: name,
      source: (o.source as SourceKind) || defaultSource,
    };
    for (const key of ["specialty", "phone", "address", "city", "governorate", "source_ref"]) {
      const v = o[key];
      if (v != null && String(v).trim() !== "") row[key] = String(v).trim();
    }
    for (const key of NUM_FIELDS) {
      const v = o[key];
      if (v != null && String(v).trim() !== "") {
        const n = key === "external_review_cnt" ? parseInt(String(v), 10) : parseFloat(String(v));
        if (Number.isFinite(n)) row[key] = n;
      }
    }
    return row as SeedRowInput;
  };

  if (t.startsWith("[")) {
    const arr = JSON.parse(t);
    return (Array.isArray(arr) ? arr : []).map(normalize).filter(Boolean) as SeedRowInput[];
  }

  // CSV (note: does not handle commas inside quoted fields — keep values comma-free)
  const lines = t.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((h) => h.trim());
  return lines
    .slice(1)
    .map((line) => {
      const cells = line.split(",");
      const obj: Record<string, string> = {};
      headers.forEach((h, i) => (obj[h] = (cells[i] ?? "").trim()));
      return normalize(obj);
    })
    .filter(Boolean) as SeedRowInput[];
}

function SeedDirectoryPage() {
  const { user, isLoading: authLoading } = useAuth();
  const { isAdmin, isLoading: roleLoading } = useIsAdmin();
  const navigate = useNavigate();
  const runImport = useServerFn(importSeededDoctors);

  const [source, setSource] = useState<SourceKind>("public_listing");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ received: number; inserted: number; skipped: number } | null>(null);

  if (authLoading || roleLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }
  if (!user) {
    navigate({ to: "/login" });
    return null;
  }
  if (!isAdmin) {
    return (
      <div className="mx-auto max-w-md px-4 py-24 text-center" dir="rtl">
        <ShieldAlert className="mx-auto h-12 w-12 text-destructive" />
        <h1 className="mt-3 text-xl font-bold">صلاحيات غير كافية</h1>
      </div>
    );
  }

  const doImport = async () => {
    let rows: SeedRowInput[];
    try {
      rows = parseInput(text, source);
    } catch (e) {
      toast.error("تنسيق غير صالح: " + (e as Error).message);
      return;
    }
    if (rows.length === 0) {
      toast.error("لا توجد صفوف صالحة (تأكد من وجود عمود full_name).");
      return;
    }
    if (rows.length > 5000) {
      toast.error("الحد الأقصى 5000 صف لكل دفعة.");
      return;
    }
    setBusy(true);
    setResult(null);
    try {
      const res = await runImport({ data: { rows } });
      setResult(res);
      toast.success(`تم: أُضيف ${res.inserted}، تخطّى ${res.skipped} (مكرر/موجود).`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AdminShell>
      <header className="mb-6">
        <h1 className="text-3xl font-bold">استيراد دليل الأطباء</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          استيراد بذور الأطباء غير المُفعّلين لعرضهم كبطاقات «فعّل ملفك». إدراج جديد فقط — لا يُلمس أي صف مُلغى أو موجود.
        </p>
      </header>

      <div className="mb-5 flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">
        <Info className="mt-0.5 h-5 w-5 shrink-0" />
        <div>
          <b>مصادر مشروعة فقط</b> — نقابة الأطباء، إحالات زملاء، أو القوائم العامة للعيادات. ممنوع الكشط من فيسبوك/لينكدإن/الخرائط.
          خيار الإلغاء (opt-out) محفوظ ومُحترَم تلقائيًا في المُرسِل والدليل.
        </div>
      </div>

      <div className="space-y-4 rounded-xl border border-border bg-card p-5">
        <div className="flex items-center gap-3">
          <label className="text-sm font-medium">المصدر:</label>
          <select
            className="rounded-lg border border-border bg-background px-3 py-2 text-sm"
            value={source}
            onChange={(e) => setSource(e.target.value as SourceKind)}
          >
            <option value="public_listing">قوائم عامة</option>
            <option value="syndicate">نقابة الأطباء</option>
            <option value="referral">إحالة زميل</option>
          </select>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">
            الصق CSV (بترويسة) أو JSON array
          </label>
          <textarea
            dir="ltr"
            className="h-56 w-full rounded-lg border border-border bg-background p-3 font-mono text-xs"
            placeholder={`full_name,specialty,phone,city,source_ref\nد. أحمد سمير,أطفال,+201000000000,مدينة نصر,SYN-12345\n\n— أو —\n[{"full_name":"د. أحمد سمير","specialty":"أطفال","phone":"+201000000000","city":"مدينة نصر"}]`}
            value={text}
            onChange={(e) => setText(e.target.value)}
          />
          <p className="mt-1 text-xs text-muted-foreground">
            الأعمدة المدعومة: full_name (إلزامي)، specialty، phone، address، city، governorate، lat، lng،
            external_rating، external_review_cnt، source_ref. (مفتاح منع التكرار = المصدر + source_ref، أو الهاتف.)
          </p>
        </div>

        <button
          onClick={doImport}
          disabled={busy || !text.trim()}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground disabled:opacity-50"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
          استيراد
        </button>

        {result && (
          <div className="rounded-lg border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-900">
            استُلم <b>{result.received}</b> · أُضيف <b>{result.inserted}</b> · تخطّى <b>{result.skipped}</b> (مكرر/موجود).
          </div>
        )}
      </div>

      <SeededListing refreshKey={result?.inserted ?? 0} />
    </AdminShell>
  );
}

type SeededRow = {
  id: string;
  fullName: string;
  specialty: string | null;
  city: string | null;
  phoneHint: string | null;
  source: string;
  status: string;
  reason: string | null;
  importedAt: string;
  claimedAt: string | null;
  optedOutAt: string | null;
};

const STATUS_TABS: { key: "all" | "unclaimed" | "claimed" | "suppressed"; label: string }[] = [
  { key: "all", label: "الكل" },
  { key: "unclaimed", label: "غير مُفعّل" },
  { key: "claimed", label: "مُفعّل ✓" },
  { key: "suppressed", label: "مرفوض" },
];

const SOURCE_LABEL: Record<string, string> = {
  syndicate: "نقابة",
  referral: "إحالة",
  public_listing: "قائمة عامة",
  gmaps: "خرائط",
};

/** The current directory: who was imported, who activated, who declined + why. */
function SeededListing({ refreshKey }: { refreshKey: number }) {
  const list = useServerFn(adminListSeededDoctors);
  const [status, setStatus] = useState<"all" | "unclaimed" | "claimed" | "suppressed">("all");
  const [rows, setRows] = useState<SeededRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(
    async (s: "all" | "unclaimed" | "claimed" | "suppressed") => {
      setLoading(true);
      try {
        const res = await list({ data: { status: s } });
        setRows(res.rows as SeededRow[]);
      } catch (e) {
        toast.error((e as Error).message);
      } finally {
        setLoading(false);
      }
    },
    [list],
  );

  useEffect(() => {
    void load(status);
  }, [load, status, refreshKey]);

  const fmt = (d: string | null) => (d ? new Date(d).toLocaleDateString("ar-EG") : "—");

  return (
    <section className="mt-8">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-xl font-bold">الدليل الحالي ({rows.length})</h2>
        <div className="flex items-center gap-2">
          <div className="flex flex-wrap gap-1.5">
            {STATUS_TABS.map((tab) => (
              <button
                key={tab.key}
                type="button"
                onClick={() => setStatus(tab.key)}
                className={
                  "rounded-full px-3 py-1 text-xs font-medium transition " +
                  (status === tab.key
                    ? "bg-primary text-primary-foreground"
                    : "border border-border text-muted-foreground hover:bg-muted")
                }
              >
                {tab.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => load(status)}
            className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-xs text-muted-foreground hover:bg-muted"
          >
            <RefreshCw className="h-3.5 w-3.5" /> تحديث
          </button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="border-b border-border bg-muted/40 text-xs text-muted-foreground">
            <tr>
              <th className="px-4 py-3 text-right font-medium">الطبيب</th>
              <th className="px-4 py-3 text-right font-medium">التخصص</th>
              <th className="px-4 py-3 text-right font-medium">المدينة</th>
              <th className="px-4 py-3 text-right font-medium">المصدر</th>
              <th className="px-4 py-3 text-right font-medium">الحالة</th>
              <th className="px-4 py-3 text-right font-medium">التفاصيل</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                  <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-muted-foreground">
                  لا توجد بيانات في هذا التصنيف بعد.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id} className="border-b border-border/60 last:border-0">
                  <td className="px-4 py-3">
                    <div className="font-medium text-foreground">{r.fullName}</div>
                    {r.phoneHint && <div className="text-xs text-muted-foreground" dir="ltr">{r.phoneHint}</div>}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{r.specialty ?? "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground">{r.city ?? "—"}</td>
                  <td className="px-4 py-3 text-muted-foreground">{SOURCE_LABEL[r.source] ?? r.source}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={r.status} />
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {r.status === "claimed" ? (
                      <span className="text-emerald-600">فُعّل في {fmt(r.claimedAt)}</span>
                    ) : r.status === "suppressed" ? (
                      <span className="text-destructive">
                        رفض في {fmt(r.optedOutAt)}
                        {r.reason ? ` — ${r.reason}` : ""}
                      </span>
                    ) : (
                      <span>أُضيف في {fmt(r.importedAt)}</span>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function StatusBadge({ status }: { status: string }) {
  if (status === "claimed") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-medium text-emerald-700">
        <UserCheck className="h-3 w-3" /> مُفعّل
      </span>
    );
  }
  if (status === "suppressed") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive">
        <Ban className="h-3 w-3" /> مرفوض
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
      غير مُفعّل
    </span>
  );
}
