import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { resolveAdmin, runAdminAction } from "./_kit";
import { AdminSetDoctorFlagsSchema } from "./_schemas";

/**
 * Flip doctor switches the apps cannot: verification, telemedicine, and a
 * per-doctor online commission override (doctor_billing_settings.platform_fee_pct,
 * which the completion trigger takes as a floor: min(override, plan %)).
 * The service role bypasses guard_doctor_details_writes' column lock.
 */
export const adminSetDoctorFlags = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => AdminSetDoctorFlagsSchema.parse(raw))
  .handler(async ({ data, context }) => {
    const admin = await resolveAdmin(context.userId, "admin");
    return runAdminAction({
      admin,
      action: "doctor.flags",
      resourceType: "doctor",
      mutate: async () => {
        const patch: Record<string, unknown> = {};
        if (data.telemedicine_enabled !== undefined) patch.telemedicine_enabled = data.telemedicine_enabled;
        if (data.is_verified !== undefined) {
          patch.is_verified = data.is_verified;
          patch.verification_status = data.is_verified ? "approved" : "pending";
        }
        if (Object.keys(patch).length) {
          const { error } = await supabaseAdmin
            .from("doctor_details")
            .update(patch as never)
            .eq("id", data.doctorDetailsId);
          if (error) throw new Error(error.message);
        }
        if (data.commission_pct !== undefined) {
          const { error } = await supabaseAdmin
            .from("doctor_billing_settings")
            .upsert(
              { doctor_details_id: data.doctorDetailsId, platform_fee_pct: data.commission_pct } as never,
              { onConflict: "doctor_details_id" },
            );
          if (error) throw new Error(error.message);
        }
        return {
          resourceId: data.doctorDetailsId,
          summary: data.reason,
          metadata: { patch: patch as never, commission_pct: data.commission_pct ?? null },
          result: { ok: true as const },
        };
      },
    });
  });
