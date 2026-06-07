/**
 * Cron job: send appointment reminder emails ~24 hours before scheduled time.
 *
 * Triggered by Cloudflare's scheduled handler (hourly) — see src/server.ts.
 * Idempotent: each appointment row carries `reminder_email_sent_at` so a
 * given reminder fires exactly once even if the cron overlaps.
 *
 * Selection window: appointments scheduled between (now + 23h) and (now + 25h)
 * with status confirmed/booked AND payment_status paid AND reminder not yet sent.
 *
 * Performance: capped at 50 sends per run to stay within Worker CPU limits.
 * If your appointment volume exceeds 50/hour, switch to a Durable Object queue
 * or stagger by minute crons.
 */

import { supabaseAdmin } from "@/integrations/supabase/client.server";

const REMINDER_WINDOW_START_HOURS = 23;
const REMINDER_WINDOW_END_HOURS = 25;
const MAX_PER_RUN = 50;

const PAID_STATUSES = ["paid", "partially_refunded"] as const;
const ACTIVE_APPOINTMENT_STATUSES = ["confirmed", "booked", "scheduled"] as const;

export type CronRunResult = {
  scanned: number;
  sent: number;
  skipped: number;
  failed: number;
  errors: string[];
};

export async function runAppointmentReminders(opts: {
  scheduledTime?: number;
}): Promise<CronRunResult> {
  const now = opts.scheduledTime ? new Date(opts.scheduledTime) : new Date();
  const windowStart = new Date(now.getTime() + REMINDER_WINDOW_START_HOURS * 3600_000);
  const windowEnd = new Date(now.getTime() + REMINDER_WINDOW_END_HOURS * 3600_000);

  const result: CronRunResult = {
    scanned: 0,
    sent: 0,
    skipped: 0,
    failed: 0,
    errors: [],
  };

  // 1. Find candidates.
  const { data: candidates, error: queryError } = await supabaseAdmin
    .from("appointments")
    .select(
      "id, patient_id, doctor_id, scheduled_at, appointment_type, status, payment_status, clinic_id",
    )
    .gte("scheduled_at", windowStart.toISOString())
    .lte("scheduled_at", windowEnd.toISOString())
    .is("reminder_email_sent_at" as never, null) // column added by migration
    .in("status", ACTIVE_APPOINTMENT_STATUSES as unknown as string[])
    .in("payment_status", PAID_STATUSES as unknown as string[])
    .limit(MAX_PER_RUN);

  if (queryError) {
    result.errors.push(`select_failed: ${queryError.message}`);
    return result;
  }

  result.scanned = candidates?.length ?? 0;
  if (!candidates || candidates.length === 0) return result;

  // 2. Lazy-import email machinery (avoids cold-start cost on non-cron requests).
  const { sendEmail, isEmailEnabled } = await import("@/lib/email/sender");
  const { buildAppointmentReminderEmail } = await import(
    "@/lib/email/templates/appointment-reminder"
  );

  // If email isn't configured we just stamp `reminder_email_sent_at` so we
  // don't keep re-scanning the same rows; switching the key on later will
  // resume sending without backlog spam.
  if (!isEmailEnabled()) {
    const ids = candidates.map((a) => a.id as string);
    await supabaseAdmin
      .from("appointments")
      .update({ reminder_email_sent_at: now.toISOString() } as never)
      .in("id", ids);
    result.skipped = candidates.length;
    return result;
  }

  // 3. Process each candidate.
  for (const appt of candidates) {
    try {
      // Resolve patient profile + auth email + name.
      const { data: patientProfile } = await supabaseAdmin
        .from("profiles")
        .select("user_id, full_name")
        .eq("id", appt.patient_id as string)
        .maybeSingle();

      const userId = patientProfile?.user_id as string | undefined;
      if (!userId) {
        result.skipped += 1;
        await markSent(appt.id as string, now);
        continue;
      }

      const { data: authResult } =
        await supabaseAdmin.auth.admin.getUserById(userId);
      const email = authResult?.user?.email;
      if (!email) {
        result.skipped += 1;
        await markSent(appt.id as string, now);
        continue;
      }

      // Resolve doctor name + specialty.
      const { data: dd } = await supabaseAdmin
        .from("doctor_details")
        .select("profile_id, specialty")
        .eq("id", appt.doctor_id as string)
        .maybeSingle();

      let doctorName: string | null = null;
      if (dd?.profile_id) {
        const { data: dp } = await supabaseAdmin
          .from("profiles")
          .select("full_name")
          .eq("id", dd.profile_id as string)
          .maybeSingle();
        doctorName = (dp?.full_name as string | null) ?? null;
      }

      // Resolve clinic address (if in-person).
      let clinicAddress: string | null = null;
      if (appt.clinic_id) {
        const { data: clinic } = await supabaseAdmin
          .from("clinics")
          .select("name, address")
          .eq("id", appt.clinic_id as string)
          .maybeSingle();
        if (clinic) {
          const name = (clinic.name as string | null) ?? "";
          const address = (clinic.address as string | null) ?? "";
          clinicAddress = [name, address].filter(Boolean).join(" — ") || null;
        }
      }

      const { subject, html } = buildAppointmentReminderEmail({
        recipientName: (patientProfile?.full_name as string | null) ?? null,
        doctorName,
        doctorSpecialty: (dd?.specialty as string | null) ?? null,
        scheduledAt: appt.scheduled_at as string,
        appointmentType: (appt.appointment_type as string | null) ?? "in_person",
        appointmentId: appt.id as string,
        clinicAddress,
      });

      const sendResult = await sendEmail({
        to: email,
        subject,
        html,
        tags: [
          { name: "category", value: "appointment_reminder" },
          { name: "appointment_id", value: appt.id as string },
        ],
      });

      if (sendResult.ok) {
        result.sent += 1;
        await markSent(appt.id as string, now);
      } else if (sendResult.skipped) {
        // Should not happen here (we checked isEmailEnabled), but be defensive.
        result.skipped += 1;
      } else {
        result.failed += 1;
        result.errors.push(`${appt.id}: ${sendResult.error}`);
        // Don't stamp on hard failure — let next run retry.
      }
    } catch (err) {
      result.failed += 1;
      const msg = err instanceof Error ? err.message : String(err);
      result.errors.push(`${appt.id}: ${msg}`);
    }
  }

  return result;
}

async function markSent(appointmentId: string, when: Date): Promise<void> {
  await supabaseAdmin
    .from("appointments")
    .update({ reminder_email_sent_at: when.toISOString() } as never)
    .eq("id", appointmentId);
}
