/**
 * Admin server functions for the error_logs telemetry table.
 * Only callers with role admin/super_admin in user_roles may read.
 */

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { z } from "zod";
// Shared gate: reads ALL admin rows (a user may hold admin + super_admin) and
// is keyed on the JWT-derived context.userId — never a client-supplied id.
import { assertAdmin } from "./admin/_kit";

export type ErrorLogRow = {
  id: string;
  createdAt: string;
  source: "client" | "server" | "sw";
  level: "debug" | "info" | "warn" | "error" | "fatal";
  message: string;
  stack: string | null;
  url: string | null;
  userAgent: string | null;
  userId: string | null;
  /** JSON-stringified context. Caller does `JSON.parse(context)`. */
  context: string;
  fingerprint: string | null;
};

export type ErrorLogGroup = {
  fingerprint: string;
  count: number;
  lastSeen: string;
  level: ErrorLogRow["level"];
  source: ErrorLogRow["source"];
  message: string;
  sampleId: string;
};

// DB columns are `text` guarded by CHECK constraints (error_logs_level_check /
// error_logs_source_check); narrow them to the domain unions without casts.
const LEVELS: readonly ErrorLogRow["level"][] = ["debug", "info", "warn", "error", "fatal"];
const SOURCES: readonly ErrorLogRow["source"][] = ["client", "server", "sw"];
function toLevel(v: string): ErrorLogRow["level"] {
  return LEVELS.find((l) => l === v) ?? "error";
}
function toSource(v: string): ErrorLogRow["source"] {
  return SOURCES.find((s) => s === v) ?? "client";
}

/**
 * List recent error logs grouped by fingerprint (top 100 unique groups).
 */
export const adminListErrorGroups = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((x: unknown) =>
    z
      .object({
        sinceHours: z.number().int().min(1).max(720).default(24),
        level: z.enum(["debug", "info", "warn", "error", "fatal", "all"]).default("all"),
      })
      .parse(x),
  )
  .handler(async ({ data, context }): Promise<ErrorLogGroup[]> => {
    await assertAdmin(context.userId);
    const since = new Date(Date.now() - data.sinceHours * 3600_000).toISOString();

    let query = supabaseAdmin
      .from("error_logs")
      .select("id, created_at, source, level, message, fingerprint")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(2000);
    if (data.level !== "all") query = query.eq("level", data.level);

    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);

    const map = new Map<string, ErrorLogGroup>();
    for (const r of rows ?? []) {
      const fp = r.fingerprint ?? "unfingerprinted";
      const existing = map.get(fp);
      if (!existing) {
        map.set(fp, {
          fingerprint: fp,
          count: 1,
          lastSeen: r.created_at,
          level: toLevel(r.level),
          source: toSource(r.source),
          message: r.message,
          sampleId: r.id,
        });
      } else {
        existing.count += 1;
      }
    }
    return Array.from(map.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 100);
  });

/**
 * Fetch a single error log row by id (for drill-down view).
 */
export const adminGetErrorLog = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((x: unknown) => z.object({ id: z.string().uuid() }).parse(x))
  .handler(async ({ data, context }): Promise<ErrorLogRow | null> => {
    await assertAdmin(context.userId);
    const { data: row, error } = await supabaseAdmin
      .from("error_logs")
      .select("id, created_at, source, level, message, stack, url, user_agent, user_id, context, fingerprint")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) return null;
    // Stringify context to keep the return type strictly serializable.
    const contextStr = JSON.stringify(row.context ?? {});
    return {
      id: row.id,
      createdAt: row.created_at,
      source: toSource(row.source),
      level: toLevel(row.level),
      message: row.message,
      stack: row.stack ?? null,
      url: row.url ?? null,
      userAgent: row.user_agent ?? null,
      userId: row.user_id ?? null,
      context: contextStr,
      fingerprint: row.fingerprint ?? null,
    };
  });
