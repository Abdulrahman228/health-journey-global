/**
 * Authorization helpers for server functions.
 * Use inside handlers that take `userId` as input to enforce that the
 * input userId matches the authenticated user (from requireSupabaseAuth).
 *
 * Combine with: `.middleware([requireSupabaseAuth])`
 *   handler(({ data, context }) => { assertSelf(context.userId, data.userId); ... })
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export function assertSelf(contextUserId: string, dataUserId: string): void {
  if (!contextUserId || !dataUserId || contextUserId !== dataUserId) {
    throw new Error("Unauthorized");
  }
}

export async function isAdmin(userId: string): Promise<boolean> {
  const { data } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  return Boolean(data);
}

export async function assertSelfOrAdmin(
  contextUserId: string,
  dataUserId: string,
): Promise<void> {
  if (contextUserId && dataUserId && contextUserId === dataUserId) return;
  if (await isAdmin(contextUserId)) return;
  throw new Error("Unauthorized");
}
