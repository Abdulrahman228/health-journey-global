import { getRequest } from "@tanstack/react-start/server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { Database } from "@/integrations/supabase/types";

type Json = Database["public"]["Tables"]["audit_logs"]["Insert"]["metadata"];

// -----------------------------------------------------------------------------
// Admin Kit — shared foundation for every admin server function.
//
// IMPORTANT (code-splitting): TanStack Start strips server code by statically
// recognizing `createServerFn().handler(inlineFn)`. So each admin action defines
// its createServerFn with the built-in `requireSupabaseAuth` middleware and an
// INLINE handler, and calls resolveAdmin()/runAdminAction() from INSIDE that
// handler. Do NOT introduce a custom role middleware via a factory — that path
// drags client.server (the service-role client) into the client bundle. Keeping
// every supabaseAdmin call inside the inline handler lets the compiler tree-shake
// it out of the client (this mirrors the known-clean adminCreateDoctor).
// -----------------------------------------------------------------------------

/** Context resolved by resolveAdmin and consumed by every admin mutation. */
export interface AdminCtx {
  actorId: string;
  ip: string | null;
  ua: string | null;
}

// --- Role gates (single source of truth; also imported by admin.functions.ts) ---
export async function assertAdmin(userId: string): Promise<void> {
  const { data, error } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .in("role", ["admin", "super_admin"]);
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) throw new Error("Forbidden: admin role required");
}

export async function assertSuperAdmin(userId: string): Promise<void> {
  const { data, error } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "super_admin")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Forbidden: super_admin role required");
}

// --- Client IP / UA (reuses the rate-limiter's header convention) ------------
function clientMeta(): { ip: string | null; ua: string | null } {
  const req = getRequest();
  const ip =
    req?.headers.get("cf-connecting-ip") ??
    req?.headers.get("x-real-ip") ??
    req?.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    null;
  const ua = req?.headers.get("user-agent") ?? null;
  return { ip, ua };
}

/**
 * Gate on role and build the admin context (actor + ip/ua). Call this as the
 * first line of an admin handler, passing the JWT-derived context.userId. Logs
 * denied attempts for forensics, then rethrows.
 */
export async function resolveAdmin(
  userId: string,
  level: "admin" | "super_admin",
): Promise<AdminCtx> {
  const { ip, ua } = clientMeta();
  const admin: AdminCtx = { actorId: userId, ip, ua };
  try {
    if (level === "super_admin") await assertSuperAdmin(userId);
    else await assertAdmin(userId);
  } catch (err) {
    await writeAudit({
      actor: admin,
      action: "admin.denied",
      resourceType: "admin",
      metadata: { level, message: err instanceof Error ? err.message : String(err) },
    });
    throw err;
  }
  return admin;
}

// --- Audit writer ------------------------------------------------------------
export interface AuditEntry {
  actor: AdminCtx;
  action: string;
  resourceType: string;
  resourceId?: string | null;
  metadata?: Record<string, unknown> | null;
}

/**
 * Insert one audit_logs row. Never throws: an audit failure must not mask the
 * action's outcome, but it is logged loudly so it can be alerted on.
 */
export async function writeAudit(entry: AuditEntry): Promise<void> {
  const { error } = await supabaseAdmin.from("audit_logs").insert({
    user_id: entry.actor.actorId,
    action: entry.action,
    resource_type: entry.resourceType,
    resource_id: entry.resourceId ?? null,
    ip_address: entry.actor.ip,
    user_agent: entry.actor.ua,
    metadata: (entry.metadata ?? null) as unknown as Json,
  });
  if (error) {
    console.error(`[audit] failed to persist "${entry.action}":`, error.message);
  }
}

// --- runAdminAction: audited mutation runner ---------------------------------
/**
 * Runs a mutation inside an admin handler and writes the audit row afterwards.
 * `mutate` MUST return an audit descriptor + result, so the audit can't be
 * forgotten — enforced by the type system, written here.
 */
export async function runAdminAction<R>(opts: {
  admin: AdminCtx;
  action: string;
  resourceType: string;
  mutate: () => Promise<{
    resourceId?: string | null;
    summary?: string;
    metadata?: Record<string, unknown>;
    result: R;
  }>;
}): Promise<R> {
  const { resourceId, summary, metadata, result } = await opts.mutate();
  await writeAudit({
    actor: opts.admin,
    action: opts.action,
    resourceType: opts.resourceType,
    resourceId,
    metadata: { summary, ...(metadata ?? {}) },
  });
  return result;
}
