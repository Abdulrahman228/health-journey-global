import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const DAY_MS = 86_400_000;
const DEFAULT_FOLLOWUP_DAYS = 30;

/**
 * Classify a freshly-booked appointment as a follow-up "consultation" vs an
 * "initial checkup" (visit_type = 'follow_up' | 'first_visit'), based on the
 * doctor's configured follow-up window and the patient's last COMPLETED visit
 * with that doctor.
 *
 * Called (gracefully) right after book_queue_appointment succeeds. Runs with the
 * service role but first verifies the CALLER owns the appointment (is the
 * patient), so it can't be abused to spam doctor notifications or reclassify
 * other people's bookings.
 */
export const syncVisitType = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) => z.object({ appointmentId: z.string().uuid() }).parse(raw))
  .handler(async ({ data, context }) => {
    const { appointmentId } = data;

    // 1) Load the appointment.
    const { data: appt, error: apptErr } = await supabaseAdmin
      .from("appointments")
      .select("id, doctor_id, patient_id, scheduled_at, visit_type")
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

    // 3) Doctor's follow-up window (+ profile_id to resolve their auth id later).
    const { data: dd } = await supabaseAdmin
      .from("doctor_details")
      .select("followup_period_days, profile_id")
      .eq("id", appt.doctor_id)
      .maybeSingle();
    const followupPeriodDays = Number(dd?.followup_period_days ?? DEFAULT_FOLLOWUP_DAYS);

    // 4) Patient's last COMPLETED visit with THIS doctor (excluding this one).
    const { data: last } = await supabaseAdmin
      .from("appointments")
      .select("scheduled_at")
      .eq("doctor_id", appt.doctor_id)
      .eq("patient_id", appt.patient_id)
      .eq("status", "completed")
      .neq("id", appointmentId)
      .order("scheduled_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    // 5) Classify. No prior completed visit → first_visit (initial checkup).
    let visitType: "follow_up" | "first_visit" = "first_visit";
    if (last?.scheduled_at) {
      const daysElapsed =
        (new Date(appt.scheduled_at).getTime() - new Date(last.scheduled_at).getTime()) / DAY_MS;
      if (daysElapsed <= followupPeriodDays) visitType = "follow_up";
    }

    // 6) Persist.
    const { error: updErr } = await supabaseAdmin
      .from("appointments")
      .update({ visit_type: visitType })
      .eq("id", appointmentId);
    if (updErr) throw new Error(updErr.message);

    // 7) Notify the doctor on a follow-up, with a per-appointment duplicate guard.
    if (visitType === "follow_up" && dd?.profile_id) {
      const { data: docProfile } = await supabaseAdmin
        .from("profiles")
        .select("user_id")
        .eq("id", dd.profile_id)
        .maybeSingle();
      const doctorUserId = docProfile?.user_id ?? dd.profile_id;

      // Guard: skip if a booking_classification notice for THIS appointment exists.
      const { data: existing } = await supabaseAdmin
        .from("notifications")
        .select("id, metadata")
        .eq("user_id", doctorUserId)
        .eq("kind", "booking_classification")
        .order("created_at", { ascending: false })
        .limit(100);
      const alreadyNotified = (existing ?? []).some(
        (n) =>
          (n.metadata as unknown as { appointment_id?: string } | null)?.appointment_id ===
          appointmentId,
      );

      if (!alreadyNotified) {
        await supabaseAdmin.from("notifications").insert({
          user_id: doctorUserId,
          kind: "booking_classification",
          title: "تصنيف الحجز كاستشارة",
          body: "تنبيه: تم تصنيف الحجز كاستشارة بناءً على فترتك المحددة",
          link: "/dashboard",
          metadata: { appointment_id: appointmentId, visit_type: visitType },
        });
      }
    }

    return { ok: true as const, visitType };
  });

/**
 * Pre-booking PREVIEW of the visit type + fee for the current patient with a
 * given doctor, so the booking UI can show "نوع الحجز: كشف أول / استشارة" and the
 * matching fee BEFORE payment. This is a prediction (the appointment doesn't
 * exist yet); createAppointmentCheckout recomputes the fee authoritatively at
 * checkout. Fee robustness mirrors resolveVisitFeeMajor (follow-up fee only when
 * valid, else the full consultation fee).
 */
export const previewVisitPricing = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z.object({ doctorId: z.string().uuid(), scheduledAt: z.string().optional() }).parse(raw),
  )
  .handler(async ({ data, context }) => {
    const { data: caller } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("user_id", context.userId)
      .maybeSingle();

    const { data: dd } = await supabaseAdmin
      .from("doctor_details")
      .select("followup_period_days, consultation_fee")
      .eq("id", data.doctorId)
      .maybeSingle();
    const consultationFee = Number(dd?.consultation_fee ?? 0);
    const followupPeriodDays = Number(dd?.followup_period_days ?? DEFAULT_FOLLOWUP_DAYS);

    let visitType: "follow_up" | "first_visit" = "first_visit";
    if (caller) {
      const { data: last } = await supabaseAdmin
        .from("appointments")
        .select("scheduled_at")
        .eq("doctor_id", data.doctorId)
        .eq("patient_id", caller.id)
        .eq("status", "completed")
        .order("scheduled_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (last?.scheduled_at) {
        const ref = data.scheduledAt ? new Date(data.scheduledAt).getTime() : Date.now();
        const daysElapsed = (ref - new Date(last.scheduled_at).getTime()) / DAY_MS;
        if (daysElapsed <= followupPeriodDays) visitType = "follow_up";
      }
    }

    let fee = consultationFee;
    let followupFee: number | null = null;
    if (visitType === "follow_up") {
      const { data: fs } = await supabaseAdmin
        .from("doctor_followup_settings")
        .select("followup_fee")
        .eq("doctor_details_id", data.doctorId)
        .maybeSingle();
      const f = fs ? Number(fs.followup_fee) : NaN;
      if (Number.isFinite(f) && f >= 0) {
        followupFee = f;
        fee = f; // valid follow-up fee; else keep the full fee (protect revenue).
      }
    }

    return { visitType, fee, consultationFee, followupFee };
  });
