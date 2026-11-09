// Admin data engine — generic, audited list / read / update / insert / delete
// for every entity in registry.ts. The service-role client is used INSIDE the
// inline handlers only (see _kit.ts on code-splitting), and every write goes
// through runAdminAction so audit_logs always has the before/after state.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { resolveAdmin, runAdminAction, type AuditMetadata } from "./_kit";
import { getEntity, type EntityDef } from "./registry";

const MAX_PAGE_SIZE = 200;
const EXPORT_LIMIT = 5000;

/** JSON-only row shape: server functions must return serializable values. */
export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
export type AdminRow = { [column: string]: JsonValue };

const FilterSchema = z.object({
  column: z.string().min(1).max(64),
  op: z.enum(["eq", "neq", "gt", "gte", "lt", "lte", "ilike", "is_null", "not_null"]),
  value: z.union([z.string(), z.number(), z.boolean()]).optional(),
});

export const AdminListRowsSchema = z.object({
  entity: z.string().min(1).max(64),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(MAX_PAGE_SIZE).default(25),
  q: z.string().max(200).optional(),
  sort: z.object({ column: z.string().min(1).max(64), dir: z.enum(["asc", "desc"]) }).optional(),
  filters: z.array(FilterSchema).max(10).default([]),
  /** When true, returns up to EXPORT_LIMIT rows (CSV export). */
  all: z.boolean().default(false),
});

export const AdminRowRefSchema = z.object({
  entity: z.string().min(1).max(64),
  id: z.union([z.string(), z.number()]),
});

export const AdminUpdateRowSchema = AdminRowRefSchema.extend({
  patch: z.record(z.string(), z.unknown()),
  reason: z.string().max(300).optional(),
});

export const AdminInsertRowSchema = z.object({
  entity: z.string().min(1).max(64),
  values: z.record(z.string(), z.unknown()),
});

export const AdminDeleteRowSchema = AdminRowRefSchema.extend({
  reason: z.string().min(3).max(300),
});

function requireEntity(name: string): EntityDef {
  const e = getEntity(name);
  if (!e) throw new Error(`Unknown entity: ${name}`);
  return e;
}

function assertColumns(e: EntityDef, names: string[]): void {
  const known = new Set(e.columns.map((c) => c.name));
  for (const n of names) if (!known.has(n)) throw new Error(`Unknown column ${n} on ${e.table}`);
}

/** Keep only editable columns; reject anything read-only. */
function sanitizePatch(e: EntityDef, patch: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const readOnly = new Set(e.readOnlyColumns);
  for (const [k, v] of Object.entries(patch)) {
    if (readOnly.has(k)) throw new Error(`Column ${k} is read-only`);
    out[k] = v === "" ? null : v;
  }
  assertColumns(e, Object.keys(out));
  if (Object.keys(out).length === 0) throw new Error("Nothing to update");
  return out;
}

// Untyped table access is intentional here: the entity name was validated
// against the registry, which mirrors the generated Database types.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const table = (name: string) => supabaseAdmin.from(name as any) as any;

export const adminListRows = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => AdminListRowsSchema.parse(raw))
  .handler(async ({ data, context }) => {
    await resolveAdmin(context.userId, "admin");
    const e = requireEntity(data.entity);
    const sort = data.sort ?? e.defaultSort;
    assertColumns(e, [sort.column, ...data.filters.map((f) => f.column)]);

    let query = table(e.table).select("*", { count: "exact" });
    for (const f of data.filters) {
      if (f.op === "is_null") query = query.is(f.column, null);
      else if (f.op === "not_null") query = query.not(f.column, "is", null);
      else if (f.op === "ilike") query = query.ilike(f.column, `%${String(f.value ?? "")}%`);
      else query = query[f.op](f.column, f.value);
    }
    const q = data.q?.trim();
    if (q && e.searchColumns.length) {
      const ors = e.searchColumns.map((c) => `${c}.ilike.%${q.replace(/[%,()]/g, " ")}%`).join(",");
      query = query.or(ors);
    }
    query = query.order(sort.column, { ascending: sort.dir === "asc", nullsFirst: false });
    if (data.all) query = query.limit(EXPORT_LIMIT);
    else {
      const from = (data.page - 1) * data.pageSize;
      query = query.range(from, from + data.pageSize - 1);
    }
    const { data: rows, error, count } = await query;
    if (error) throw new Error(error.message);
    return { rows: (rows ?? []) as AdminRow[], total: (count ?? 0) as number, entity: e.table };
  });

export const adminGetRow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => AdminRowRefSchema.parse(raw))
  .handler(async ({ data, context }) => {
    await resolveAdmin(context.userId, "admin");
    const e = requireEntity(data.entity);
    const { data: row, error } = await table(e.table).select("*").eq(e.pk, data.id).maybeSingle();
    if (error) throw new Error(error.message);
    return { row: (row ?? null) as AdminRow | null };
  });

export const adminUpdateRow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => AdminUpdateRowSchema.parse(raw))
  .handler(async ({ data, context }) => {
    const e = requireEntity(data.entity);
    if (e.readOnly) throw new Error(`${e.table} is read-only`);
    const admin = await resolveAdmin(context.userId, e.editLevel);
    const patch = sanitizePatch(e, data.patch);
    return runAdminAction({
      admin,
      action: `data.update.${e.table}`,
      resourceType: e.table,
      mutate: async () => {
        const { data: before, error: readErr } = await table(e.table).select("*").eq(e.pk, data.id).maybeSingle();
        if (readErr) throw new Error(readErr.message);
        if (!before) throw new Error("Row not found");
        const { data: after, error } = await table(e.table).update(patch).eq(e.pk, data.id).select("*").maybeSingle();
        if (error) throw new Error(error.message);
        const changed: AuditMetadata = {};
        for (const k of Object.keys(patch)) changed[k] = { from: before[k] ?? null, to: after?.[k] ?? null } as never;
        return {
          resourceId: String(data.id),
          summary: data.reason ?? `updated ${Object.keys(patch).join(", ")}`,
          metadata: { changed },
          result: { row: (after ?? null) as AdminRow | null },
        };
      },
    });
  });

export const adminInsertRow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => AdminInsertRowSchema.parse(raw))
  .handler(async ({ data, context }) => {
    const e = requireEntity(data.entity);
    if (e.readOnly) throw new Error(`${e.table} is read-only`);
    const admin = await resolveAdmin(context.userId, e.editLevel);
    const values: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(data.values)) if (v !== "" && v !== undefined) values[k] = v;
    assertColumns(e, Object.keys(values));
    return runAdminAction({
      admin,
      action: `data.insert.${e.table}`,
      resourceType: e.table,
      mutate: async () => {
        const { data: row, error } = await table(e.table).insert(values).select("*").maybeSingle();
        if (error) throw new Error(error.message);
        return {
          resourceId: row ? String(row[e.pk]) : null,
          summary: `inserted ${e.table}`,
          metadata: { values: values as never },
          result: { row: (row ?? null) as AdminRow | null },
        };
      },
    });
  });

export const adminDeleteRow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => AdminDeleteRowSchema.parse(raw))
  .handler(async ({ data, context }) => {
    const e = requireEntity(data.entity);
    if (e.readOnly) throw new Error(`${e.table} is read-only`);
    const admin = await resolveAdmin(context.userId, e.deleteLevel);
    return runAdminAction({
      admin,
      action: `data.delete.${e.table}`,
      resourceType: e.table,
      mutate: async () => {
        const { data: before, error: readErr } = await table(e.table).select("*").eq(e.pk, data.id).maybeSingle();
        if (readErr) throw new Error(readErr.message);
        if (!before) throw new Error("Row not found");
        const { error } = await table(e.table).delete().eq(e.pk, data.id);
        if (error) throw new Error(error.message);
        return {
          resourceId: String(data.id),
          summary: data.reason,
          metadata: { deleted: before as never },
          result: { ok: true as const },
        };
      },
    });
  });

/** Counts per entity for the admin "all data" overview. */
export const adminEntityCounts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ entities: z.array(z.string().max(64)).max(100) }).parse(raw))
  .handler(async ({ data, context }) => {
    await resolveAdmin(context.userId, "admin");
    const counts: Record<string, number> = {};
    await Promise.all(
      data.entities.map(async (name) => {
        const e = getEntity(name);
        if (!e) return;
        const { count } = await table(e.table).select(e.pk, { count: "exact", head: true });
        counts[name] = count ?? 0;
      }),
    );
    return { counts };
  });
