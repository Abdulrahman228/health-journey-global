import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { signupRateLimit, passwordResetRateLimit } from "./_rate-limit";
import { assertSelf } from "./_authz";
import { normalizePhone } from "./phone";

type BootstrapRole = "doctor" | "patient";

const SITE_URL = (process.env.VITE_SITE_URL || "https://mytabibi.com").replace(/\/+$/, "");

// Strong-password rule: min 10 chars, at least one letter and one digit
// (kept ASCII-friendly to avoid breaking Arabic/Latin keyboards).
const strongPassword = z
  .string()
  .min(10, "Password must be at least 10 characters")
  .max(128)
  .regex(/[A-Za-z]/, "Password must contain a letter")
  .regex(/[0-9]/, "Password must contain a digit");

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
  // 5 sign-ups per hour per IP keeps account-creation abuse / spam in check.
  .middleware([signupRateLimit])
  .inputValidator((data) =>
    z
      .object({
        email: z.string().email(),
        password: strongPassword,
        fullName: z.string().min(2),
        role: z.enum(["doctor", "patient"]),
        phone: z.string().optional(),
        city: z.string().optional(),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const email = data.email.trim().toLowerCase();
    const phone = normalizePhone(data.phone) ?? (data.phone?.trim() || null);

    // E-mail confirmation (2026-11-03): when transactional e-mail is configured
    // the account is created UNCONFIRMED and gets our own Arabic confirmation
    // mail; it cannot sign in before the link is opened. This closes the
    // Google-linking takeover that auto-confirmed addresses allowed. Without
    // RESEND_API_KEY we keep the legacy auto-confirm so sign-up never breaks.
    const canSendEmail = Boolean(process.env.RESEND_API_KEY);

    let userId: string;
    let requiresEmailConfirmation = false;

    if (canSendEmail) {
      const { data: linkData, error: linkErr } = await supabaseAdmin.auth.admin.generateLink({
        type: "signup",
        email,
        password: data.password,
        options: {
          data: { full_name: data.fullName },
          redirectTo: `${SITE_URL}/auth/callback`,
        },
      });
      if (linkErr || !linkData?.user || !linkData.properties?.action_link) {
        throw new Error(linkErr?.message ?? "Sign up failed");
      }
      userId = linkData.user.id;
      requiresEmailConfirmation = true;

      const { buildConfirmEmail } = await import("@/lib/email/templates/confirm-email");
      const { sendEmail } = await import("@/lib/email/sender");
      const { subject, html } = buildConfirmEmail({
        confirmUrl: linkData.properties.action_link,
        recipientName: data.fullName,
      });
      await sendEmail({
        to: email,
        subject,
        html,
        tags: [{ name: "category", value: "confirm_email" }],
      });
    } else {
      const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
        email,
        password: data.password,
        email_confirm: true,
        user_metadata: { full_name: data.fullName },
      });
      if (authError || !authData.user) {
        throw new Error(authError?.message ?? "Sign up failed");
      }
      userId = authData.user.id;
    }

    // Create profile
    const { error: profileError } = await supabaseAdmin.from("profiles").insert({
      user_id: userId,
      full_name: data.fullName,
      city: data.city ?? null,
      ...(phone ? { phone } : {}),
    });

    // Store phone privately in user_contacts
    if (phone) {
      await supabaseAdmin
        .from("user_contacts")
        .upsert({ user_id: userId, phone }, { onConflict: "user_id" });
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

    return { success: true, userId, requiresEmailConfirmation };
  });

// =============================================================================
// Phone-first sign-up / sign-in (2026-11-03).
//
// The browser runs: signInWithOtp({ phone }) → verifyOtp({ phone, token }).
// Once the session exists it calls this to create the profile / role / details
// for a NEW user (idempotent for returning users) and — for patients — to
// adopt any doctor-created profile that carries the same verified number, so
// the person inherits their visits, prescriptions and results automatically.
// =============================================================================
export const bootstrapPhoneUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        role: z.enum(["doctor", "patient"]).optional(),
        fullName: z.string().trim().min(2).max(120).optional(),
        city: z.string().trim().max(80).optional(),
      })
      .parse(data ?? {}),
  )
  .handler(async ({ data, context }) => {
    const userId = context.userId;
    const { data: userRes, error: userErr } = await supabaseAdmin.auth.admin.getUserById(userId);
    const authUser = userRes?.user;
    if (userErr || !authUser) throw new Error(userErr?.message ?? "User not found");
    if (!authUser.phone || !authUser.phone_confirmed_at) {
      throw new Error("phone_not_verified");
    }
    const phone = normalizePhone(
      authUser.phone.startsWith("+") ? authUser.phone : `+${authUser.phone}`,
    );
    if (!phone) throw new Error("invalid_phone");

    const metaName =
      typeof authUser.user_metadata?.full_name === "string"
        ? authUser.user_metadata.full_name
        : null;
    const fullName = data.fullName ?? metaName ?? null;

    // Profile (create once; never overwrite an existing name with nothing).
    const { data: existingProfile } = await supabaseAdmin
      .from("profiles")
      .select("id, full_name")
      .eq("user_id", userId)
      .maybeSingle();
    let isNew = false;
    if (!existingProfile) {
      isNew = true;
      const { error: insErr } = await supabaseAdmin.from("profiles").insert({
        user_id: userId,
        full_name: fullName,
        city: data.city || null,
        phone,
      });
      if (insErr) throw new Error(insErr.message);
    } else if (fullName && !existingProfile.full_name) {
      await supabaseAdmin
        .from("profiles")
        .update({ full_name: fullName })
        .eq("id", existingProfile.id);
    }
    await supabaseAdmin
      .from("user_contacts")
      .upsert({ user_id: userId, phone }, { onConflict: "user_id" });

    // Role (first one wins; later calls never change it).
    const { data: existingRole } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .limit(1)
      .maybeSingle();
    const role: BootstrapRole =
      existingRole?.role === "doctor" || existingRole?.role === "patient"
        ? existingRole.role
        : (data.role ?? "patient");
    if (!existingRole) {
      const { error: roleErr } = await supabaseAdmin
        .from("user_roles")
        .insert({ user_id: userId, role });
      if (roleErr) throw new Error(roleErr.message);
    }
    await ensureRoleSpecificDetails(userId, role);

    // Patients: inherit the profile a doctor registered under this number.
    let adopted = false;
    let doctors: string[] = [];
    if (role === "patient") {
      const { data: adoptRes } = await context.supabase.rpc(
        "adopt_managed_profile_by_phone" as never,
      );
      const r = (adoptRes ?? null) as { adopted?: boolean; doctors?: string[] } | null;
      adopted = Boolean(r?.adopted);
      doctors = Array.isArray(r?.doctors) ? r!.doctors!.map(String) : [];
    }

    return { success: true, isNew, role, adopted, doctors };
  });

export const bootstrapOAuthUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        userId: z.string().uuid(),
        role: z.enum(["doctor", "patient"]).optional(),
        email: z.string().email().optional(),
        fullName: z.string().optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    // Only the user who just authenticated may bootstrap their own profile/role.
    assertSelf(context.userId, data.userId);
    const { data: authUserResult, error: userError } = await supabaseAdmin.auth.admin.getUserById(
      data.userId,
    );
    if (userError || !authUserResult.user) {
      throw new Error(userError?.message ?? "OAuth user not found");
    }

    const authUser = authUserResult.user;
    const finalRole: BootstrapRole = data.role ?? "patient";
    const resolvedName =
      data.fullName ??
      (typeof authUser.user_metadata?.full_name === "string"
        ? authUser.user_metadata.full_name
        : null) ??
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
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => z.object({ userId: z.string() }).parse(data))
  .handler(async ({ data, context }) => {
    // A user may only fetch their own profile via this endpoint.
    assertSelf(context.userId, data.userId);
    const { data: profile, error } = await supabaseAdmin
      .from("profiles")
      .select("*")
      .eq("user_id", data.userId)
      .single();

    if (error) throw new Error(error.message);
    return { profile };
  });

// =============================================================================
// Password reset — generates a recovery link via Supabase Admin and sends it
// to the user using our own branded Arabic email template (via Resend).
//
// Always returns { ok: true } regardless of whether the email exists, to
// prevent user enumeration. Rate-limited to 3 requests per 15 min per IP.
// =============================================================================
export const requestPasswordReset = createServerFn({ method: "POST" })
  .middleware([passwordResetRateLimit])
  .inputValidator((data) =>
    z
      .object({
        email: z.string().email("Invalid email"),
        redirectTo: z.string().url().optional(),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const email = data.email.trim().toLowerCase();
    const redirectTo = data.redirectTo ?? "https://mytabibi.com/reset-password";

    // Constant-time success path — never disclose whether the email exists.
    const okResponse = { ok: true as const };

    try {
      // 1. Generate a recovery link. This call returns 422 if the email
      //    isn't registered — we swallow that to avoid enumeration.
      const { data: linkData, error: linkErr } = await supabaseAdmin.auth.admin.generateLink({
        type: "recovery",
        email,
        options: { redirectTo },
      });

      if (linkErr || !linkData?.properties?.action_link) {
        // Either the email doesn't exist or generation failed; either way,
        // we return ok to avoid leaking which it was.
        return okResponse;
      }

      const actionLink = linkData.properties.action_link;

      // 2. Look up display name (best-effort).
      let recipientName: string | null = null;
      const userId = linkData.user?.id;
      if (userId) {
        const { data: profile } = await supabaseAdmin
          .from("profiles")
          .select("full_name")
          .eq("user_id", userId)
          .maybeSingle();
        recipientName = (profile?.full_name as string | null) ?? null;
      }

      // 3. Render + send email.
      const { buildPasswordResetEmail } = await import("@/lib/email/templates/password-reset");
      const { sendEmail } = await import("@/lib/email/sender");

      const { subject, html } = buildPasswordResetEmail({
        resetUrl: actionLink,
        recipientName,
      });

      await sendEmail({
        to: email,
        subject,
        html,
        tags: [{ name: "category", value: "password_reset" }],
      });
      // Note: we don't propagate sendEmail's result — same anti-enumeration
      // reason. If RESEND_API_KEY is missing the request still "succeeds"
      // from the user's POV; admins will see no email being delivered.
    } catch {
      // Swallow all errors — anti-enumeration.
    }

    return okResponse;
  });
