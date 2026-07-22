import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * Emergency triage for a freshly-booked appointment.
 *
 * When the patient flagged the booking as an emergency, this marks
 * appointments.is_emergency = true and raises a high-priority notification to
 * the doctor so the dashboard can surface a red alert.
 *
 * Called (non-blocking) right after book_queue_appointment succeeds. Runs with
 * the service role but verifies the CALLER owns the appointment (is the
 * patient), so it can't be used to spam doctors or flag others' bookings.
 */
export const handleEmergencyBooking = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z.object({ appointmentId: z.string().uuid(), isEmergency: z.boolean() }).parse(raw),
  )
  .handler(async ({ data, context }) => {
    if (!data.isEmergency) return { ok: true as const, emergency: false };
    const { appointmentId } = data;

    // 1) Load the appointment.
    const { data: appt, error: apptErr } = await supabaseAdmin
      .from("appointments")
      .select("id, doctor_id, patient_id")
      .eq("id", appointmentId)
      .maybeSingle();
    if (apptErr) throw new Error(apptErr.message);
    if (!appt) throw new Error("Appointment not found");

    // 2) Ownership: the caller must be the patient on this appointment.
    const { data: caller } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!caller || caller.id !== appt.patient_id) {
      throw new Error("Forbidden: not your appointment");
    }

    // 3) Flag the appointment.
    const { error: updErr } = await supabaseAdmin
      .from("appointments")
      .update({ is_emergency: true })
      .eq("id", appointmentId);
    if (updErr) throw new Error(updErr.message);

    // 4) Resolve the doctor's auth id (notifications.user_id is the auth uid).
    const { data: dd } = await supabaseAdmin
      .from("doctor_details")
      .select("profile_id")
      .eq("id", appt.doctor_id)
      .maybeSingle();
    if (dd?.profile_id) {
      const { data: docProfile } = await supabaseAdmin
        .from("profiles")
        .select("user_id")
        .eq("id", dd.profile_id)
        .maybeSingle();
      const doctorUserId = docProfile?.user_id ?? dd.profile_id;

      // Guard: skip if an emergency_alert for THIS appointment already exists.
      const { data: existing } = await supabaseAdmin
        .from("notifications")
        .select("id, metadata")
        .eq("user_id", doctorUserId)
        .eq("kind", "emergency_alert")
        .order("created_at", { ascending: false })
        .limit(100);
      const alreadyAlerted = (existing ?? []).some(
        (n) =>
          (n.metadata as unknown as { appointment_id?: string } | null)?.appointment_id ===
          appointmentId,
      );

      if (!alreadyAlerted) {
        await supabaseAdmin.from("notifications").insert({
          user_id: doctorUserId,
          kind: "emergency_alert",
          title: "حالة طارئة - مريض يحتاج اهتماماً عاجلاً!",
          body: "تم تصنيف هذا الحجز كحالة طارئة، يرجى التواصل مع المريض فوراً",
          link: "/dashboard",
          metadata: { priority: "high", appointment_id: appointmentId },
        });
      }
    }

    return { ok: true as const, emergency: true };
  });
