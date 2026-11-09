import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { resolveAdmin, runAdminAction } from "./_kit";
import { AdminUpdateAppointmentSchema } from "./_schemas";

/**
 * Admin edit of an appointment (status, payment, time, clinic, doctor, fee…).
 *
 * The service role is a privileged writer for guard_appointment_writes(), so
 * the locked columns can be changed here; the notification trigger
 * (_notify_on_appointment) tells both parties about status/payment changes
 * exactly as it does for the app flows. Reassigning the doctor keeps the
 * booking and moves it; the fee is left as-is unless given explicitly.
 */
export const adminUpdateAppointment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => AdminUpdateAppointmentSchema.parse(raw))
  .handler(async ({ data, context }) => {
    const admin = await resolveAdmin(context.userId, "admin");
    return runAdminAction({
      admin,
      action: "appointment.update",
      resourceType: "appointment",
      mutate: async () => {
        const { data: before, error: readErr } = await supabaseAdmin
          .from("appointments")
          .select("id, status, payment_status, scheduled_at, appointment_date, clinic_id, doctor_id, fee, queue_number")
          .eq("id", data.appointmentId)
          .maybeSingle();
        if (readErr) throw new Error(readErr.message);
        if (!before) throw new Error("Appointment not found");

        if (data.patch.doctor_id && data.patch.doctor_id !== before.doctor_id) {
          const { data: doc, error } = await supabaseAdmin
            .from("doctor_details")
            .select("id")
            .eq("id", data.patch.doctor_id)
            .maybeSingle();
          if (error) throw new Error(error.message);
          if (!doc) throw new Error("Target doctor not found");
        }
        if (data.patch.clinic_id) {
          const { data: clinic, error } = await supabaseAdmin
            .from("clinics")
            .select("id, doctor_id")
            .eq("id", data.patch.clinic_id)
            .maybeSingle();
          if (error) throw new Error(error.message);
          if (!clinic) throw new Error("Clinic not found");
          const doctorId = data.patch.doctor_id ?? before.doctor_id;
          if (clinic.doctor_id !== doctorId) throw new Error("Clinic belongs to another doctor");
        }

        const patch: Record<string, unknown> = { ...data.patch };
        if (data.patch.payment_status === "paid" && !("paid_at" in patch)) patch.paid_at = new Date().toISOString();
        if (data.patch.status === "completed") patch.ended_at = new Date().toISOString();

        const { data: after, error } = await supabaseAdmin
          .from("appointments")
          .update(patch as never)
          .eq("id", data.appointmentId)
          .select("id, status, payment_status, scheduled_at, appointment_date, clinic_id, doctor_id, fee, queue_number")
          .maybeSingle();
        if (error) throw new Error(error.message);

        return {
          resourceId: data.appointmentId,
          summary: data.reason,
          metadata: { before: before as never, after: (after ?? null) as never },
          result: { ok: true as const, appointment: after },
        };
      },
    });
  });
