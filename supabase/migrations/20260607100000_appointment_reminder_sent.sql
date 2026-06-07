-- Track when reminder emails are sent to prevent duplicate sends from
-- the Cloudflare scheduled cron handler.
--
-- The cron runs hourly and looks for confirmed appointments scheduled
-- ~24h ahead with reminder_email_sent_at IS NULL, sends, then stamps
-- the column to mark the appointment as reminded.

ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS reminder_email_sent_at TIMESTAMPTZ NULL;

-- Partial index speeds up the hourly cron query: only matters while NULL.
CREATE INDEX IF NOT EXISTS appointments_reminder_pending_idx
  ON public.appointments (scheduled_at)
  WHERE reminder_email_sent_at IS NULL;

COMMENT ON COLUMN public.appointments.reminder_email_sent_at IS
  'When the 24h-ahead reminder email was sent to the patient. NULL = not yet sent. Set by the scheduled cron handler in src/lib/cron/appointment-reminders.ts.';
