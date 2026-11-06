import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { signupRateLimit, passwordResetRateLimit } from "./_rate-limit";
import { assertSelf } from "./_authz";
import { normalizePhone } from "./phone";
import { emailSignUpSchema } from "./auth.signup.schema";
import {
  buildTokenHashLink,
  ensureRoleSpecificDetails,
  performEmailSignUp,
  trustedOrigin,
} from "./auth.signup.server";
import type { Database } from "@/integrations/supabase/types";

type BootstrapRole = "doctor" | "patient";
type AppRole = Database["public"]["Enums"]["app_role"];

/**
 * ALL of a user's roles (user_roles holds one row per role — doctor+admin and
 * admin+super_admin+patient users exist, so never `.limit(1)` / `.maybeSingle()`).
 */
async function getRoles(userId: string): Promise<AppRole[]> {
  const { data, error } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
  return (data ?? []).map((r) => r.role);
}

/**
 * Give a brand-new account its first role, then make sure the details row for
 * the doctor / patient side exists. Existing accounts keep their roles; a
 * lab / pharmacy / admin-only account never gets a patient shell.
 */
async function ensureRolesAndDetails(
  userId: string,
  requested: BootstrapRole | undefined,
): Promise<{ roles: AppRole[]; role: BootstrapRole | null }> {
  let roles = await getRoles(userId);
  if (roles.length === 0) {
    const first: BootstrapRole = requested ?? "patient";
    const { error } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: userId, role: first });
    // 23505: a parallel call already inserted it — fine.
    if (error && error.code !== "23505") throw new Error(error.message);
    roles = [first];
  }
  const role: BootstrapRole | null = roles.includes("doctor")
    ? "doctor"
    : roles.includes("patient")
      ? "patient"
      : null;
  if (role) await ensureRoleSpecificDetails(userId, role);
  return { roles, role };
}

export const signUpUser = createServerFn({ method: "POST" })
  // 5 sign-ups per hour per IP keeps account-creation abuse / spam in check.
  .middleware([signupRateLimit])
  .inputValidator((data) => emailSignUpSchema.parse(data))
  .handler(async ({ data }) => performEmailSignUp(data));

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

    // Role (first one wins; later calls never change it). Reads ALL roles.
    const { roles, role: detailsRole } = await ensureRolesAndDetails(userId, data.role);
    const role: BootstrapRole = detailsRole ?? "patient";

    // Patients only (never doctors / labs / pharmacies / admins): inherit the
    // profile a doctor registered under this number. Best effort — a failure
    // here must not block the sign-in itself.
    let adopted = false;
    let doctors: string[] = [];
    if (roles.length > 0 && roles.every((r) => r === "patient")) {
      const { data: adoptRes, error: adoptErr } = await context.supabase.rpc(
        "adopt_managed_profile_by_phone",
      );
      if (adoptErr) {
        console.error("[bootstrapPhoneUser] adopt_managed_profile_by_phone:", adoptErr.message);
      } else if (adoptRes && typeof adoptRes === "object" && !Array.isArray(adoptRes)) {
        adopted = adoptRes.adopted === true;
        doctors = Array.isArray(adoptRes.doctors) ? adoptRes.doctors.map(String) : [];
      }
    }

    return { success: true, isNew, role, roles, adopted, doctors };
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

    // First role for a new account; existing (possibly multi-role) accounts
    // keep theirs. Details rows only for the doctor / patient side.
    const { roles } = await ensureRolesAndDetails(data.userId, finalRole);

    return { success: true, roles };
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
    // Only one of OUR origins may receive the reset token (never a raw client URL).
    const origin = trustedOrigin(data.redirectTo);
    const redirectTo = `${origin}/reset-password`;

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

      // token_hash link → /reset-password calls verifyOtp (the PKCE browser
      // client cannot consume the implicit-grant redirect of action_link).
      const actionLink = linkData.properties.hashed_token
        ? buildTokenHashLink(
            origin,
            "/reset-password",
            linkData.properties.hashed_token,
            "recovery",
          )
        : linkData.properties.action_link;

      // 2. Look up display name (best-effort).
      let recipientName: string | null = null;
      const userId = linkData.user?.id;
      if (userId) {
        const { data: profile } = await supabaseAdmin
          .from("profiles")
          .select("full_name")
          .eq("user_id", userId)
          .maybeSingle();
        recipientName = profile?.full_name ?? null;
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
