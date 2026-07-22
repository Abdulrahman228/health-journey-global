import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AdminShell } from "@/components/admin/AdminNav";
import { useAuth } from "@/hooks/useAuth";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { importSeededDoctors } from "@/lib/seed.functions";
import { Loader2, ShieldAlert, UploadCloud, Info } from "lucide-react";

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
    </AdminShell>
  );
}
