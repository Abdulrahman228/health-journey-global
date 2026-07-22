import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * Automated Follow-up Reminder System (daily).
 *
 * For every completed visit whose day is EXACTLY the doctor's
 * followup_period_days ago — and where the patient has NOT re-booked with that
 * doctor and no reminder was already sent — inserts an in-app notification that
 * deep-links to the doctor's booking page.
 *
 * The heavy patient-discovery logic (per-doctor relative date + the two
 * NOT-EXISTS guards) lives in the SQL function get_due_followup_reminders();
 * this job just fans the results out into notifications.
 *
 * Cadence: the Worker cron fires hourly, so we self-gate to run once per day
 * (08:00 UTC). Even if that gate were removed, the SQL dedupe (one reminder per
 * appointment) prevents duplicates.
 *
 * Push note: FCM/push is not wired in this codebase, so the notifications row IS
 * the delivery — it surfaces in the dashboard NotificationBell in realtime. Once
 * push is integrated, this is the natural place to also enqueue a device push.
 */
export async function runFollowupReminders(opts: {
  scheduledTime: number;
}): Promise<{ ran: boolean; sent: number; errors: string[] }> {
  const result = { ran: false, sent: 0, errors: [] as string[] };

  // Daily gate: only act on the 08:00 UTC tick of the hourly cron.
  if (new Date(opts.scheduledTime).getUTCHours() !== 8) return result;
  result.ran = true;

  const { data: due, error } = await supabaseAdmin.rpc("get_due_followup_reminders");
  if (error) {
    result.errors.push(`discovery_failed: ${error.message}`);
    return result;
  }

  const rows = due ?? [];
  if (rows.length === 0) return result;

  const notifications = rows
    .filter((r) => Boolean(r.patient_user_id))
    .map((r) => {
      const name = (r.doctor_name ?? "").trim() || "طبيبك";
      return {
        user_id: r.patient_user_id,
        kind: "followup_reminder",
        title: "متابعة طبية - طبيبك بانتظارك",
        body: `لقد حان وقت متابعة حالتك الطبية مع دكتور ${name}. احجز موعدك الآن لضمان صحتك.`,
        // Deep-link to the doctor's booking page.
        link: `/doctor/${r.doctor_id}`,
        metadata: { appointment_id: r.appointment_id, doctor_id: r.doctor_id },
      };
    });

  if (notifications.length === 0) return result;

  // Insert in one batch; on failure, retry row-by-row so one bad row can't drop
  // the whole day's reminders.
  const { error: insErr } = await supabaseAdmin.from("notifications").insert(notifications);
  if (!insErr) {
    result.sent = notifications.length;
    return result;
  }

  for (const row of notifications) {
    const { error: rowErr } = await supabaseAdmin.from("notifications").insert(row);
    if (rowErr) result.errors.push(`${row.metadata.appointment_id}: ${rowErr.message}`);
    else result.sent += 1;
  }

  return result;
}
