import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { resolveAdmin, runAdminAction } from "./_kit";
import {
  AdminDeleteUserSchema,
  AdminPasswordResetSchema,
  AdminSetUserRolesSchema,
  AdminUserImpactSchema,
} from "./_schemas";

const SITE_URL = (process.env.VITE_SITE_URL || "https://mytabibi.com").replace(/\/+$/, "");
const PERMANENT_BAN_HOURS = 876_000;

/** Replace the role set of a user. super_admin only; the founder is protected by a DB trigger. */
export const adminSetUserRoles = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => AdminSetUserRolesSchema.parse(raw))
  .handler(async ({ data, context }) => {
    const admin = await resolveAdmin(context.userId, "super_admin");
    return runAdminAction({
      admin,
      action: "user.roles",
      resourceType: "user",
      mutate: async () => {
        const { data: current, error } = await supabaseAdmin
          .from("user_roles")
          .select("role")
          .eq("user_id", data.targetUserId);
        if (error) throw new Error(error.message);
        const have = new Set((current ?? []).map((r) => r.role as string));
        const want = new Set<string>(data.roles);
        const toAdd = [...want].filter((r) => !have.has(r));
        const toRemove = [...have].filter((r) => !want.has(r));
        if (toAdd.length) {
          const { error: insErr } = await supabaseAdmin
            .from("user_roles")
            .insert(toAdd.map((role) => ({ user_id: data.targetUserId, role })) as never);
          if (insErr) throw new Error(insErr.message);
        }
        if (toRemove.length) {
          const { error: delErr } = await supabaseAdmin
            .from("user_roles")
            .delete()
            .eq("user_id", data.targetUserId)
            .in("role", toRemove as never);
          if (delErr) throw new Error(delErr.message);
        }
        return {
          resourceId: data.targetUserId,
          summary: data.reason,
          metadata: { from: [...have], to: [...want] },
          result: { ok: true as const, roles: [...want] },
        };
      },
    });
  });

/** Password-reset link (token_hash form) e-mailed to the user and returned to the admin. */
export const adminSendPasswordReset = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => AdminPasswordResetSchema.parse(raw))
  .handler(async ({ data, context }) => {
    const admin = await resolveAdmin(context.userId, "admin");
    return runAdminAction({
      admin,
      action: "user.password_reset",
      resourceType: "user",
      mutate: async () => {
        const { data: userRes, error: userErr } = await supabaseAdmin.auth.admin.getUserById(data.targetUserId);
        if (userErr) throw new Error(userErr.message);
        const email = userRes.user?.email;
        if (!email) throw new Error("User has no e-mail (phone-only account)");

        const { data: linkData, error: linkErr } = await supabaseAdmin.auth.admin.generateLink({
          type: "recovery",
          email,
          options: { redirectTo: `${SITE_URL}/reset-password` },
        });
        if (linkErr || !linkData?.properties) throw new Error(linkErr?.message ?? "link generation failed");
        const link = linkData.properties.hashed_token
          ? `${SITE_URL}/reset-password?token_hash=${encodeURIComponent(linkData.properties.hashed_token)}&type=recovery`
          : linkData.properties.action_link;

        let emailed = false;
        try {
          const { buildPasswordResetEmail } = await import("@/lib/email/templates/password-reset");
          const { sendEmail, isEmailEnabled } = await import("@/lib/email/sender");
          if (isEmailEnabled()) {
            const { data: profile } = await supabaseAdmin
              .from("profiles")
              .select("full_name")
              .eq("user_id", data.targetUserId)
              .maybeSingle();
            const { subject, html } = buildPasswordResetEmail({ resetUrl: link, recipientName: profile?.full_name ?? null });
            const sent = await sendEmail({ to: email, subject, html });
            emailed = !!(sent as { ok?: boolean }).ok;
          }
        } catch (e) {
          console.error("[admin] reset mail failed", e);
        }
        return {
          resourceId: data.targetUserId,
          summary: `password reset link for ${email}${emailed ? " (e-mailed)" : " (link only)"}`,
          metadata: { emailed },
          result: { ok: true as const, link, emailed, email },
        };
      },
    });
  });

/** Everything that references this user — shown before a delete. */
export const adminUserImpact = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => AdminUserImpactSchema.parse(raw))
  .handler(async ({ data, context }) => {
    await resolveAdmin(context.userId, "admin");
    const { data: profiles } = await supabaseAdmin.from("profiles").select("id").eq("user_id", data.targetUserId);
    const profileIds = (profiles ?? []).map((p) => p.id);
    const { data: docs } = profileIds.length
      ? await supabaseAdmin.from("doctor_details").select("id").in("profile_id", profileIds)
      : { data: [] as { id: string }[] };
    const doctorIds = (docs ?? []).map((d) => d.id);
    const count = async (table: string, column: string, ids: string[]) => {
      if (!ids.length) return 0;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { count: c } = await (supabaseAdmin.from(table as any) as any).select("*", { count: "exact", head: true }).in(column, ids);
      return (c as number | null) ?? 0;
    };
    const impact = {
      profiles: profileIds.length,
      doctor_profiles: doctorIds.length,
      appointments_as_patient: await count("appointments", "patient_id", profileIds),
      appointments_as_doctor: await count("appointments", "doctor_id", doctorIds),
      medical_records: await count("medical_records", "patient_profile_id", profileIds),
      prescriptions: await count("prescriptions", "patient_profile_id", profileIds),
      posts: await count("posts", "author_profile_id", profileIds),
      reviews: await count("reviews", "patient_id", profileIds),
      clinics: await count("clinics", "doctor_id", doctorIds),
      transactions: await count("doctor_transactions", "doctor_details_id", doctorIds),
      subscriptions: await count("subscriptions", "user_id", [data.targetUserId]),
    };
    return { impact };
  });

/**
 * Delete a user.
 *  soft: permanent ban + anonymised profile (name/phone/avatar/push token cleared,
 *        status 'deleted'), doctor hidden from every list; clinical records kept.
 *  hard: auth user removed (cascades), profiles removed (details, records referencing
 *        the profile cascade). super_admin only, irreversible.
 */
export const adminDeleteUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => AdminDeleteUserSchema.parse(raw))
  .handler(async ({ data, context }) => {
    const admin = await resolveAdmin(context.userId, data.mode === "hard" ? "super_admin" : "admin");
    return runAdminAction({
      admin,
      action: data.mode === "hard" ? "user.delete_hard" : "user.delete_soft",
      resourceType: "user",
      mutate: async () => {
        if (data.targetUserId === context.userId) throw new Error("You cannot delete your own account here.");
        const { data: roles } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", data.targetUserId);
        const privileged = (roles ?? []).some((r) => r.role === "admin" || r.role === "super_admin");
        if (privileged) throw new Error("Remove the admin role first (super_admin → roles).");

        if (data.mode === "soft") {
          const { error: banErr } = await supabaseAdmin.auth.admin.updateUserById(data.targetUserId, {
            ban_duration: `${PERMANENT_BAN_HOURS}h`,
          });
          if (banErr) throw new Error(banErr.message);
          const { data: profiles, error: profErr } = await supabaseAdmin
            .from("profiles")
            .update({ status: "deleted", full_name: "حساب محذوف", phone: null, phone_e164: null, avatar_url: null, fcm_token: null, public_bio: null } as never)
            .eq("user_id", data.targetUserId)
            .select("id");
          if (profErr) throw new Error(profErr.message);
          const ids = (profiles ?? []).map((p) => p.id);
          if (ids.length) {
            await supabaseAdmin
              .from("doctor_details")
              .update({ is_verified: false, telemedicine_enabled: false } as never)
              .in("profile_id", ids);
          }
          return {
            resourceId: data.targetUserId,
            summary: data.reason,
            metadata: { mode: "soft", profiles: ids },
            result: { ok: true as const, mode: data.mode as "soft" | "hard" },
          };
        }

        const { error: profDel } = await supabaseAdmin.from("profiles").delete().eq("user_id", data.targetUserId);
        if (profDel) throw new Error(profDel.message);
        await supabaseAdmin.from("user_roles").delete().eq("user_id", data.targetUserId);
        const { error: authErr } = await supabaseAdmin.auth.admin.deleteUser(data.targetUserId);
        if (authErr) throw new Error(authErr.message);
        return {
          resourceId: data.targetUserId,
          summary: data.reason,
          metadata: { mode: "hard" },
          result: { ok: true as const, mode: data.mode as "soft" | "hard" },
        };
      },
    });
  });
