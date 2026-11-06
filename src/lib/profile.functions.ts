/**
 * Server functions for public profile pages and QR short links.
 *
 * - loadProfileBySlug — reads a public profile (+ doctor extras if it's a doctor)
 * - createShortLink — owner generates a /q/{shortId} alias for their page
 * - resolveShortLink — public lookup used by /q/{shortId} redirect route
 * - bumpProfileView — anonymous view counter
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { generateShortId } from "./slug";
import { MEDICAL_FIELDS, type MedicalCard } from "./medical-card";

/**
 * Keep only the medical-card fields the owner marked public. The loader result
 * is serialized into the page HTML, so private fields must never leave the server.
 */
function publicMedicalCard(card: MedicalCard | null): MedicalCard {
  const out: MedicalCard = {};
  if (!card) return out;
  for (const key of MEDICAL_FIELDS) {
    const field = card[key];
    if (field?.public) out[key] = field;
  }
  return out;
}

export type ProfileVisibility = "public" | "unlisted" | "private";

export interface PublicProfileBase {
  id: string;
  slug: string;
  fullName: string | null;
  avatarUrl: string | null;
  bannerUrl: string | null;
  city: string | null;
  country: string | null;
  bio: string | null;
  visibility: ProfileVisibility;
  role: "doctor" | "patient" | "pharmacy" | "admin" | null;
  socialLinks: Record<string, string>;
  viewsCount: number;
  /** Patient public medical card (V7). Empty for doctors / not set. */
  medicalCard: MedicalCard;
  /** Populated only when role === 'doctor'. */
  doctor: {
    id: string;
    specialty: string | null;
    consultationFee: number | null;
    /** Separate online-consultation fee (null → BookingCard falls back to consultationFee). */
    onlineConsultationFee: number | null;
    currency: string | null;
    rating: number | null;
    reviewCount: number;
    yearsExperience: number | null;
    isVerified: boolean;
    telemedicineEnabled: boolean;
    clinicsCount: number;
  } | null;
}

/** Public read of a profile by slug. Returns null if missing or private. */
export const loadProfileBySlug = createServerFn({ method: "GET" })
  .inputValidator((slug: unknown): string => {
    if (typeof slug !== "string" || !slug) throw new Error("slug required");
    return slug.toLowerCase();
  })
  .handler(async ({ data: slug }): Promise<PublicProfileBase | null> => {
    const { data: p, error } = await supabaseAdmin
      .from("profiles")
      .select(
        "id, slug, full_name, avatar_url, public_banner_url, public_bio, city, country, profile_visibility, social_links, profile_views_count, user_id, medical_card",
      )
      .eq("slug", slug)
      .maybeSingle();
    if (error || !p) return null;
    if (p.profile_visibility === "private") return null;

    // Determine role. A user can hold several roles (UNIQUE(user_id, role)), so
    // .maybeSingle() would error for e.g. doctor+admin; pick by priority instead.
    // Managed (shell) profiles have no user_id → no role.
    const { data: roleRows } = p.user_id
      ? await supabaseAdmin.from("user_roles").select("role").eq("user_id", p.user_id)
      : { data: [] };
    const roleSet = new Set((roleRows ?? []).map((x) => x.role));
    const role: PublicProfileBase["role"] = roleSet.has("doctor")
      ? "doctor"
      : roleSet.has("pharmacy")
        ? "pharmacy"
        : roleSet.has("patient")
          ? "patient"
          : roleSet.has("admin") || roleSet.has("super_admin")
            ? "admin"
            : null;

    // If doctor, load doctor extras (used by /d/{slug}).
    let doctor: PublicProfileBase["doctor"] = null;
    if (role === "doctor") {
      const { data: d } = await supabaseAdmin
        .from("doctor_details")
        .select(
          "id, specialty, consultation_fee, online_consultation_fee, currency, rating, years_experience, is_verified, telemedicine_enabled",
        )
        .eq("profile_id", p.id)
        .maybeSingle();
      if (d) {
        const [{ count: reviewCount }, { count: clinicsCount }] = await Promise.all([
          supabaseAdmin
            .from("reviews")
            .select("id", { count: "exact", head: true })
            .eq("doctor_id", d.id)
            .eq("status", "approved")
            .eq("is_published_by_doctor", true),
          supabaseAdmin
            .from("clinics")
            .select("id", { count: "exact", head: true })
            .eq("doctor_id", d.id),
        ]);
        doctor = {
          id: d.id,
          specialty: d.specialty,
          consultationFee: d.consultation_fee,
          onlineConsultationFee: d.online_consultation_fee,
          currency: d.currency,
          rating: typeof d.rating === "number" ? d.rating : null,
          reviewCount: reviewCount ?? 0,
          yearsExperience: d.years_experience,
          isVerified: Boolean(d.is_verified),
          telemedicineEnabled: Boolean(d.telemedicine_enabled),
          clinicsCount: clinicsCount ?? 0,
        };
      }
    }

    return {
      id: p.id,
      slug: p.slug ?? "",
      fullName: p.full_name,
      avatarUrl: p.avatar_url,
      bannerUrl: p.public_banner_url,
      city: p.city,
      country: p.country,
      bio: p.public_bio,
      visibility: p.profile_visibility as ProfileVisibility,
      role,
      socialLinks: (p.social_links as Record<string, string>) ?? {},
      viewsCount: p.profile_views_count ?? 0,
      // Json → domain type; private fields are stripped server-side.
      medicalCard: publicMedicalCard(p.medical_card as MedicalCard | null),
      doctor,
    };
  });

/** Resolve /q/{shortId} → target path. Increments click counter. */
export const resolveShortLink = createServerFn({ method: "GET" })
  .inputValidator((shortId: unknown): string => {
    if (typeof shortId !== "string" || !/^[A-Za-z0-9]{4,12}$/.test(shortId)) {
      throw new Error("invalid short id");
    }
    return shortId;
  })
  .handler(async ({ data: shortId }): Promise<string | null> => {
    const { data, error } = await supabaseAdmin.rpc("touch_short_link", {
      p_short_id: shortId,
    });
    if (error) {
      console.error("[resolveShortLink] RPC error:", error);
      return null;
    }
    return typeof data === "string" ? data : null;
  });

/** Bump anonymous view counter (best-effort, errors silenced). */
export const bumpProfileView = createServerFn({ method: "POST" })
  .inputValidator((slug: unknown): string => {
    if (typeof slug !== "string" || !slug) throw new Error("slug required");
    return slug.toLowerCase();
  })
  .handler(async ({ data: slug }) => {
    await supabaseAdmin.rpc("touch_profile_view", { p_slug: slug });
    return { ok: true };
  });

/** Owner creates a short link for their own profile. */
export const createShortLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown): { profileId: string; targetPath: string; label?: string } => {
    const o = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
    // Same shape as the DB check target_path_format_chk: /d/{slug} or /u/{slug}.
    if (
      typeof o.profileId !== "string" ||
      typeof o.targetPath !== "string" ||
      !/^\/[a-z]\/[a-z0-9-]+$/.test(o.targetPath) ||
      (o.label !== undefined && typeof o.label !== "string")
    ) {
      throw new Error("رابط غير صالح");
    }
    return {
      profileId: o.profileId,
      targetPath: o.targetPath,
      label: typeof o.label === "string" ? o.label.slice(0, 80) : undefined,
    };
  })
  .handler(async ({ data, context }): Promise<{ shortId: string }> => {
    // Authorize: caller must own this profile (or be admin).
    const { data: prof } = await supabaseAdmin
      .from("profiles")
      .select("user_id")
      .eq("id", data.profileId)
      .maybeSingle();
    if (!prof) throw new Error("الملف غير موجود");
    if (prof.user_id !== context.userId) {
      // A user can hold both admin and super_admin → read rows, not .maybeSingle().
      const { data: adminRows } = await supabaseAdmin
        .from("user_roles")
        .select("role")
        .eq("user_id", context.userId)
        .in("role", ["admin", "super_admin"])
        .limit(1);
      if (!adminRows || adminRows.length === 0) throw new Error("غير مسموح");
    }
    // The share dialog asks for an (unlabeled) link every time it opens — reuse
    // the existing one instead of inserting a new row per open.
    if (!data.label) {
      const { data: existing } = await supabaseAdmin
        .from("profile_short_links")
        .select("short_id")
        .eq("profile_id", data.profileId)
        .eq("target_path", data.targetPath)
        .is("label", null)
        .order("created_at", { ascending: true })
        .limit(1);
      if (existing && existing.length > 0) return { shortId: existing[0].short_id };
    }
    // Try up to 5 times in case of collision.
    for (let attempt = 0; attempt < 5; attempt++) {
      const shortId = generateShortId(6);
      const { error } = await supabaseAdmin.from("profile_short_links").insert({
        short_id: shortId,
        profile_id: data.profileId,
        target_path: data.targetPath,
        label: data.label ?? null,
        created_by: context.userId,
      });
      if (!error) return { shortId };
      if (error.code !== "23505") throw new Error(error.message);
    }
    throw new Error("تعذّر إنشاء رابط قصير، حاول مرة أخرى");
  });
