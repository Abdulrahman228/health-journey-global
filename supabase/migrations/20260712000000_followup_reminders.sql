-- ============================================================================
-- Automated Follow-up Reminders · patient-discovery query
--
-- Returns the appointments that are due for a follow-up reminder TODAY:
--   * status = 'completed'
--   * the visit day is EXACTLY that doctor's followup_period_days ago
--   * the patient has NOT re-booked with this doctor since the visit
--   * no follow-up reminder was already sent for this visit (one per visit)
--
-- SECURITY DEFINER so the cron (service role) can read across patients/doctors.
-- Idempotent (CREATE OR REPLACE).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_due_followup_reminders()
RETURNS TABLE (
  appointment_id uuid,
  patient_user_id uuid,
  doctor_id uuid,
  doctor_name text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    a.id            AS appointment_id,
    pp.user_id      AS patient_user_id,
    a.doctor_id     AS doctor_id,
    dp.full_name    AS doctor_name
  FROM public.appointments a
  JOIN public.doctor_details dd ON dd.id = a.doctor_id
  JOIN public.profiles       pp ON pp.id = a.patient_id
  JOIN public.profiles       dp ON dp.id = dd.profile_id
  WHERE a.status = 'completed'
    -- Visit day is exactly this doctor's follow-up window ago.
    AND COALESCE(a.appointment_date, (a.scheduled_at AT TIME ZONE 'UTC')::date)
        = current_date - dd.followup_period_days
    -- Patient has NOT re-booked with this doctor since the completed visit.
    AND NOT EXISTS (
      SELECT 1 FROM public.appointments b
      WHERE b.patient_id = a.patient_id
        AND b.doctor_id  = a.doctor_id
        AND b.id <> a.id
        AND b.scheduled_at > a.scheduled_at
        AND b.status <> 'cancelled'
    )
    -- Safety: only one reminder per completed visit (dedupe on appointment_id).
    AND NOT EXISTS (
      SELECT 1 FROM public.notifications n
      WHERE n.kind = 'followup_reminder'
        AND (n.metadata ->> 'appointment_id') = a.id::text
    );
$$;

GRANT EXECUTE ON FUNCTION public.get_due_followup_reminders() TO service_role;
