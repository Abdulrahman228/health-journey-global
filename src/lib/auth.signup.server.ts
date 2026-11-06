/**
 * Server-only e-mail sign-up (service role). One implementation for the web
 * `signUpUser` server function and the mobile apps' `/api/public/auth/signup`.
 *
 * Why mobile goes through here (2026-11-04): calling supabase.auth.signUp()
 * from the apps made Supabase send the confirmation mail through its built-in
 * SMTP, which only allows a couple of mails per hour (and only to team
 * members) — app sign-ups failed with `over_email_send_rate_limit`.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { normalizePhone } from "./phone";
import type { EmailSignUpInput } from "./auth.signup.schema";

export type BootstrapRole = "doctor" | "patient";

export const SITE_URL = (process.env.VITE_SITE_URL || "https://mytabibi.com").replace(/\/+$/, "");

/**
 * Link for an admin-generated auth token (signup confirmation / recovery).
 *
 * The browser client runs with flowType "pkce", which REJECTS the implicit
 * `#access_token=…` redirect that GoTrue's /verify sends for admin-generated
 * links — so the old `action_link` never produced a session (password reset
 * was impossible, confirmation landed on /login). Instead we link straight to
 * our page with the hashed token; the page calls verifyOtp({ token_hash }).
 * Bonus: mail scanners that prefetch the URL no longer burn the token.
 *
 * `origin` must already be trusted (see trustedOrigin) — never a raw client value.
 */
export function buildTokenHashLink(
  origin: string,
  path: "/auth/callback" | "/reset-password",
  hashedToken: string,
  type: "signup" | "recovery",
): string {
  const u = new URL(path, origin);
  u.searchParams.set("token_hash", hashedToken);
  u.searchParams.set("type", type);
  return u.toString();
}

/** Accept a client-supplied URL's origin only when it is one of ours. */
export function trustedOrigin(candidate: string | undefined | null): string {
  if (candidate) {
    try {
      const o = new URL(candidate).origin;
      const host = new URL(o).hostname;
      const allowed =
        o === SITE_URL ||
        host === "mytabibi.com" ||
        host.endsWith(".mytabibi.com") ||
        host === "localhost" ||
        host === "127.0.0.1";
      if (allowed) return o;
    } catch {
      /* fall through */
    }
  }
  return SITE_URL;
}

/**
 * Create the doctor_details / patient_details shell for a profile (idempotent).
 * Always stamps `user_id` = auth uid: many RLS policies (appointments_doctor_read,
 * doctor_documents_*, doctor credentials storage, withdrawals, patient_details_*)
 * compare `<details>.user_id = auth.uid()`; a NULL there locks the owner out.
 */
export async function ensureRoleSpecificDetails(userId: string, role: BootstrapRole) {
  const { data: profile, error: profileErr } = await supabaseAdmin
    .from("profiles")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();
  if (profileErr) throw new Error(profileErr.message);
  if (!profile) return;

  if (role === "doctor") {
    const { data: doctorExisting } = await supabaseAdmin
      .from("doctor_details")
      .select("id, user_id")
      .eq("profile_id", profile.id)
      .maybeSingle();

    if (!doctorExisting) {
      const { error } = await supabaseAdmin.from("doctor_details").insert({
        profile_id: profile.id,
        user_id: userId,
        // Canonical specialties.name_ar for slug "general" — search filters match on it.
        specialty: "طب عام",
        is_verified: false,
        verification_status: "pending",
      });
      if (error) throw new Error(error.message);
    } else if (!doctorExisting.user_id) {
      await supabaseAdmin
        .from("doctor_details")
        .update({ user_id: userId })
        .eq("id", doctorExisting.id);
    }
    return;
  }

  const { data: patientExisting } = await supabaseAdmin
    .from("patient_details")
    .select("id, user_id")
    .eq("profile_id", profile.id)
    .maybeSingle();

  if (!patientExisting) {
    const { error } = await supabaseAdmin.from("patient_details").insert({
      profile_id: profile.id,
      user_id: userId,
    });
    if (error) throw new Error(error.message);
  } else if (!patientExisting.user_id) {
    await supabaseAdmin
      .from("patient_details")
      .update({ user_id: userId })
      .eq("id", patientExisting.id);
  }
}

/** Undo a half-finished sign-up so the person can simply try again. */
async function rollbackSignUp(userId: string) {
  try {
    await supabaseAdmin.from("user_roles").delete().eq("user_id", userId);
    await supabaseAdmin.from("user_contacts").delete().eq("user_id", userId);
    // profiles → doctor_details / patient_details cascade on profile_id.
    await supabaseAdmin.from("profiles").delete().eq("user_id", userId);
    await supabaseAdmin.auth.admin.deleteUser(userId);
  } catch (e) {
    console.error("[signup] rollback failed:", e instanceof Error ? e.message : e);
  }
}

export async function performEmailSignUp(
  data: EmailSignUpInput,
): Promise<{ success: true; userId: string; requiresEmailConfirmation: boolean }> {
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
  let confirmUrl: string | null = null;

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
    confirmUrl = linkData.properties.hashed_token
      ? buildTokenHashLink(SITE_URL, "/auth/callback", linkData.properties.hashed_token, "signup")
      : linkData.properties.action_link;
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

  try {
    // Create profile
    const { error: profileError } = await supabaseAdmin.from("profiles").insert({
      user_id: userId,
      full_name: data.fullName,
      city: data.city ?? null,
      ...(phone ? { phone } : {}),
    });
    if (profileError) throw new Error(profileError.message);

    // Store phone privately in user_contacts
    if (phone) {
      await supabaseAdmin
        .from("user_contacts")
        .upsert({ user_id: userId, phone }, { onConflict: "user_id" });
    }

    // Assign role
    const { error: roleError } = await supabaseAdmin.from("user_roles").insert({
      user_id: userId,
      role: data.role,
    });
    if (roleError) throw new Error(roleError.message);

    // Create role-specific details
    await ensureRoleSpecificDetails(userId, data.role);

    if (confirmUrl) {
      const { buildConfirmEmail } = await import("@/lib/email/templates/confirm-email");
      const { sendEmail } = await import("@/lib/email/sender");
      const { subject, html } = buildConfirmEmail({
        confirmUrl,
        recipientName: data.fullName,
      });
      const sent = await sendEmail({
        to: email,
        subject,
        html,
        tags: [{ name: "category", value: "confirm_email" }],
      });
      // Without the mail the account could never be confirmed (and a retry
      // would say "already registered") — fail cleanly instead.
      if (!sent.ok) {
        console.error("[signup] confirmation e-mail failed:", "error" in sent ? sent.error : sent);
        throw new Error("confirmation_email_failed");
      }
    }
  } catch (e) {
    await rollbackSignUp(userId);
    throw e;
  }

  return { success: true, userId, requiresEmailConfirmation };
}
