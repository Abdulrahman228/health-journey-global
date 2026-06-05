-- Phase 6 — Add provider_error column to record Twilio API failures
ALTER TABLE public.masked_call_sessions
  ADD COLUMN IF NOT EXISTS provider_error TEXT;
