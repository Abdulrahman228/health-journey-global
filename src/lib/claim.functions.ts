import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { signupRateLimit } from "./_rate-limit";

// Same strong-password rule as the normal sign-up flow.
const strongPassword = z
  .string()
  .min(10, "Password must be at least 10 characters")
  .max(128)
  .regex(/[A-Za-z]/, "Password must contain a letter")
  .regex(/[0-9]/, "Password must contain a digit");

/** Last 10 digits of a phone (ignores +20 / leading-0 / spacing differences). */
function phoneKey(phone: string | null | undefined): string {
  const digits = (phone ?? "").replace(/\D/g, "");
  return digits.slice(-10);
}

/** Mask a phone for display: keep the last 3 digits. */
function maskPhone(phone: string | null | undefined): string | null {
  const digits = (phone ?? "").replace(/\D/g, "");
  if (digits.length < 4) return null;
  return `••••••${digits.slice(-3)}`;
}

/**
 * Fetch a seeded listing by its (unguessable) claim token, for the /claim page
 * to display before the doctor claims. Token-gated, no auth. Never returns the
 * token; the phone is masked. Uses supabaseAdmin because the table is RLS-locked.
 */
export const getClaimableListing = createServerFn({ method: "POST" })
  .inputValidator((raw: unknown) => z.object({ token: z.string().uuid() }).parse(raw))
  .handler(async ({ data }) => {
    const { data: row } = await supabaseAdmin
      .from("scraped_doctors")
      .select("id, full_name, specialty, city, address, phone, is_claimed, opted_out")
      .eq("claim_token", data.token)
      .maybeSingle();

    if (!row || row.opted_out) {
      return { found: false as const };
    }
    if (row.is_claimed) {
      return { found: true as const, alreadyClaimed: true as const, listing: null };
    }
    return {
      found: true as const,
      alreadyClaimed: false as const,
      listing: {
        fullName: row.full_name,
        specialty: row.specialty,
        city: row.city,
        address: row.address,
        phoneHint: maskPhone(row.phone),
        hasPhone: Boolean(row.phone),
      },
    };
  });

/**
 * Claim a seeded profile: creates the doctor's Tabibi account (gated by the
 * claim token + a phone match), promotes the seeded listing into a real
 * profile + doctor_details (source='claimed_scrape', unverified), and marks the
 * seeded row claimed.
 *
 * The new doctor lands UNVERIFIED (is_verified=false), so online booking stays
 * off until they pass the existing license-verification flow — that is the real
 * identity gate. Rate-limited like sign-up; runs entirely in the inline handler.
 */
export const claimDoctorProfile = createServerFn({ method: "POST" })
  .middleware([signupRateLimit])
  .inputValidator((raw: unknown) =>
    z
      .object({
        token: z.string().uuid(),
        email: z.string().email(),
        password: strongPassword,
        fullName: z.string().trim().min(2).max(120),
        phone: z.string().trim().min(6).max(20),
      })
      .parse(raw),
  )
  .handler(async ({ data }) => {
    // 1) Resolve the seeded row by token and validate it's still claimable.
    const { data: row } = await supabaseAdmin
      .from("scraped_doctors")
      .select("id, full_name, specialty, city, address, phone, is_claimed, opted_out")
      .eq("claim_token", data.token)
      .maybeSingle();
    if (!row || row.opted_out) throw new Error("رابط المطالبة غير صالح أو منتهي.");
    if (row.is_claimed) throw new Error("تم تفعيل هذا الملف بالفعل. يرجى تسجيل الدخول.");

    // 2) Phone possession check: the entered number must match the listed one.
    if (row.phone && phoneKey(row.phone) !== phoneKey(data.phone)) {
      throw new Error("رقم الهاتف لا يطابق الرقم المسجّل لهذا الملف.");
    }

    // 3) Create the auth account (auto-confirmed, like the normal sign-up).
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: { full_name: data.fullName },
    });
    if (authError || !authData.user) {
      const msg = authError?.message ?? "";
      if (/already|exists|registered/i.test(msg)) {
        throw new Error("هذا البريد مسجّل بالفعل. سجّل الدخول ثم طالب بالملف.");
      }
      throw new Error(msg || "تعذّر إنشاء الحساب.");
    }
    const userId = authData.user.id;

    // 4) Promote: profile + doctor role + doctor_details (unverified) from seed.
    const { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .insert({ user_id: userId, full_name: data.fullName, city: row.city })
      .select("id")
      .single();
    if (profileError || !profile) {
      // Roll back the orphaned auth user so the doctor can retry cleanly.
      await supabaseAdmin.auth.admin.deleteUser(userId).catch(() => {});
      throw new Error(profileError?.message ?? "تعذّر إنشاء الملف الشخصي.");
    }

    await supabaseAdmin.from("user_roles").insert({ user_id: userId, role: "doctor" });

    const { data: doctor, error: ddError } = await supabaseAdmin
      .from("doctor_details")
      .insert({
        profile_id: profile.id,
        specialty: row.specialty ?? "General",
        clinic_address: row.address,
        source: "claimed_scrape",
        is_claimed: true,
        claimed_at: new Date().toISOString(),
        is_verified: false,
        verification_status: "pending",
      })
      .select("id")
      .single();
    if (ddError || !doctor) throw new Error(ddError?.message ?? "تعذّر إنشاء ملف الطبيب.");

    // Store the phone privately (same place normal sign-up puts it).
    await supabaseAdmin.from("user_contacts").insert({ user_id: userId, phone: data.phone });

    // 5) Mark the seeded row claimed so it leaves the directory & outreach pool.
    await supabaseAdmin
      .from("scraped_doctors")
      .update({
        is_claimed: true,
        claimed_doctor_id: doctor.id,
        claimed_at: new Date().toISOString(),
        listing_status: "claimed",
      })
      .eq("id", row.id);

    return { success: true as const, email: data.email, doctorId: doctor.id };
  });
