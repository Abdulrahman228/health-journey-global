import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Filter,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  X,
} from "lucide-react";
import type { EntityDef } from "@/lib/admin/registry";
import { ENUM_VALUES, type ColumnMeta } from "@/lib/admin/schema.generated";
import { adminDeleteRow, adminInsertRow, adminListRows, adminUpdateRow, type AdminRow } from "@/lib/admin/data";
import { EntityActions } from "@/components/admin/EntityActions";

type Row = AdminRow;
type JsonValueLike = AdminRow[string];
type Filter = { column: string; op: "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "ilike" | "is_null" | "not_null"; value?: string | number | boolean };

interface Props {
  entity: EntityDef;
  /** Filters applied on first render (e.g. ?id=… from global search). */
  initialFilters?: Filter[];
  /** Hide the create button (e.g. log tables). */
  canCreate?: boolean;
}

const OPS: Array<{ v: Filter["op"]; l: string }> = [
  { v: "eq", l: "=" },
  { v: "neq", l: "≠" },
  { v: "ilike", l: "يحتوي" },
  { v: "gt", l: ">" },
  { v: "gte", l: "≥" },
  { v: "lt", l: "<" },
  { v: "lte", l: "≤" },
  { v: "is_null", l: "فارغ" },
  { v: "not_null", l: "غير فارغ" },
];

const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

function formatCell(v: unknown, col: ColumnMeta): string {
  if (v === null || v === undefined) return "—";
  if (col.kind === "boolean") return v ? "نعم" : "لا";
  if (col.kind === "json" || typeof v === "object") return JSON.stringify(v).slice(0, 80);
  const s = String(v);
  if (ISO_RE.test(s)) {
    const d = new Date(s);
    if (!Number.isNaN(d.getTime())) return d.toLocaleString("ar-EG", { dateStyle: "medium", timeStyle: "short" });
  }
  return s.length > 90 ? s.slice(0, 90) + "…" : s;
}

function toCsv(rows: Row[], columns: string[]): string {
  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? "" : typeof v === "object" ? JSON.stringify(v) : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return "﻿" + [columns.join(","), ...rows.map((r) => columns.map((c) => esc(r[c])).join(","))].join("\n");
}

export function AdminTable({ entity, initialFilters = [], canCreate = true }: Props) {
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [q, setQ] = useState("");
  const [qInput, setQInput] = useState("");
  const [sort, setSort] = useState(entity.defaultSort);
  const [filters, setFilters] = useState<Filter[]>(initialFilters);
  const [showFilters, setShowFilters] = useState(initialFilters.length > 0);
  const [visible, setVisible] = useState<string[]>(entity.listColumns);
  const [drawer, setDrawer] = useState<{ mode: "edit" | "create"; row: Row } | null>(null);
  const [exporting, setExporting] = useState(false);

  // Reset when the entity changes (same component instance across routes).
  useEffect(() => {
    setPage(1);
    setQ("");
    setQInput("");
    setSort(entity.defaultSort);
    setFilters(initialFilters);
    setVisible(entity.listColumns);
    setDrawer(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entity.table]);

  useEffect(() => {
    const t = window.setTimeout(() => {
      setQ(qInput.trim());
      setPage(1);
    }, 350);
    return () => window.clearTimeout(t);
  }, [qInput]);

  const colByName = useMemo(() => new Map(entity.columns.map((c) => [c.name, c])), [entity]);

  const list = useQuery({
    queryKey: ["admin-rows", entity.table, page, pageSize, q, sort, filters],
    queryFn: () => adminListRows({ data: { entity: entity.table, page, pageSize, q: q || undefined, sort, filters } }),
    placeholderData: (prev) => prev,
  });

  const update = useMutation({
    mutationFn: (vars: { id: string | number; patch: Row }) => adminUpdateRow({ data: { entity: entity.table, id: vars.id, patch: vars.patch } }),
    onSuccess: () => {
      toast.success("تم الحفظ");
      setDrawer(null);
      qc.invalidateQueries({ queryKey: ["admin-rows", entity.table] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const insert = useMutation({
    mutationFn: (values: Row) => adminInsertRow({ data: { entity: entity.table, values } }),
    onSuccess: () => {
      toast.success("تمت الإضافة");
      setDrawer(null);
      qc.invalidateQueries({ queryKey: ["admin-rows", entity.table] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: (vars: { id: string | number; reason: string }) => adminDeleteRow({ data: { entity: entity.table, id: vars.id, reason: vars.reason } }),
    onSuccess: () => {
      toast.success("تم الحذف");
      setDrawer(null);
      qc.invalidateQueries({ queryKey: ["admin-rows", entity.table] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  async function exportCsv() {
    setExporting(true);
    try {
      const res = await adminListRows({ data: { entity: entity.table, page: 1, pageSize: 200, q: q || undefined, sort, filters, all: true } });
      const cols = entity.columns.map((c) => c.name);
      const blob = new Blob([toCsv(res.rows, cols)], { type: "text/csv;charset=utf-8" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = `${entity.table}-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(a.href);
      toast.success(`تم تصدير ${res.rows.length} صف`);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setExporting(false);
    }
  }

  function askDelete(row: Row) {
    const id = String(row[entity.pk]);
    const reason = window.prompt(`سبب حذف الصف ${id} من «${entity.label}» (يُسجَّل في سجل التدقيق):`);
    if (!reason || reason.trim().length < 3) return;
    const confirm = window.prompt(`اكتب "حذف" للتأكيد. هذا الإجراء لا يمكن التراجع عنه.`);
    if (confirm !== "حذف") return;
    remove.mutate({ id: row[entity.pk] as string | number, reason: reason.trim() });
  }

  const total = list.data?.total ?? 0;
  const rows = list.data?.rows ?? [];
  const pages = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="space-y-3" dir="rtl">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card p-3">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={qInput}
            onChange={(e) => setQInput(e.target.value)}
            placeholder={entity.searchColumns.length ? `ابحث في ${entity.searchColumns.join("، ")}` : "لا يوجد بحث نصي لهذا الجدول"}
            disabled={entity.searchColumns.length === 0}
            className="h-10 w-full rounded-lg border border-input bg-background ps-9 pe-3 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:opacity-60"
          />
        </div>
        <button type="button" onClick={() => setShowFilters((v) => !v)} className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-border bg-background px-3 text-sm hover:bg-accent">
          <Filter className="h-4 w-4" /> فلاتر {filters.length > 0 && <span className="rounded-full bg-primary px-1.5 text-xs text-primary-foreground">{filters.length}</span>}
        </button>
        <button type="button" onClick={() => list.refetch()} className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-border bg-background px-3 text-sm hover:bg-accent">
          <RefreshCw className={`h-4 w-4 ${list.isFetching ? "animate-spin" : ""}`} /> تحديث
        </button>
        <button type="button" onClick={exportCsv} disabled={exporting} className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-border bg-background px-3 text-sm hover:bg-accent disabled:opacity-60">
          {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} CSV
        </button>
        {canCreate && !entity.readOnly && (
          <button type="button" onClick={() => setDrawer({ mode: "create", row: {} })} className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground hover:bg-primary/90">
            <Plus className="h-4 w-4" /> إضافة
          </button>
        )}
        <span className="ms-auto text-xs text-muted-foreground">{total.toLocaleString("ar-EG")} صف</span>
      </div>

      {showFilters && (
        <div className="space-y-2 rounded-xl border border-border bg-card p-3">
          {filters.map((f, i) => (
            <div key={i} className="flex flex-wrap items-center gap-2">
              <select value={f.column} onChange={(e) => setFilters((fs) => fs.map((x, j) => (j === i ? { ...x, column: e.target.value } : x)))} className="h-9 rounded-lg border border-input bg-background px-2 text-sm">
                {entity.columns.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
              </select>
              <select value={f.op} onChange={(e) => setFilters((fs) => fs.map((x, j) => (j === i ? { ...x, op: e.target.value as Filter["op"] } : x)))} className="h-9 rounded-lg border border-input bg-background px-2 text-sm">
                {OPS.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
              </select>
              {!["is_null", "not_null"].includes(f.op) && (
                <input value={String(f.value ?? "")} onChange={(e) => setFilters((fs) => fs.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))} placeholder="القيمة" className="h-9 min-w-[160px] rounded-lg border border-input bg-background px-2 text-sm" />
              )}
              <button type="button" onClick={() => setFilters((fs) => fs.filter((_, j) => j !== i))} className="rounded-lg p-2 text-muted-foreground hover:bg-accent" aria-label="إزالة الفلتر"><X className="h-4 w-4" /></button>
            </div>
          ))}
          <div className="flex gap-2">
            <button type="button" onClick={() => setFilters((fs) => [...fs, { column: entity.columns[0]?.name ?? entity.pk, op: "eq", value: "" }])} className="rounded-lg border border-border px-3 py-1.5 text-sm hover:bg-accent">+ فلتر</button>
            <button type="button" onClick={() => setPage(1)} className="rounded-lg bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground">تطبيق</button>
            {filters.length > 0 && <button type="button" onClick={() => { setFilters([]); setPage(1); }} className="rounded-lg px-3 py-1.5 text-sm text-muted-foreground hover:bg-accent">مسح الكل</button>}
          </div>
        </div>
      )}

      {/* Column chooser */}
      <details className="rounded-xl border border-border bg-card px-3 py-2 text-sm">
        <summary className="cursor-pointer text-muted-foreground">الأعمدة المعروضة ({visible.length}/{entity.columns.length})</summary>
        <div className="mt-2 flex flex-wrap gap-2">
          {entity.columns.map((c) => (
            <label key={c.name} className="inline-flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-xs">
              <input type="checkbox" checked={visible.includes(c.name)} onChange={(e) => setVisible((v) => (e.target.checked ? [...v, c.name] : v.filter((x) => x !== c.name)))} />
              {c.name}
            </label>
          ))}
        </div>
      </details>

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="bg-surface text-xs text-muted-foreground">
            <tr>
              {visible.map((c) => (
                <th key={c} className="whitespace-nowrap px-3 py-2 text-start font-semibold">
                  <button type="button" onClick={() => setSort((s) => ({ column: c, dir: s.column === c && s.dir === "asc" ? "desc" : "asc" }))} className="inline-flex items-center gap-1 hover:text-foreground">
                    {c}
                    {sort.column === c && <span>{sort.dir === "asc" ? "↑" : "↓"}</span>}
                  </button>
                </th>
              ))}
              <th className="px-3 py-2 text-start font-semibold">إجراءات</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {list.isLoading ? (
              <tr><td colSpan={visible.length + 1} className="px-3 py-10 text-center text-muted-foreground"><Loader2 className="mx-auto h-5 w-5 animate-spin" /></td></tr>
            ) : list.isError ? (
              <tr><td colSpan={visible.length + 1} className="px-3 py-10 text-center text-destructive">{(list.error as Error).message}</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={visible.length + 1} className="px-3 py-10 text-center text-muted-foreground">لا توجد صفوف</td></tr>
            ) : (
              rows.map((r) => (
                <tr key={String(r[entity.pk])} className="hover:bg-accent/40">
                  {visible.map((c) => (
                    <td key={c} className="max-w-[320px] truncate whitespace-nowrap px-3 py-2 align-top text-foreground" title={r[c] == null ? "" : typeof r[c] === "object" ? JSON.stringify(r[c]) : String(r[c])}>
                      {formatCell(r[c], colByName.get(c) ?? { name: c, kind: "text", nullable: true, enum: null })}
                    </td>
                  ))}
                  <td className="whitespace-nowrap px-3 py-2">
                    <button type="button" onClick={() => setDrawer({ mode: "edit", row: r })} className="rounded-lg p-1.5 text-primary hover:bg-accent" aria-label="عرض / تعديل"><Pencil className="h-4 w-4" /></button>
                    {!entity.readOnly && (
                      <button type="button" onClick={() => askDelete(r)} className="rounded-lg p-1.5 text-destructive hover:bg-destructive/10" aria-label="حذف"><Trash2 className="h-4 w-4" /></button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <div className="flex items-center gap-2">
          <span className="text-muted-foreground">لكل صفحة</span>
          <select value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(1); }} className="h-8 rounded-lg border border-input bg-background px-2 text-sm">
            {[25, 50, 100, 200].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-1">
          <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className="rounded-lg border border-border p-1.5 disabled:opacity-40" aria-label="السابق"><ChevronRight className="h-4 w-4" /></button>
          <span className="px-2 text-muted-foreground">صفحة {page.toLocaleString("ar-EG")} من {pages.toLocaleString("ar-EG")}</span>
          <button type="button" disabled={page >= pages} onClick={() => setPage((p) => p + 1)} className="rounded-lg border border-border p-1.5 disabled:opacity-40" aria-label="التالي"><ChevronLeft className="h-4 w-4" /></button>
        </div>
      </div>

      {drawer && (
        <RowDrawer
          entity={entity}
          mode={drawer.mode}
          row={drawer.row}
          busy={update.isPending || insert.isPending || remove.isPending}
          onClose={() => setDrawer(null)}
          onSave={(patch) => (drawer.mode === "create" ? insert.mutate(patch) : update.mutate({ id: drawer.row[entity.pk] as string | number, patch }))}
          onDelete={drawer.mode === "edit" && !entity.readOnly ? () => askDelete(drawer.row) : undefined}
          onActionDone={() => {
            setDrawer(null);
            qc.invalidateQueries({ queryKey: ["admin-rows", entity.table] });
          }}
        />
      )}
    </div>
  );
}

function RowDrawer({ entity, mode, row, busy, onClose, onSave, onDelete, onActionDone }: {
  entity: EntityDef;
  mode: "edit" | "create";
  row: Row;
  busy: boolean;
  onClose: () => void;
  onSave: (patch: Row) => void;
  onDelete?: () => void;
  onActionDone: () => void;
}) {
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries(entity.columns.map((c) => [c.name, row[c.name] == null ? "" : typeof row[c.name] === "object" ? JSON.stringify(row[c.name], null, 2) : String(row[c.name])])),
  );
  const readOnly = new Set(entity.readOnlyColumns);

  function submit() {
    const patch: Record<string, JsonValueLike> = {};
    for (const c of entity.columns) {
      if (mode === "edit" && readOnly.has(c.name)) continue;
      if (mode === "create" && (c.name === entity.pk || ["created_at", "updated_at"].includes(c.name))) continue;
      const raw = values[c.name] ?? "";
      const original = row[c.name] == null ? "" : typeof row[c.name] === "object" ? JSON.stringify(row[c.name], null, 2) : String(row[c.name]);
      if (mode === "edit" && raw === original) continue;
      if (raw === "") {
        if (mode === "edit") patch[c.name] = null;
        continue;
      }
      if (c.kind === "number") {
        const n = Number(raw);
        if (!Number.isFinite(n)) return toast.error(`${c.name}: رقم غير صالح`);
        patch[c.name] = n;
      } else if (c.kind === "boolean") patch[c.name] = raw === "true";
      else if (c.kind === "json" || c.kind === "array") {
        try { patch[c.name] = JSON.parse(raw); } catch { return toast.error(`${c.name}: JSON غير صالح`); }
      } else patch[c.name] = raw;
    }
    if (Object.keys(patch).length === 0) return toast.info("لا توجد تغييرات");
    onSave(patch);
  }

  return (
    <div className="fixed inset-0 z-50 flex" dir="rtl">
      <button type="button" aria-label="إغلاق" onClick={onClose} className="flex-1 bg-black/40" />
      <aside className="flex h-full w-full max-w-xl flex-col overflow-hidden border-s border-border bg-card shadow-2xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <div>
            <h2 className="text-base font-bold text-foreground">{mode === "create" ? `إضافة إلى ${entity.label}` : entity.label}</h2>
            {mode === "edit" && <p className="text-xs text-muted-foreground">{entity.pk}: {String(row[entity.pk])}</p>}
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 hover:bg-accent" aria-label="إغلاق"><X className="h-5 w-5" /></button>
        </div>
        <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
          {mode === "edit" && (
            <div className="rounded-xl border border-border bg-surface p-3">
              <p className="mb-2 text-xs font-semibold text-muted-foreground">إجراءات</p>
              <EntityActions entity={entity} row={row} onDone={onActionDone} />
            </div>
          )}
          {entity.columns.map((c) => {
            const disabled = entity.readOnly || (mode === "edit" ? readOnly.has(c.name) : c.name === entity.pk && c.kind !== "text") ;
            const enumVals = c.enum ? ENUM_VALUES[c.enum] : null;
            const common = "w-full rounded-lg border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 disabled:bg-muted disabled:text-muted-foreground";
            return (
              <label key={c.name} className="block">
                <span className="mb-1 flex items-center gap-2 text-xs font-semibold text-muted-foreground">
                  {c.name} <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px]">{c.enum ?? c.kind}{c.nullable ? "" : " *"}</span>
                </span>
                {enumVals ? (
                  <select disabled={disabled} value={values[c.name]} onChange={(e) => setValues((v) => ({ ...v, [c.name]: e.target.value }))} className={common}>
                    <option value="">—</option>
                    {enumVals.map((x) => <option key={x} value={x}>{x}</option>)}
                  </select>
                ) : c.kind === "boolean" ? (
                  <select disabled={disabled} value={values[c.name]} onChange={(e) => setValues((v) => ({ ...v, [c.name]: e.target.value }))} className={common}>
                    <option value="">—</option>
                    <option value="true">نعم</option>
                    <option value="false">لا</option>
                  </select>
                ) : c.kind === "json" || c.kind === "array" || (values[c.name]?.length ?? 0) > 120 ? (
                  <textarea disabled={disabled} dir="auto" rows={Math.min(10, Math.max(2, (values[c.name] ?? "").split("\n").length))} value={values[c.name]} onChange={(e) => setValues((v) => ({ ...v, [c.name]: e.target.value }))} className={`${common} font-mono text-xs`} />
                ) : (
                  <input disabled={disabled} dir="auto" type={c.kind === "number" ? "number" : "text"} value={values[c.name]} onChange={(e) => setValues((v) => ({ ...v, [c.name]: e.target.value }))} className={common} />
                )}
              </label>
            );
          })}
        </div>
        <div className="flex items-center justify-between gap-2 border-t border-border px-5 py-3">
          {onDelete ? (
            <button type="button" onClick={onDelete} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg border border-destructive/40 px-3 py-2 text-sm text-destructive hover:bg-destructive/10 disabled:opacity-50">
              <Trash2 className="h-4 w-4" /> حذف
            </button>
          ) : <span />}
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="rounded-lg border border-border px-4 py-2 text-sm hover:bg-accent">إلغاء</button>
            {!entity.readOnly && (
              <button type="button" onClick={submit} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
                {busy && <Loader2 className="h-4 w-4 animate-spin" />} حفظ
              </button>
            )}
          </div>
        </div>
      </aside>
    </div>
  );
}
