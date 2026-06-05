/**
 * Admin server functions for the error_logs telemetry table.
 * Only callers with role='admin' in user_roles may read.
 */

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { z } from "zod";

// `error_logs` is created by an out-of-band migration and is not part of the
// generated `Database` type. Use an untyped accessor for this table only.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sbAny = supabaseAdmin as any;

async function assertAdmin(userId: string): Promise<void> {
  const { data, error } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden: admin role required");
}

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

/**
 * List recent error logs grouped by fingerprint (top 100 unique groups).
 */
export const adminListErrorGroups = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((x: unknown) =>
    z
      .object({
        userId: z.string().uuid(),
        sinceHours: z.number().int().min(1).max(720).default(24),
        level: z
          .enum(["debug", "info", "warn", "error", "fatal", "all"])
          .default("all"),
      })
      .parse(x),
  )
  .handler(async ({ data }): Promise<ErrorLogGroup[]> => {
    await assertAdmin(data.userId);
    const since = new Date(Date.now() - data.sinceHours * 3600_000).toISOString();

    let query = sbAny
      .from("error_logs")
      .select("id, created_at, source, level, message, fingerprint")
      .gte("created_at", since)
      .order("created_at", { ascending: false })
      .limit(2000);
    if (data.level !== "all") query = query.eq("level", data.level);

    const { data: rows, error } = (await query) as {
      data: Array<{
        id: string;
        created_at: string;
        source: ErrorLogRow["source"];
        level: ErrorLogRow["level"];
        message: string;
        fingerprint: string | null;
      }> | null;
      error: { message: string } | null;
    };
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
          level: r.level,
          source: r.source,
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
  .inputValidator((x: unknown) =>
    z.object({ userId: z.string().uuid(), id: z.string().uuid() }).parse(x),
  )
  .handler(async ({ data }): Promise<ErrorLogRow | null> => {
    await assertAdmin(data.userId);
    const { data: row, error } = (await sbAny
      .from("error_logs")
      .select("*")
      .eq("id", data.id)
      .maybeSingle()) as {
      data:
        | {
            id: string;
            created_at: string;
            source: ErrorLogRow["source"];
            level: ErrorLogRow["level"];
            message: string;
            stack: string | null;
            url: string | null;
            user_agent: string | null;
            user_id: string | null;
            context: Record<string, unknown> | null;
            fingerprint: string | null;
          }
        | null;
      error: { message: string } | null;
    };
    if (error) throw new Error(error.message);
    if (!row) return null;
    // Stringify context to keep the return type strictly serializable.
    const contextStr = JSON.stringify(row.context ?? {});
    return {
      id: row.id,
      createdAt: row.created_at,
      source: row.source,
      level: row.level,
      message: row.message,
      stack: row.stack ?? null,
      url: row.url ?? null,
      userAgent: row.user_agent ?? null,
      userId: row.user_id ?? null,
      context: contextStr,
      fingerprint: row.fingerprint ?? null,
    };
  });
