-- Push notification token storage on profiles.
--
-- The mobile clients register a push token here (Android already writes to
-- fcm_token; iOS will write once push registration is wired). A backend sender
-- reads this token to deliver notifications. push_platform disambiguates the
-- transport ('android'/'ios') for senders that need it.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS fcm_token text,
  ADD COLUMN IF NOT EXISTS push_platform text;
