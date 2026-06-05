import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

type BootstrapRole = "doctor" | "patient";

async function ensureRoleSpecificDetails(userId: string, role: BootstrapRole) {
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("id")
    .eq("user_id", userId)
    .single();

  if (!profile) return;

  if (role === "doctor") {
    const { data: doctorExisting } = await supabaseAdmin
      .from("doctor_details")
      .select("id")
      .eq("profile_id", profile.id)
      .maybeSingle();

    if (!doctorExisting) {
      await supabaseAdmin.from("doctor_details").insert({
        profile_id: profile.id,
        specialty: "General",
        is_verified: false,
        verification_status: "pending",
      });
    }
    return;
  }

  const { data: patientExisting } = await supabaseAdmin
    .from("patient_details")
    .select("id")
    .eq("profile_id", profile.id)
    .maybeSingle();

  if (!patientExisting) {
    await supabaseAdmin.from("patient_details").insert({
      profile_id: profile.id,
    });
  }
}

export const signUpUser = createServerFn({ method: "POST" })
  .inputValidator((data) =>
    z
      .object({
        email: z.string().email(),
        password: z.string().min(6),
        fullName: z.string().min(2),
        role: z.enum(["doctor", "patient"]),
        phone: z.string().optional(),
        city: z.string().optional(),
      })
      .parse(data)
  )
  .handler(async ({ data }) => {
    // Use admin.createUser (requires service role) to bypass email-confirmation
    // rate limits and create a verified user immediately. This is appropriate
    // for our flow because the form already collects the password directly.
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: { full_name: data.fullName },
    });

    if (authError || !authData.user) {
      throw new Error(authError?.message ?? "Sign up failed");
    }

    const userId = authData.user.id;

    // Create profile
    const { error: profileError } = await supabaseAdmin.from("profiles").insert({
      user_id: userId,
      full_name: data.fullName,
      city: data.city ?? null,
    });

    // Store phone privately in user_contacts
    if (data.phone) {
      await supabaseAdmin.from("user_contacts").insert({
        user_id: userId,
        phone: data.phone,
      });
    }

    if (profileError) {
      throw new Error(profileError.message);
    }

    // Assign role
    const { error: roleError } = await supabaseAdmin.from("user_roles").insert({
      user_id: userId,
      role: data.role,
    });

    if (roleError) {
      throw new Error(roleError.message);
    }

    // Create role-specific details
    await ensureRoleSpecificDetails(userId, data.role);

    return { success: true, userId };
  });

export const bootstrapOAuthUser = createServerFn({ method: "POST" })
  .inputValidator((data) =>
    z
      .object({
        userId: z.string().uuid(),
        role: z.enum(["doctor", "patient"]).optional(),
        email: z.string().email().optional(),
        fullName: z.string().optional(),
      })
      .parse(data)
  )
  .handler(async ({ data }) => {
    const { data: authUserResult, error: userError } = await supabaseAdmin.auth.admin.getUserById(data.userId);
    if (userError || !authUserResult.user) {
      throw new Error(userError?.message ?? "OAuth user not found");
    }

    const authUser = authUserResult.user;
    const finalRole: BootstrapRole = data.role ?? "patient";
    const resolvedName =
      data.fullName ??
      (typeof authUser.user_metadata?.full_name === "string" ? authUser.user_metadata.full_name : null) ??
      (typeof authUser.user_metadata?.name === "string" ? authUser.user_metadata.name : null) ??
      null;

    const { data: existingProfile } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("user_id", data.userId)
      .maybeSingle();

    if (!existingProfile) {
      const { error: profileInsertError } = await supabaseAdmin.from("profiles").insert({
        user_id: data.userId,
        full_name: resolvedName,
      });
      if (profileInsertError) throw new Error(profileInsertError.message);
    }

    const { data: existingRole } = await supabaseAdmin
      .from("user_roles")
      .select("id, role")
      .eq("user_id", data.userId)
      .limit(1)
      .maybeSingle();

    if (!existingRole) {
      const { error: roleInsertError } = await supabaseAdmin.from("user_roles").insert({
        user_id: data.userId,
        role: finalRole,
      });
      if (roleInsertError) throw new Error(roleInsertError.message);
    }

    const detailsRole: BootstrapRole =
      existingRole?.role === "doctor" || existingRole?.role === "patient"
        ? existingRole.role
        : finalRole;

    await ensureRoleSpecificDetails(data.userId, detailsRole);

    return { success: true };
  });

export const getUserProfile = createServerFn({ method: "POST" })
  .inputValidator((data) => z.object({ userId: z.string() }).parse(data))
  .handler(async ({ data }) => {
    const { data: profile, error } = await supabaseAdmin
      .from("profiles")
      .select("*")
      .eq("user_id", data.userId)
      .single();

    if (error) throw new Error(error.message);
    return { profile };
  });
