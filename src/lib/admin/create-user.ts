import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { ensureRoleSpecificDetails } from "@/lib/auth.signup.server";
import { resolveAdmin, runAdminAction } from "./_kit";

export const AdminCreateUserSchema = z.object({
  email: z.string().trim().email().max(160),
  password: z.string().min(8).max(72),
  fullName: z.string().trim().min(2).max(120),
  role: z.enum(["patient", "doctor", "lab", "pharmacy"]),
  phone: z.string().trim().max(20).optional(),
  /** Doctors only: canonical specialties.name_ar (defaults to طب عام). */
  specialty: z.string().trim().max(80).optional(),
  reason: z.string().trim().min(3).max(300),
});

/**
 * Create a confirmed user from the admin panel (no e-mail round trip) with the
 * same rows the public sign-up writes: auth user, profile, private contact,
 * role, and the doctor/patient details shell. Used for onboarding a doctor on
 * their behalf and for QA accounts. Admin/super_admin roles are NOT creatable
 * here — use the roles action (super_admin) afterwards.
 */
export const adminCreateUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => AdminCreateUserSchema.parse(raw))
  .handler(async ({ data, context }) => {
    const admin = await resolveAdmin(context.userId, "admin");
    return runAdminAction({
      admin,
      action: "user.create",
      resourceType: "user",
      mutate: async () => {
        const email = data.email.toLowerCase();
        const { data: created, error: authErr } = await supabaseAdmin.auth.admin.createUser({
          email,
          password: data.password,
          email_confirm: true,
          user_metadata: { full_name: data.fullName, created_by_admin: true },
        });
        if (authErr) throw new Error(authErr.message);
        const userId = created.user?.id;
        if (!userId) throw new Error("auth user not returned");

        const rollback = async () => {
          await supabaseAdmin.from("user_roles").delete().eq("user_id", userId);
          await supabaseAdmin.from("user_contacts").delete().eq("user_id", userId);
          await supabaseAdmin.from("profiles").delete().eq("user_id", userId);
          await supabaseAdmin.auth.admin.deleteUser(userId);
        };

        try {
          const { data: profile, error: profErr } = await supabaseAdmin
            .from("profiles")
            .insert({ user_id: userId, full_name: data.fullName, ...(data.phone ? { phone: data.phone } : {}) } as never)
            .select("id")
            .single();
          if (profErr) throw new Error(profErr.message);
          if (data.phone) {
            await supabaseAdmin.from("user_contacts").upsert({ user_id: userId, phone: data.phone } as never, { onConflict: "user_id" });
          }
          const { error: roleErr } = await supabaseAdmin.from("user_roles").insert({ user_id: userId, role: data.role } as never);
          if (roleErr) throw new Error(roleErr.message);
          if (data.role === "doctor" || data.role === "patient") {
            await ensureRoleSpecificDetails(userId, data.role);
            if (data.role === "doctor" && data.specialty) {
              await supabaseAdmin.from("doctor_details").update({ specialty: data.specialty } as never).eq("profile_id", profile.id);
            }
          }
          return {
            resourceId: userId,
            summary: `${data.reason} — ${data.role} ${email}`,
            metadata: { email, role: data.role, profile_id: profile.id },
            result: { ok: true as const, userId, profileId: profile.id, email },
          };
        } catch (e) {
          await rollback();
          throw e;
        }
      },
    });
  });
