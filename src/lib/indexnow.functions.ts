/**
 * Server function: trigger IndexNow submission for a doctor profile.
 *
 * Called from the admin verification flow after approving a doctor.
 * Re-uses RLS-free supabaseAdmin to look up the doctor's specialty slug
 * + city slug, then pings IndexNow with the relevant URLs.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { submitDoctorUrls, submitArticleUrls, submitUrls } from "@/lib/indexnow";
import { CITIES, cityMatchTerms } from "@/lib/cities";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { isAdmin } from "./_authz";

async function assertAdmin(userId: string) {
  if (!(await isAdmin(userId))) {
    throw new Error("Unauthorized: admin only");
  }
}

/**
 * Generic IndexNow ping — accepts an arbitrary URL list. Used by
 * /admin/doctors after a verification toggle to ping the doctor URL
 * + /sitemap-doctors.xml.
 */
export const pingIndexNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        urls: z.array(z.string().url()).min(1).max(50),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    return submitUrls(data.urls);
  });

export const pingIndexNowForDoctor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        doctorId: z.string().uuid(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { data: d, error } = await supabaseAdmin
      .from("doctor_details")
      .select("id, specialty, profile_id")
      .eq("id", data.doctorId)
      .maybeSingle();
    if (error || !d) return { ok: false, status: 0, submitted: 0 };

    // Resolve specialty slug
    let specialtySlug: string | null = null;
    if (d.specialty) {
      const { data: spec } = await supabaseAdmin
        .from("specialties")
        .select("slug")
        .or(`name_ar.eq.${d.specialty},name_en.eq.${d.specialty}`)
        .maybeSingle();
      specialtySlug = spec?.slug ?? null;
    }

    // Resolve city slug
    let citySlug: string | null = null;
    const { data: prof } = await supabaseAdmin
      .from("profiles")
      .select("city")
      .eq("id", d.profile_id)
      .maybeSingle();
    const cityName = prof?.city?.trim();
    if (cityName) {
      const matched = CITIES.find((c) => cityMatchTerms(c).includes(cityName));
      citySlug = matched?.slug ?? null;
    }

    return submitDoctorUrls({ doctorId: d.id, specialtySlug, citySlug });
  });

export const pingIndexNowForArticle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) =>
    z
      .object({
        slug: z.string().min(1),
        specialtySlug: z.string().nullable().optional(),
      })
      .parse(data),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    return submitArticleUrls({
      slug: data.slug,
      specialtySlug: data.specialtySlug ?? null,
    });
  });
