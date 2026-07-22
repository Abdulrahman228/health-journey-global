import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * Doctor-facing toggle for Online Consultations (telemedicine).
 *
 * FEATURE GATE (liability): enabling telemedicine requires the doctor's
 * documents to be verified (`doctor_details.is_verified === true`). Clinic
 * bookings are unaffected — this only governs online consultations.
 *
 * A doctor may always DISABLE it. Attempting to ENABLE while unverified is
 * rejected AND recorded in audit_logs as a warning so bypass attempts can be
 * monitored.
 *
 * Placement note: this is doctor-facing (the doctor updates their own row via
 * `profile_id = context.userId`, mirroring `updateSoloMode`). It deliberately
 * does NOT live in `src/lib/admin/clinical.ts`, which is admin-gated
 * (`resolveAdmin`) and would reject the doctor's own call.
 */
export const toggleTelemedicine = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ enabled: z.boolean() }).parse(raw))
  .handler(async ({ data, context }) => {
    // The caller's own doctor_details (profile_id == auth user id by convention).
    const { data: dd, error: ddErr } = await supabaseAdmin
      .from("doctor_details")
      .select("id, is_verified, telemedicine_enabled")
      .eq("profile_id", context.userId)
      .maybeSingle();
    if (ddErr) throw new Error(ddErr.message);
    if (!dd) throw new Error("Doctor profile not found");

    // Gate: block enabling for unverified doctors, and log the attempt.
    if (data.enabled && dd.is_verified !== true) {
      const req = getRequest();
      await supabaseAdmin.from("audit_logs").insert({
        user_id: context.userId,
        action: "telemedicine.enable_denied",
        resource_type: "doctor_details",
        resource_id: dd.id,
        ip_address:
          req?.headers.get("cf-connecting-ip") ??
          req?.headers.get("x-real-ip") ??
          req?.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
          null,
        user_agent: req?.headers.get("user-agent") ?? null,
        metadata: {
          severity: "warning",
          reason: "verification_required",
          attempted: "enable_telemedicine",
        },
      });
      throw new Error("Verification required to enable online consultations");
    }

    const { error } = await supabaseAdmin
      .from("doctor_details")
      .update({ telemedicine_enabled: data.enabled })
      .eq("id", dd.id);
    if (error) throw new Error(error.message);

    return {
      ok: true as const,
      telemedicineEnabled: data.enabled,
      isVerified: dd.is_verified === true,
    };
  });

/** Read the doctor's own telemedicine status + verification gate state. */
export const getMyTelemedicineStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: dd } = await supabaseAdmin
      .from("doctor_details")
      .select("is_verified, telemedicine_enabled")
      .eq("profile_id", context.userId)
      .maybeSingle();
    return {
      isVerified: dd?.is_verified === true,
      telemedicineEnabled: dd?.telemedicine_enabled === true,
    };
  });
