import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * Toggle solo (white-label) mode + branding for the doctor's L3 subdomain.
 * Only the authenticated doctor may modify their own settings.
 */
export const updateSoloMode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    z.object({
      enabled: z.boolean(),
      brandColor: z
        .string()
        .regex(/^#[0-9a-fA-F]{6}$/, "Invalid hex color")
        .nullable()
        .optional(),
      logoUrl: z.string().url().nullable().optional(),
      clinicName: z.string().max(100).nullable().optional(),
    }).parse,
  )
  .handler(async ({ data, context }) => {
    const admin = supabaseAdmin;
    const { data: dd, error: ddErr } = await admin
      .from("doctor_details")
      .select("id")
      .eq("profile_id", context.userId)
      .maybeSingle();
    if (ddErr) throw new Error(ddErr.message);
    if (!dd) throw new Error("Doctor profile not found");

    const update: {
      solo_mode_enabled: boolean;
      solo_brand_color?: string | null;
      solo_logo_url?: string | null;
      solo_clinic_name?: string | null;
    } = {
      solo_mode_enabled: data.enabled,
    };
    if (data.brandColor !== undefined) update.solo_brand_color = data.brandColor;
    if (data.logoUrl !== undefined) update.solo_logo_url = data.logoUrl;
    if (data.clinicName !== undefined) update.solo_clinic_name = data.clinicName;

    const { error } = await admin.from("doctor_details").update(update).eq("id", dd.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getMySoloSettings = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const admin = supabaseAdmin;
    const [{ data: dd }, { data: prof }] = await Promise.all([
      admin
        .from("doctor_details")
        .select("solo_mode_enabled, solo_brand_color, solo_logo_url, solo_clinic_name")
        .eq("profile_id", context.userId)
        .maybeSingle(),
      admin.from("profiles").select("slug").eq("id", context.userId).maybeSingle(),
    ]);
    return {
      slug: prof?.slug ?? null,
      enabled: dd?.solo_mode_enabled ?? false,
      brandColor: dd?.solo_brand_color ?? null,
      logoUrl: dd?.solo_logo_url ?? null,
      clinicName: dd?.solo_clinic_name ?? null,
    };
  });
