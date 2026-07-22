import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { resolveAdmin, runAdminAction } from "./_kit";
import { AdminBanUserSchema } from "./_schemas";

// ~100 years in hours — GoTrue has no "permanent" flag, so we use a very long
// finite window when no duration is supplied.
const PERMANENT_BAN_HOURS = 876_000;

/**
 * Ban (or unban) a user.
 *
 * Enforcement is at the AUTH layer via GoTrue `ban_duration` (banned_until), so
 * existing sessions/tokens stop working immediately — not just app-side — and is
 * mirrored to `profiles.status` for UI/RLS filtering. Peer-protection: a regular
 * admin cannot ban another admin/super_admin.
 *
 * Note: server logic lives INSIDE this inline handler so the compiler strips it
 * from the client bundle (see _kit.ts).
 */
export const adminBanUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => AdminBanUserSchema.parse(raw))
  .handler(async ({ data, context }) => {
    const admin = await resolveAdmin(context.userId, "admin");
    return runAdminAction({
      admin,
      action: "user.ban",
      resourceType: "user",
      mutate: async () => {
        if (data.unban) {
          const { error } = await supabaseAdmin.auth.admin.updateUserById(data.targetUserId, {
            ban_duration: "none",
          });
          if (error) throw new Error(error.message);
          await supabaseAdmin
            .from("profiles")
            .update({ status: "active" })
            .eq("user_id", data.targetUserId);
          return {
            resourceId: data.targetUserId,
            summary: `unban: ${data.reason}`,
            metadata: { unban: true },
            result: { ok: true, status: "active" },
          };
        }

        // Peer-protection: block banning privileged accounts.
        const { data: targetRoles, error: rolesErr } = await supabaseAdmin
          .from("user_roles")
          .select("role")
          .eq("user_id", data.targetUserId);
        if (rolesErr) throw new Error(rolesErr.message);
        const isPrivileged = (targetRoles ?? []).some(
          (r) => r.role === "admin" || r.role === "super_admin",
        );
        if (isPrivileged) throw new Error("Cannot ban an admin or super_admin.");

        const hours = data.durationHours ?? PERMANENT_BAN_HOURS;
        const { error } = await supabaseAdmin.auth.admin.updateUserById(data.targetUserId, {
          ban_duration: `${hours}h`,
        });
        if (error) throw new Error(error.message);
        await supabaseAdmin
          .from("profiles")
          .update({ status: "banned" })
          .eq("user_id", data.targetUserId);

        return {
          resourceId: data.targetUserId,
          summary: data.reason,
          metadata: { durationHours: data.durationHours ?? null, permanent: !data.durationHours },
          result: { ok: true, status: "banned" },
        };
      },
    });
  });
