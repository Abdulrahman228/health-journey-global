import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { resolveAdmin, runAdminAction } from "./_kit";
import { AdminVerifyDoctorSchema } from "./_schemas";

/**
 * Approve or reject a doctor's verification request (level: admin).
 *
 * Flips `doctor_details.is_verified` and stamps the review trail. The reviewer id
 * comes from the verified admin context — never from input. Server logic stays
 * inside the inline handler so it is stripped from the client bundle.
 */
export const adminVerifyDoctor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => AdminVerifyDoctorSchema.parse(raw))
  .handler(async ({ data, context }) => {
    const admin = await resolveAdmin(context.userId, "admin");
    return runAdminAction({
      admin,
      action: "doctor.verify",
      resourceType: "doctor_details",
      mutate: async () => {
        const approved = data.decision === "approve";
        const { data: updated, error } = await supabaseAdmin
          .from("doctor_details")
          .update({
            is_verified: approved,
            verification_status: approved ? "approved" : "rejected",
            // Approved doctors get telemedicine enabled; rejected ones off
            // (preserves the prior verification-flow business rule).
            telemedicine_enabled: approved,
            verification_reviewed_at: new Date().toISOString(),
            verification_reviewed_by: admin.actorId,
            ...(data.note !== undefined ? { verification_notes: data.note } : {}),
          })
          .eq("id", data.doctorDetailsId)
          .select("id")
          .maybeSingle();
        if (error) throw new Error(error.message);
        if (!updated) throw new Error("Doctor not found.");

        return {
          resourceId: data.doctorDetailsId,
          summary: `${data.decision}${data.note ? `: ${data.note}` : ""}`,
          metadata: { decision: data.decision, reviewedBy: admin.actorId },
          result: { ok: true, verified: approved, status: approved ? "approved" : "rejected" },
        };
      },
    });
  });
