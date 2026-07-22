import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * Emergency Shift: delay a doctor's upcoming queue today and notify the patients.
 *
 * Bumps estimated_start_at by delayMinutes for every not-yet-served appointment
 * (status waiting/called) for this doctor **today**, then raises a high-priority
 * notification to each affected patient. Because useQueue subscribes to
 * postgres_changes on appointments, every patient's QueueMonitor updates
 * instantly — no extra broadcast required.
 *
 * Security: the caller must BE the doctor whose queue is shifted (verified from
 * the JWT), so no one can delay another doctor's patients.
 *
 * Scope note: this delays the doctor's upcoming appointments for today. If a
 * doctor runs multiple clinics on the same day, all of them shift; pass a
 * clinicId to restrict (not needed by the current single-session flow).
 */
export const triggerEmergencyShift = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: unknown) =>
    z
      .object({
        doctorId: z.string().uuid(),
        delayMinutes: z.number().int().min(1).max(240),
      })
      .parse(raw),
  )
  .handler(async ({ data, context }) => {
    // AUTHZ: caller must own this doctor_details row.
    const { data: caller } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!caller) throw new Error("Forbidden");
    const { data: dd } = await supabaseAdmin
      .from("doctor_details")
      .select("id")
      .eq("profile_id", caller.id)
      .maybeSingle();
    if (!dd || dd.id !== data.doctorId) {
      throw new Error("Forbidden: not your clinic queue");
    }

    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD (clinic day)
    const shiftMs = data.delayMinutes * 60_000;

    // Upcoming (not-yet-served) appointments for this doctor today.
    const { data: appts, error } = await supabaseAdmin
      .from("appointments")
      .select("id, patient_id, estimated_start_at")
      .eq("doctor_id", data.doctorId)
      .eq("appointment_date", today)
      .in("status", ["waiting", "called"]);
    if (error) throw new Error(error.message);
    if (!appts || appts.length === 0) return { ok: true as const, shifted: 0 };

    // Increment estimated_start_at by delayMinutes (fallback to now+delay if null).
    await Promise.all(
      appts.map((a) => {
        const base = a.estimated_start_at ? new Date(a.estimated_start_at).getTime() : Date.now();
        const next = new Date(base + shiftMs).toISOString();
        return supabaseAdmin
          .from("appointments")
          .update({ estimated_start_at: next })
          .eq("id", a.id);
      }),
    );

    // High-priority notification to each affected patient (deduped by patient).
    const patientProfileIds = Array.from(new Set(appts.map((a) => a.patient_id)));
    const { data: profs } = await supabaseAdmin
      .from("profiles")
      .select("id, user_id")
      .in("id", patientProfileIds);
    const userIdByProfile = new Map((profs ?? []).map((p) => [p.id, p.user_id]));

    const body = `تنبيه طوارئ: تم ترحيل مواعيد العيادة لمدة ${data.delayMinutes} دقيقة بسبب حالة طارئة، نعتذر عن التأخير`;
    const rows = patientProfileIds
      .map((pid) => userIdByProfile.get(pid))
      .filter((uid): uid is string => Boolean(uid))
      .map((uid) => ({
        user_id: uid,
        kind: "emergency_shift",
        title: "تنبيه طوارئ - ترحيل المواعيد",
        body,
        link: "/appointments",
        metadata: { priority: "high", delay_minutes: data.delayMinutes },
      }));
    if (rows.length) {
      await supabaseAdmin.from("notifications").insert(rows);
    }

    return { ok: true as const, shifted: appts.length };
  });
