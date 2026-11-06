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
    if (!caller) throw new Error("غير مصرح");
    const { data: dd } = await supabaseAdmin
      .from("doctor_details")
      .select("id")
      .eq("profile_id", caller.id)
      .maybeSingle();
    if (!dd || dd.id !== data.doctorId) {
      throw new Error("غير مصرح: هذا ليس طابور عيادتك");
    }

    const shiftMs = data.delayMinutes * 60_000;

    // Clinic day in Egypt — not the UTC date. Egypt observes DST (UTC+3 in
    // summer, UTC+2 in winter), so read the live offset instead of hard-coding.
    const now = new Date();
    const cairoDay = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Cairo" }).format(now); // YYYY-MM-DD
    const offset = cairoUtcOffset(now);
    const dayStart = new Date(`${cairoDay}T00:00:00${offset}`).toISOString();
    const dayEnd = new Date(`${cairoDay}T23:59:59${offset}`).toISOString();

    // Upcoming (not-yet-served) appointments for this doctor today — same
    // window and statuses the live queue uses.
    const { data: appts, error } = await supabaseAdmin
      .from("appointments")
      .select("id, patient_id, estimated_start_at")
      .eq("doctor_id", data.doctorId)
      .gte("scheduled_at", dayStart)
      .lte("scheduled_at", dayEnd)
      .is("started_at", null)
      .in("status", ["waiting", "called", "pending", "confirmed"]);
    if (error) throw new Error("تعذّر تحميل مواعيد اليوم: " + error.message);
    if (!appts || appts.length === 0) return { ok: true as const, shifted: 0 };

    // Increment estimated_start_at by delayMinutes (fallback to now+delay if null).
    const results = await Promise.all(
      appts.map((a) => {
        const base = a.estimated_start_at ? new Date(a.estimated_start_at).getTime() : Date.now();
        const next = new Date(base + shiftMs).toISOString();
        return supabaseAdmin
          .from("appointments")
          .update({ estimated_start_at: next })
          .eq("id", a.id);
      }),
    );
    const failed = results.filter((r) => r.error).length;
    if (failed === appts.length) {
      throw new Error("تعذّر ترحيل المواعيد: " + (results[0].error?.message ?? ""));
    }

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
      const { error: notifErr } = await supabaseAdmin.from("notifications").insert(rows);
      if (notifErr) console.warn("[emergency-shift] patient notifications failed:", notifErr.message);
    }

    return { ok: true as const, shifted: appts.length - failed };
  });

/** "+02:00" / "+03:00" — Africa/Cairo's UTC offset at `at` (DST-aware). */
function cairoUtcOffset(at: Date): string {
  const name =
    new Intl.DateTimeFormat("en-US", { timeZone: "Africa/Cairo", timeZoneName: "longOffset" })
      .formatToParts(at)
      .find((p) => p.type === "timeZoneName")?.value ?? "GMT+02:00";
  const m = name.match(/GMT([+-]\d{2}):?(\d{2})?/);
  return m ? `${m[1]}:${m[2] ?? "00"}` : "+02:00";
}
