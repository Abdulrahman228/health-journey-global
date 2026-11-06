import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getDoctorForUser } from "@/lib/_identity";

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
        .regex(/^#[0-9a-fA-F]{6}$/, "اللون يجب أن يكون بصيغة #RRGGBB")
        .nullable()
        .optional(),
      logoUrl: z.string().url("رابط الشعار غير صالح").nullable().optional(),
      clinicName: z.string().max(100, "اسم العيادة طويل جداً").nullable().optional(),
    }).parse,
  )
  .handler(async ({ data, context }) => {
    const admin = supabaseAdmin;
    const { data: dd, error: ddErr } = await admin
      .from("doctor_details")
      .select("id")
      .eq(
        "id",
        (await getDoctorForUser(context.userId))?.doctorDetailsId ??
          "00000000-0000-0000-0000-000000000000",
      )
      .maybeSingle();
    if (ddErr) throw new Error("تعذّر تحميل بيانات الطبيب: " + ddErr.message);
    if (!dd) throw new Error("لم يتم العثور على ملف الطبيب لهذا الحساب");

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
    if (error) throw new Error("تعذّر حفظ الإعدادات: " + error.message);
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
        .eq(
          "id",
          (await getDoctorForUser(context.userId))?.doctorDetailsId ??
            "00000000-0000-0000-0000-000000000000",
        )
        .maybeSingle(),
      admin.from("profiles").select("slug").eq("user_id", context.userId).maybeSingle(),
    ]);
    return {
      slug: prof?.slug ?? null,
      enabled: dd?.solo_mode_enabled ?? false,
      brandColor: dd?.solo_brand_color ?? null,
      logoUrl: dd?.solo_logo_url ?? null,
      clinicName: dd?.solo_clinic_name ?? null,
    };
  });
