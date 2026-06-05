/**
 * Server functions for public profile pages and QR short links.
 *
 * - loadProfileBySlug — reads a public profile (+ doctor extras if it's a doctor)
 * - createShortLink — owner generates a /q/{shortId} alias for their page
 * - resolveShortLink — public lookup used by /q/{shortId} redirect route
 * - bumpProfileView — anonymous view counter
 */
import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { generateShortId } from "./slug";
import type { MedicalCard } from "./medical-card";

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

    // Determine role.
    const { data: r } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", p.user_id)
      .maybeSingle();
    const role = (r?.role ?? null) as PublicProfileBase["role"];

    // If doctor, load doctor extras (used by /d/{slug}).
    let doctor: PublicProfileBase["doctor"] = null;
    if (role === "doctor") {
      const { data: d } = await supabaseAdmin
        .from("doctor_details")
        .select(
          "id, specialty, consultation_fee, currency, rating, years_experience, is_verified, telemedicine_enabled",
        )
        .eq("profile_id", p.id)
        .maybeSingle();
      if (d) {
        const [{ count: reviewCount }, { count: clinicsCount }] = await Promise.all([
          supabaseAdmin
            .from("reviews")
            .select("id", { count: "exact", head: true })
            .eq("doctor_id", d.id)
            .eq("status", "approved"),
          supabaseAdmin
            .from("clinics")
            .select("id", { count: "exact", head: true })
            .eq("doctor_id", d.id),
        ]);
        doctor = {
          id: d.id,
          specialty: d.specialty,
          consultationFee: d.consultation_fee,
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
      medicalCard: (p as any).medical_card ?? {},
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
  .inputValidator((input: unknown): { profileId: string; targetPath: string; label?: string } => {
    if (
      !input ||
      typeof input !== "object" ||
      typeof (input as any).profileId !== "string" ||
      typeof (input as any).targetPath !== "string"
    ) {
      throw new Error("invalid input");
    }
    return input as { profileId: string; targetPath: string; label?: string };
  })
  .handler(async ({ data }): Promise<{ shortId: string }> => {
    // Try up to 5 times in case of collision.
    for (let attempt = 0; attempt < 5; attempt++) {
      const shortId = generateShortId(6);
      const { error } = await supabaseAdmin.from("profile_short_links").insert({
        short_id: shortId,
        profile_id: data.profileId,
        target_path: data.targetPath,
        label: data.label ?? null,
      });
      if (!error) return { shortId };
      if (error.code !== "23505") throw new Error(error.message);
    }
    throw new Error("could not allocate short id");
  });
