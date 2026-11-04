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

const SITE_URL = (process.env.VITE_SITE_URL || "https://mytabibi.com").replace(/\/+$/, "");

/** Create the doctor_details / patient_details shell for a profile (idempotent). */
export async function ensureRoleSpecificDetails(userId: string, role: BootstrapRole) {
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
}
