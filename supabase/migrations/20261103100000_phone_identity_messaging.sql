-- ============================================================================
-- Phone-first identity + unified outbound messaging (2026-11-03)
--
-- What this adds
--   §0  normalize_phone(text)              – one canonical E.164 form (+20…)
--   §1  profiles.phone_e164 / user_contacts.phone_e164 (generated, indexed)
--   §2  messaging_opt_outs                 – "إلغاء" / STOP list, all channels
--   §3  outbox_messages                    – every outbound SMS/WhatsApp goes
--                                            through this queue (audit + retry)
--   §4  enqueue helpers + daily cap + dedupe
--   §5  AUTOMATIC patient notification: linking a patient to a doctor
--       (doctor_patients INSERT, or legacy profiles.managed_by_doctor INSERT)
--       queues one welcome message with the patient's personal claim link.
--   §6  adopt_managed_profile_by_phone()   – a patient who signs up with the
--       SAME verified phone number inherits the doctor-created profile
--       automatically (no token needed; the token link still works).
--   §7  claim_managed_profile() made idempotent for the owner.
--   §8  Doctors get an in-app notification when their patient completes
--       registration.
--   §9  Worker RPCs for the send-outbox edge function (service role only)
--   §10 pg_cron job (only if pg_cron + pg_net are enabled) that drains the
--       outbox every minute through the edge function.
--
-- Idempotent: safe to re-run. One transaction.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- §0 Phone normalisation (IMMUTABLE so it can back a generated column)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.normalize_phone(p_raw text)
RETURNS text
LANGUAGE plpgsql IMMUTABLE STRICT PARALLEL SAFE
AS $$
DECLARE
  v text;
BEGIN
  -- Arabic-Indic (٠١٢٣٤٥٦٧٨٩) and Eastern Arabic-Indic (۰۱۲۳۴۵۶۷۸۹) digits → ASCII
  v := translate(p_raw, '٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹', '01234567890123456789');
  -- keep digits and a leading plus only
  v := regexp_replace(v, '[^0-9+]', '', 'g');
  IF left(v, 1) = '+' THEN
    v := '+' || replace(substr(v, 2), '+', '');
  ELSE
    v := replace(v, '+', '');
  END IF;
  IF v = '' OR v = '+' THEN RETURN NULL; END IF;

  IF v LIKE '00%' THEN
    v := '+' || substr(v, 3);
  ELSIF v LIKE '+%' THEN
    v := v;
  ELSIF v ~ '^0(10|11|12|15)[0-9]{8}$' THEN        -- Egyptian local mobile 01X XXXX XXXX
    v := '+20' || substr(v, 2);
  ELSIF v ~ '^(10|11|12|15)[0-9]{8}$' THEN          -- Egyptian mobile without the 0
    v := '+20' || v;
  ELSIF v ~ '^20(10|11|12|15)[0-9]{8}$' THEN        -- 20 1X XXXX XXXX (as Supabase Auth stores it)
    v := '+' || v;
  ELSIF v ~ '^[1-9][0-9]{7,14}$' THEN               -- other international without plus
    v := '+' || v;
  ELSE
    RETURN NULL;
  END IF;

  IF v !~ '^\+[1-9][0-9]{7,14}$' THEN RETURN NULL; END IF;
  RETURN v;
END;
$$;

COMMENT ON FUNCTION public.normalize_phone(text) IS
  'Canonical E.164 (+20…) for Egyptian/international numbers; NULL when not a usable number.';

-- ----------------------------------------------------------------------------
-- §1 Canonical phone columns, maintained by a BEFORE trigger that runs AFTER
--    the column-guard triggers (trigger names sort alphabetically). A plain
--    column (not GENERATED) so the existing jsonb_populate_record guards and
--    the mobile app's inserts keep working unchanged.
-- ----------------------------------------------------------------------------
ALTER TABLE public.profiles      ADD COLUMN IF NOT EXISTS phone_e164 text;
ALTER TABLE public.user_contacts ADD COLUMN IF NOT EXISTS phone_e164 text;

CREATE OR REPLACE FUNCTION public.set_phone_e164()
RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  NEW.phone_e164 := public.normalize_phone(NEW.phone);
  RETURN NEW;
END; $$;

-- Fires on phone_e164 too, so a client can never desync the canonical value.
DROP TRIGGER IF EXISTS trg_zz_profiles_phone_e164 ON public.profiles;
CREATE TRIGGER trg_zz_profiles_phone_e164
  BEFORE INSERT OR UPDATE OF phone, phone_e164 ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.set_phone_e164();

DROP TRIGGER IF EXISTS trg_zz_user_contacts_phone_e164 ON public.user_contacts;
CREATE TRIGGER trg_zz_user_contacts_phone_e164
  BEFORE INSERT OR UPDATE OF phone, phone_e164 ON public.user_contacts
  FOR EACH ROW EXECUTE FUNCTION public.set_phone_e164();

-- Backfill existing rows (privileged context: migration runs as postgres).
UPDATE public.profiles      SET phone_e164 = public.normalize_phone(phone)
 WHERE phone IS NOT NULL AND phone_e164 IS DISTINCT FROM public.normalize_phone(phone);
UPDATE public.user_contacts SET phone_e164 = public.normalize_phone(phone)
 WHERE phone IS NOT NULL AND phone_e164 IS DISTINCT FROM public.normalize_phone(phone);

CREATE INDEX IF NOT EXISTS idx_profiles_phone_e164
  ON public.profiles (phone_e164) WHERE phone_e164 IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_user_contacts_phone_e164
  ON public.user_contacts (phone_e164) WHERE phone_e164 IS NOT NULL;

-- ----------------------------------------------------------------------------
-- §2 Opt-outs ("إلغاء" / STOP). Checked before every enqueue and every send.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.messaging_opt_outs (
  phone_e164  text PRIMARY KEY,
  channel     text NOT NULL DEFAULT 'all' CHECK (channel IN ('all','sms','whatsapp')),
  reason      text,
  source      text,                                  -- 'inbound_reply' | 'admin' | 'patient_settings'
  created_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.messaging_opt_outs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS optout_admin_all ON public.messaging_opt_outs;
CREATE POLICY optout_admin_all ON public.messaging_opt_outs
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- A logged-in user may opt their OWN verified phone in/out from settings.
CREATE OR REPLACE FUNCTION public.set_my_messaging_opt_out(p_opt_out boolean)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
DECLARE v_phone text;
BEGIN
  -- Only a phone that Supabase Auth VERIFIED (user_contacts is self-writable and
  -- must never be able to opt someone else's number out or un-opt it).
  SELECT public.normalize_phone('+' || u.phone) INTO v_phone
    FROM auth.users u
   WHERE u.id = auth.uid() AND u.phone IS NOT NULL AND u.phone_confirmed_at IS NOT NULL;
  IF v_phone IS NULL THEN RAISE EXCEPTION 'no_verified_phone'; END IF;
  IF p_opt_out THEN
    INSERT INTO public.messaging_opt_outs (phone_e164, channel, reason, source)
    VALUES (v_phone, 'all', 'user_request', 'patient_settings')
    ON CONFLICT (phone_e164) DO NOTHING;
  ELSE
    DELETE FROM public.messaging_opt_outs WHERE phone_e164 = v_phone;
  END IF;
END; $$;
REVOKE EXECUTE ON FUNCTION public.set_my_messaging_opt_out(boolean) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.set_my_messaging_opt_out(boolean) TO authenticated;

-- ----------------------------------------------------------------------------
-- §3 Outbox — the single queue for outbound SMS / WhatsApp
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.outbox_messages (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  channel              text NOT NULL DEFAULT 'auto' CHECK (channel IN ('auto','whatsapp','sms')),
  to_phone             text NOT NULL,                       -- E.164
  template_key         text NOT NULL,                       -- 'patient_welcome' | 'otp' | 'appointment_reminder' …
  params               jsonb NOT NULL DEFAULT '{}'::jsonb,  -- template variables (never secrets / OTP codes)
  locale               text NOT NULL DEFAULT 'ar',
  status               text NOT NULL DEFAULT 'queued'
                         CHECK (status IN ('queued','sending','sent','delivered','failed','skipped')),
  provider             text,                                -- 'whatsapp' | 'twilio' …
  provider_message_id  text,
  provider_status      text,
  error                text,
  attempts             int  NOT NULL DEFAULT 0,
  max_attempts         int  NOT NULL DEFAULT 5,
  next_attempt_at      timestamptz NOT NULL DEFAULT now(),
  dedupe_key           text,
  doctor_profile_id    uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  patient_profile_id   uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  consent_basis        text,                                -- 'doctor_attested' | 'patient_request' | 'transactional'
  created_at           timestamptz NOT NULL DEFAULT now(),
  claimed_at           timestamptz,                        -- set when a worker picks the row
  sent_at              timestamptz,
  delivered_at         timestamptz
);
ALTER TABLE public.outbox_messages ADD COLUMN IF NOT EXISTS claimed_at timestamptz;
CREATE UNIQUE INDEX IF NOT EXISTS uq_outbox_dedupe
  ON public.outbox_messages (dedupe_key) WHERE dedupe_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_outbox_due
  ON public.outbox_messages (next_attempt_at) WHERE status = 'queued';
CREATE INDEX IF NOT EXISTS idx_outbox_doctor_day
  ON public.outbox_messages (doctor_profile_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_outbox_patient
  ON public.outbox_messages (patient_profile_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_outbox_provider_msg
  ON public.outbox_messages (provider_message_id) WHERE provider_message_id IS NOT NULL;

ALTER TABLE public.outbox_messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS outbox_admin_all ON public.outbox_messages;
CREATE POLICY outbox_admin_all ON public.outbox_messages
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
DROP POLICY IF EXISTS outbox_doctor_read_own ON public.outbox_messages;
CREATE POLICY outbox_doctor_read_own ON public.outbox_messages
  FOR SELECT TO authenticated
  USING (doctor_profile_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()));
-- Writes happen only through SECURITY DEFINER helpers / the service role.

-- ----------------------------------------------------------------------------
-- §4 Enqueue helpers
-- ----------------------------------------------------------------------------
-- Internal: get (or create) a live claim token for an UNCLAIMED managed patient.
CREATE OR REPLACE FUNCTION public._claim_token_for(p_patient_profile_id uuid, p_doctor_profile_id uuid)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_token text;
BEGIN
  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = p_patient_profile_id AND user_id IS NOT NULL) THEN
    RETURN NULL; -- already a real account
  END IF;
  SELECT token INTO v_token FROM public.patient_claims
   WHERE patient_profile_id = p_patient_profile_id AND used_at IS NULL AND expires_at > now()
   ORDER BY created_at DESC LIMIT 1;
  IF v_token IS NULL THEN
    v_token := replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');
    INSERT INTO public.patient_claims (patient_profile_id, doctor_profile_id, token, expires_at)
    VALUES (p_patient_profile_id, p_doctor_profile_id, v_token, now() + interval '30 days');
  END IF;
  RETURN v_token;
END; $$;
REVOKE EXECUTE ON FUNCTION public._claim_token_for(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- Internal: enqueue one message. Returns the outbox id, or NULL when skipped
-- (bad phone, opted out, duplicate dedupe_key, daily cap). Never raises.
CREATE OR REPLACE FUNCTION public.enqueue_outbox(
  p_to_phone      text,
  p_template_key  text,
  p_params        jsonb DEFAULT '{}'::jsonb,
  p_channel       text  DEFAULT 'auto',
  p_dedupe_key    text  DEFAULT NULL,
  p_doctor        uuid  DEFAULT NULL,
  p_patient       uuid  DEFAULT NULL,
  p_consent_basis text  DEFAULT NULL,
  p_daily_cap     int   DEFAULT 300
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_phone text := public.normalize_phone(p_to_phone);
  v_id    uuid;
  v_today int;
BEGIN
  IF v_phone IS NULL THEN RETURN NULL; END IF;
  IF EXISTS (SELECT 1 FROM public.messaging_opt_outs o
              WHERE o.phone_e164 = v_phone AND (o.channel = 'all' OR o.channel = p_channel)) THEN
    RETURN NULL;
  END IF;
  IF p_doctor IS NOT NULL AND p_daily_cap IS NOT NULL THEN
    SELECT count(*) INTO v_today FROM public.outbox_messages
     WHERE doctor_profile_id = p_doctor AND created_at >= date_trunc('day', now());
    IF v_today >= p_daily_cap THEN RETURN NULL; END IF;
  END IF;

  INSERT INTO public.outbox_messages
    (channel, to_phone, template_key, params, dedupe_key, doctor_profile_id, patient_profile_id, consent_basis)
  VALUES
    (coalesce(p_channel, 'auto'), v_phone, p_template_key, coalesce(p_params, '{}'::jsonb),
     p_dedupe_key, p_doctor, p_patient, p_consent_basis)
  ON CONFLICT (dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING
  RETURNING id INTO v_id;
  RETURN v_id;
END; $$;
REVOKE EXECUTE ON FUNCTION public.enqueue_outbox(text,text,jsonb,text,text,uuid,uuid,text,int) FROM PUBLIC, anon, authenticated;

-- Internal: queue the "you were registered by Dr X" welcome for one link.
CREATE OR REPLACE FUNCTION public._enqueue_patient_welcome(
  p_doctor_profile_id uuid,
  p_patient_profile_id uuid,
  p_dedupe_key text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_patient  record;
  v_doctor   record;
  v_token    text;
BEGIN
  SELECT id, full_name, phone_e164, user_id INTO v_patient
    FROM public.profiles WHERE id = p_patient_profile_id;
  IF v_patient.id IS NULL OR v_patient.user_id IS NOT NULL OR v_patient.phone_e164 IS NULL THEN
    RETURN NULL;                         -- real account already / no usable phone
  END IF;
  SELECT id, full_name INTO v_doctor FROM public.profiles WHERE id = p_doctor_profile_id;
  IF v_doctor.id IS NULL THEN RETURN NULL; END IF;

  v_token := public._claim_token_for(p_patient_profile_id, p_doctor_profile_id);
  IF v_token IS NULL THEN RETURN NULL; END IF;

  RETURN public.enqueue_outbox(
    v_patient.phone_e164,
    'patient_welcome',
    jsonb_build_object(
      'doctor_name',  coalesce(nullif(trim(v_doctor.full_name), ''), 'طبيبك'),
      'patient_name', coalesce(nullif(trim(v_patient.full_name), ''), ''),
      'claim_token',  v_token
    ),
    'auto',
    coalesce(p_dedupe_key, 'welcome:' || p_doctor_profile_id || ':' || p_patient_profile_id),
    p_doctor_profile_id,
    p_patient_profile_id,
    'doctor_attested',
    300
  );
END; $$;
REVOKE EXECUTE ON FUNCTION public._enqueue_patient_welcome(uuid, uuid, text) FROM PUBLIC, anon, authenticated;

-- Doctor-facing: (re)send the invite to one of MY unclaimed patients.
-- Allowed once per patient per day (dedupe on the date) — prevents spamming.
CREATE OR REPLACE FUNCTION public.request_patient_invite(p_patient_profile_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_doctor uuid;
  v_id     uuid;
  v_pat    record;
BEGIN
  SELECT id INTO v_doctor FROM public.profiles WHERE user_id = auth.uid();
  IF v_doctor IS NULL THEN RAISE EXCEPTION 'no_profile'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'doctor') THEN
    RAISE EXCEPTION 'not_a_doctor';
  END IF;
  IF NOT EXISTS (
       SELECT 1 FROM public.doctor_patients dp
        WHERE dp.doctor_profile_id = v_doctor AND dp.patient_profile_id = p_patient_profile_id)
     AND NOT EXISTS (
       SELECT 1 FROM public.profiles p
        WHERE p.id = p_patient_profile_id AND p.managed_by_doctor = v_doctor) THEN
    RAISE EXCEPTION 'not_your_patient';
  END IF;

  SELECT user_id, phone_e164 INTO v_pat FROM public.profiles WHERE id = p_patient_profile_id;
  IF v_pat.user_id IS NOT NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'already_registered'); END IF;
  IF v_pat.phone_e164 IS NULL  THEN RETURN jsonb_build_object('ok', false, 'error', 'no_phone'); END IF;
  IF EXISTS (SELECT 1 FROM public.messaging_opt_outs WHERE phone_e164 = v_pat.phone_e164) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'opted_out');
  END IF;

  IF (SELECT count(*) FROM public.outbox_messages
       WHERE doctor_profile_id = v_doctor AND created_at >= date_trunc('day', now())) >= 300 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'daily_cap');
  END IF;
  v_id := public._enqueue_patient_welcome(
            v_doctor, p_patient_profile_id,
            'invite:' || v_doctor || ':' || p_patient_profile_id || ':' || to_char(now(), 'YYYY-MM-DD'));
  IF v_id IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'already_sent_today'); END IF;
  RETURN jsonb_build_object('ok', true, 'outbox_id', v_id);
END; $$;
REVOKE EXECUTE ON FUNCTION public.request_patient_invite(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.request_patient_invite(uuid) TO authenticated;

-- ----------------------------------------------------------------------------
-- §5 AUTOMATIC notification when a doctor registers a patient
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notify_patient_registered()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public._enqueue_patient_welcome(NEW.doctor_profile_id, NEW.patient_profile_id);
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Never let messaging break patient creation.
  RAISE WARNING 'notify_patient_registered failed: %', SQLERRM;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_notify_patient_registered ON public.doctor_patients;
CREATE TRIGGER trg_notify_patient_registered
  AFTER INSERT ON public.doctor_patients
  FOR EACH ROW EXECUTE FUNCTION public.notify_patient_registered();

-- Legacy path (profiles inserted with managed_by_doctor and no link row):
-- create the link, which fires the welcome above.
CREATE OR REPLACE FUNCTION public.link_managed_profile_on_insert()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.managed_by_doctor IS NOT NULL AND NEW.user_id IS NULL THEN
    INSERT INTO public.doctor_patients (doctor_profile_id, patient_profile_id)
    VALUES (NEW.managed_by_doctor, NEW.id)
    ON CONFLICT (doctor_profile_id, patient_profile_id) DO NOTHING;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_link_managed_profile_on_insert ON public.profiles;
CREATE TRIGGER trg_link_managed_profile_on_insert
  AFTER INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.link_managed_profile_on_insert();

-- ----------------------------------------------------------------------------
-- §6 Phone-based auto-claim: the person who verified this phone number owns
--     the managed profile(s) a doctor created with the same number.
-- ----------------------------------------------------------------------------
-- Does ANY table still reference this profile (beyond the bootstrap shells we
-- delete explicitly and the link/claim/queue tables we fold ourselves)?
-- Walks the catalog so a new FK can never be forgotten → a profile with lab
-- orders, posts, reviews, a doctor record… is never deleted.
CREATE OR REPLACE FUNCTION public._profile_has_data(p_profile uuid)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE r record; v boolean;
BEGIN
  FOR r IN
    SELECT c.conrelid::regclass AS tbl, a.attname AS col
      FROM pg_constraint c
      JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
     WHERE c.contype = 'f'
       AND c.confrelid = 'public.profiles'::regclass
       AND c.conrelid NOT IN ('public.doctor_patients'::regclass, 'public.patient_claims'::regclass,
                              'public.patient_details'::regclass, 'public.patient_medical_profile'::regclass,
                              'public.outbox_messages'::regclass)
  LOOP
    EXECUTE format('SELECT EXISTS (SELECT 1 FROM %s WHERE %I = $1)', r.tbl, r.col) INTO v USING p_profile;
    IF v THEN RETURN true; END IF;
  END LOOP;
  RETURN false;
END; $$;
REVOKE EXECUTE ON FUNCTION public._profile_has_data(uuid) FROM PUBLIC, anon, authenticated;

-- Internal: move a managed shell's doctor links + claims onto the real profile,
-- then drop the shell when nothing else references it.
CREATE OR REPLACE FUNCTION public._fold_managed_shell(p_shell uuid, p_target uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_shell = p_target THEN RETURN; END IF;
  INSERT INTO public.doctor_patients (doctor_profile_id, patient_profile_id)
  SELECT dp.doctor_profile_id, p_target FROM public.doctor_patients dp WHERE dp.patient_profile_id = p_shell
  ON CONFLICT (doctor_profile_id, patient_profile_id) DO NOTHING;
  UPDATE public.patient_claims SET used_at = now() WHERE patient_profile_id = p_shell AND used_at IS NULL;
  IF NOT public._profile_has_data(p_shell) THEN
    DELETE FROM public.doctor_patients         WHERE patient_profile_id = p_shell;
    DELETE FROM public.patient_claims          WHERE patient_profile_id = p_shell;
    DELETE FROM public.patient_details         WHERE profile_id = p_shell;
    DELETE FROM public.patient_medical_profile WHERE patient_profile_id = p_shell;
    DELETE FROM public.profiles                WHERE id = p_shell AND user_id IS NULL;
  END IF;
END; $$;
REVOKE EXECUTE ON FUNCTION public._fold_managed_shell(uuid, uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.adopt_managed_profile_by_phone()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, auth AS $$
DECLARE
  v_uid      uuid := auth.uid();
  v_phone    text;
  v_fresh    uuid;
  v_managed  uuid;
  v_shell    uuid;
  v_target   uuid;
  v_doctors  text[];
  v_adopted  boolean := false;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  -- Only a phone that Supabase Auth has VERIFIED (OTP done).
  SELECT public.normalize_phone('+' || u.phone) INTO v_phone
    FROM auth.users u
   WHERE u.id = v_uid AND u.phone IS NOT NULL AND u.phone_confirmed_at IS NOT NULL;
  IF v_phone IS NULL THEN
    RETURN jsonb_build_object('adopted', false, 'reason', 'no_verified_phone');
  END IF;

  SELECT id INTO v_fresh FROM public.profiles WHERE user_id = v_uid;

  -- Doctors never "adopt" patient shells: deleting a doctor's profile would
  -- cascade into their whole practice.
  IF EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = v_uid AND role IN ('doctor','admin','super_admin'))
     OR (v_fresh IS NOT NULL AND EXISTS (SELECT 1 FROM public.doctor_details WHERE profile_id = v_fresh)) THEN
    RETURN jsonb_build_object('adopted', false, 'reason', 'doctor_account');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE phone_e164 = v_phone AND user_id IS NULL) THEN
    RETURN jsonb_build_object('adopted', false, 'reason', 'no_managed_profile');
  END IF;

  IF v_fresh IS NOT NULL AND (public._profile_has_data(v_fresh)
                              OR EXISTS (SELECT 1 FROM public.doctor_patients WHERE patient_profile_id = v_fresh)) THEN
    -- The account already carries history: keep it, and fold EVERY same-phone
    -- shell into it (doctor links move over, empty shells disappear).
    v_target := v_fresh;
    FOR v_shell IN
      SELECT id FROM public.profiles WHERE phone_e164 = v_phone AND user_id IS NULL ORDER BY created_at
    LOOP
      PERFORM public._fold_managed_shell(v_shell, v_target);
    END LOOP;
  ELSE
    -- Fresh/empty account (or none): ADOPT the oldest shell — its id never
    -- changes, so every FK (appointments, records, results…) stays intact.
    SELECT id INTO v_managed FROM public.profiles
     WHERE phone_e164 = v_phone AND user_id IS NULL ORDER BY created_at ASC LIMIT 1;

    IF v_fresh IS NOT NULL THEN
      UPDATE public.profiles m
         SET full_name  = COALESCE(NULLIF(m.full_name, ''), f.full_name),
             city       = COALESCE(m.city, f.city),
             avatar_url = COALESCE(m.avatar_url, f.avatar_url)
        FROM public.profiles f
       WHERE m.id = v_managed AND f.id = v_fresh;
      DELETE FROM public.patient_details         WHERE profile_id = v_fresh;
      DELETE FROM public.patient_medical_profile WHERE patient_profile_id = v_fresh;
      DELETE FROM public.profiles                WHERE id = v_fresh;
    END IF;

    UPDATE public.profiles
       SET user_id = v_uid, managed_by_doctor = NULL, updated_at = now()
     WHERE id = v_managed;
    -- Mobile apps look patient_details up by user_id → attach the adopted row.
    UPDATE public.patient_details SET user_id = v_uid
     WHERE profile_id = v_managed AND user_id IS NULL;
    UPDATE public.patient_claims
       SET used_at = now(), used_by_user_id = v_uid
     WHERE patient_profile_id = v_managed AND used_at IS NULL;

    v_target := v_managed;
    v_adopted := true;
    FOR v_shell IN
      SELECT id FROM public.profiles WHERE phone_e164 = v_phone AND user_id IS NULL AND id <> v_managed ORDER BY created_at
    LOOP
      PERFORM public._fold_managed_shell(v_shell, v_target);
    END LOOP;
  END IF;

  SELECT array_agg(DISTINCT coalesce(nullif(trim(p.full_name), ''), 'طبيب')) INTO v_doctors
    FROM public.doctor_patients dp JOIN public.profiles p ON p.id = dp.doctor_profile_id
   WHERE dp.patient_profile_id = v_target;

  RETURN jsonb_build_object(
    'adopted', (v_adopted OR coalesce(cardinality(v_doctors), 0) > 0),
    'mode', CASE WHEN v_adopted THEN 'adopted' ELSE 'linked' END,
    'patient_profile_id', v_target,
    'doctors', to_jsonb(coalesce(v_doctors, ARRAY[]::text[])));
END; $$;
REVOKE EXECUTE ON FUNCTION public.adopt_managed_profile_by_phone() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.adopt_managed_profile_by_phone() TO authenticated;

-- add_managed_patient (mobile apps): dedupe on the CANONICAL phone and store it
-- normalised, so the web, the apps and the phone auto-claim all agree.
CREATE OR REPLACE FUNCTION public.add_managed_patient(
  p_full_name text,
  p_phone text DEFAULT NULL,
  p_city text DEFAULT NULL,
  p_dob date DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_doctor_profile uuid;
  v_patient        uuid;
  v_phone          text := nullif(trim(coalesce(p_phone, '')), '');
  v_e164           text := public.normalize_phone(p_phone);
BEGIN
  SELECT id INTO v_doctor_profile FROM public.profiles WHERE user_id = auth.uid();
  IF v_doctor_profile IS NULL THEN RAISE EXCEPTION 'no_profile'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'doctor'
  ) THEN RAISE EXCEPTION 'not_a_doctor'; END IF;
  IF coalesce(trim(p_full_name), '') = '' THEN RAISE EXCEPTION 'name_required'; END IF;

  IF v_e164 IS NOT NULL THEN
    SELECT id INTO v_patient
      FROM public.profiles
     WHERE phone_e164 = v_e164 AND user_id IS NULL
     ORDER BY created_at ASC
     LIMIT 1;
  END IF;

  IF v_patient IS NULL THEN
    INSERT INTO public.profiles (user_id, managed_by_doctor, full_name, phone, city)
    VALUES (NULL, v_doctor_profile, trim(p_full_name), coalesce(v_e164, v_phone),
            nullif(trim(coalesce(p_city, '')), ''))
    RETURNING id INTO v_patient;

    IF p_dob IS NOT NULL THEN
      INSERT INTO public.patient_details (profile_id, date_of_birth)
      VALUES (v_patient, p_dob);
    END IF;
  END IF;

  INSERT INTO public.doctor_patients (doctor_profile_id, patient_profile_id)
  VALUES (v_doctor_profile, v_patient)
  ON CONFLICT (doctor_profile_id, patient_profile_id) DO NOTHING;

  RETURN v_patient;
END; $$;
GRANT EXECUTE ON FUNCTION public.add_managed_patient(text, text, text, date) TO authenticated;

-- ----------------------------------------------------------------------------
-- §7 claim_managed_profile(): idempotent for the owner (the phone auto-claim
--     may already have adopted the profile before the token link is opened),
--     never deletes a profile that still has data, never runs for doctors.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.claim_managed_profile(p_token text)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_uid      uuid := auth.uid();
  v_managed  uuid;
  v_owner    uuid;
  v_fresh    uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'not_authenticated'; END IF;

  SELECT c.patient_profile_id, p.user_id INTO v_managed, v_owner
    FROM public.patient_claims c
    JOIN public.profiles p ON p.id = c.patient_profile_id
   WHERE c.token = p_token AND c.expires_at > now()
   ORDER BY c.created_at DESC LIMIT 1;
  IF v_managed IS NULL THEN RAISE EXCEPTION 'invalid_or_expired'; END IF;

  IF v_owner IS NOT NULL THEN
    IF v_owner = v_uid THEN RETURN v_managed; END IF;   -- already mine (phone auto-claim)
    RAISE EXCEPTION 'already_claimed';
  END IF;
  IF EXISTS (SELECT 1 FROM public.patient_claims WHERE token = p_token AND used_at IS NOT NULL) THEN
    RAISE EXCEPTION 'invalid_or_expired';
  END IF;

  SELECT id INTO v_fresh FROM public.profiles WHERE user_id = v_uid;

  IF EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = v_uid AND role IN ('doctor','admin','super_admin'))
     OR (v_fresh IS NOT NULL AND EXISTS (SELECT 1 FROM public.doctor_details WHERE profile_id = v_fresh)) THEN
    RAISE EXCEPTION 'doctor_account';
  END IF;

  IF v_fresh IS NOT NULL AND v_fresh <> v_managed THEN
    IF public._profile_has_data(v_fresh)
       OR EXISTS (SELECT 1 FROM public.doctor_patients WHERE patient_profile_id = v_fresh) THEN
      -- Keep the real account; attach the inviting doctor(s) to it instead.
      -- (Returning, not raising: an exception would roll the fold back.)
      PERFORM public._fold_managed_shell(v_managed, v_fresh);
      RETURN v_fresh;
    END IF;

    UPDATE public.profiles m
       SET full_name = COALESCE(NULLIF(m.full_name, ''), f.full_name),
           city      = COALESCE(m.city, f.city)
      FROM public.profiles f
     WHERE m.id = v_managed AND f.id = v_fresh;

    DELETE FROM public.patient_details         WHERE profile_id = v_fresh;
    DELETE FROM public.patient_medical_profile WHERE patient_profile_id = v_fresh;
    DELETE FROM public.profiles                WHERE id = v_fresh;
  END IF;

  UPDATE public.profiles
     SET user_id = v_uid, managed_by_doctor = NULL, updated_at = now()
   WHERE id = v_managed;
  UPDATE public.patient_details SET user_id = v_uid
   WHERE profile_id = v_managed AND user_id IS NULL;

  UPDATE public.patient_claims
     SET used_at = now(), used_by_user_id = v_uid
   WHERE patient_profile_id = v_managed AND used_at IS NULL;

  RETURN v_managed;
END; $$;
GRANT EXECUTE ON FUNCTION public.claim_managed_profile(text) TO authenticated;

-- ----------------------------------------------------------------------------
-- §8 Tell the doctor(s) when their patient completes registration
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.notify_doctors_patient_claimed()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record;
BEGIN
  IF OLD.user_id IS NULL AND NEW.user_id IS NOT NULL THEN
    FOR r IN
      SELECT DISTINCT d.user_id AS doctor_user_id
        FROM public.doctor_patients dp
        JOIN public.profiles d ON d.id = dp.doctor_profile_id
       WHERE dp.patient_profile_id = NEW.id AND d.user_id IS NOT NULL
    LOOP
      INSERT INTO public.notifications (user_id, kind, title, body, link, metadata)
      VALUES (r.doctor_user_id, 'patient_claimed',
              'أكمل مريضك تسجيله',
              coalesce(nullif(NEW.full_name, ''), 'مريض') || ' أنشأ حسابه على طبانا وأصبح ملفه متصلاً بحسابه.',
              '/dashboard/patient/' || NEW.id,
              jsonb_build_object('patient_profile_id', NEW.id));
    END LOOP;
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'notify_doctors_patient_claimed failed: %', SQLERRM;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_notify_doctors_patient_claimed ON public.profiles;
CREATE TRIGGER trg_notify_doctors_patient_claimed
  AFTER UPDATE OF user_id ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.notify_doctors_patient_claimed();

-- ----------------------------------------------------------------------------
-- §9 Worker RPCs (service role only) used by the send-outbox edge function
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.outbox_claim_batch(p_limit int DEFAULT 25)
RETURNS SETOF public.outbox_messages
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  -- Sweeper: a worker that died mid-batch (runtime kill, crash) leaves rows in
  -- 'sending'; give them back to the queue after 10 minutes.
  UPDATE public.outbox_messages
     SET status = 'queued', next_attempt_at = now()
   WHERE status = 'sending' AND claimed_at IS NOT NULL AND claimed_at < now() - interval '10 minutes';

  RETURN QUERY
  WITH picked AS (
    SELECT id FROM public.outbox_messages
     WHERE status = 'queued' AND next_attempt_at <= now()
     ORDER BY next_attempt_at ASC
     LIMIT greatest(1, least(coalesce(p_limit, 25), 100))
     FOR UPDATE SKIP LOCKED
  )
  UPDATE public.outbox_messages m
     SET status = 'sending', attempts = m.attempts + 1, claimed_at = now()
    FROM picked
   WHERE m.id = picked.id
  RETURNING m.*;
END; $$;

CREATE OR REPLACE FUNCTION public.outbox_mark(
  p_id uuid, p_status text, p_provider text DEFAULT NULL,
  p_provider_message_id text DEFAULT NULL, p_error text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_attempts int; v_max int;
BEGIN
  SELECT attempts, max_attempts INTO v_attempts, v_max FROM public.outbox_messages WHERE id = p_id;
  IF p_status = 'sent' THEN
    UPDATE public.outbox_messages
       SET status = 'sent', provider = p_provider, provider_message_id = p_provider_message_id,
           error = NULL, sent_at = now()
     WHERE id = p_id;
  ELSIF p_status = 'skipped' THEN
    UPDATE public.outbox_messages SET status = 'skipped', error = p_error WHERE id = p_id;
  ELSIF p_status = 'requeue' THEN
    -- Provider for this channel not configured yet: park without burning an attempt.
    UPDATE public.outbox_messages
       SET status = 'queued', attempts = greatest(0, attempts - 1), error = p_error,
           next_attempt_at = now() + interval '15 minutes'
     WHERE id = p_id;
  ELSE
    -- failed: retry with backoff until max_attempts
    IF v_attempts >= v_max THEN
      UPDATE public.outbox_messages SET status = 'failed', provider = coalesce(p_provider, provider), error = p_error WHERE id = p_id;
    ELSE
      UPDATE public.outbox_messages
         SET status = 'queued', provider = coalesce(p_provider, provider), error = p_error,
             next_attempt_at = now() + (interval '2 minutes' * power(2, v_attempts))
       WHERE id = p_id;
    END IF;
  END IF;
END; $$;

-- Opt-out from an inbound reply ("إلغاء"/STOP) — called by webhooks (service role).
CREATE OR REPLACE FUNCTION public.outbox_opt_out(p_phone text, p_channel text DEFAULT 'all', p_reason text DEFAULT 'inbound_reply')
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_phone text := public.normalize_phone(p_phone);
BEGIN
  IF v_phone IS NULL THEN RETURN; END IF;
  INSERT INTO public.messaging_opt_outs (phone_e164, channel, reason, source)
  VALUES (v_phone, coalesce(p_channel, 'all'), p_reason, 'inbound_reply')
  ON CONFLICT (phone_e164) DO UPDATE SET channel = 'all', reason = EXCLUDED.reason;
  UPDATE public.outbox_messages SET status = 'skipped', error = 'opted_out'
   WHERE to_phone = v_phone AND status = 'queued';
END; $$;

-- Delivery status from provider webhooks (service role).
CREATE OR REPLACE FUNCTION public.outbox_delivery_update(p_provider_message_id text, p_provider_status text)
RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  UPDATE public.outbox_messages
     SET provider_status = p_provider_status,
         status = CASE WHEN p_provider_status IN ('delivered','read') THEN 'delivered'
                       WHEN p_provider_status IN ('failed','undelivered') AND status IN ('sent','delivered') THEN 'failed'
                       ELSE status END,
         delivered_at = CASE WHEN p_provider_status IN ('delivered','read') THEN coalesce(delivered_at, now()) ELSE delivered_at END
   WHERE provider_message_id = p_provider_message_id;
$$;

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig FROM pg_proc p
     WHERE p.pronamespace = 'public'::regnamespace
       AND p.proname IN ('outbox_claim_batch','outbox_mark','outbox_opt_out','outbox_delivery_update',
                         'enqueue_outbox','_enqueue_patient_welcome','_claim_token_for')
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.sig);
  END LOOP;
END $$;

-- ----------------------------------------------------------------------------
-- §10 Drain the outbox every minute (only when pg_cron + pg_net are enabled;
--      the apply script enables them and stores the worker secret in Vault).
-- ----------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regnamespace('cron') IS NOT NULL AND to_regnamespace('net') IS NOT NULL THEN
    PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'outbox-drain';
    PERFORM cron.schedule(
      'outbox-drain',
      '* * * * *',
      $job$
      SELECT net.http_post(
        url     := 'https://wqrrwvaxovrjjiilqkmt.supabase.co/functions/v1/send-outbox',
        headers := jsonb_build_object(
                     'Content-Type', 'application/json',
                     'x-outbox-secret', coalesce((SELECT decrypted_secret FROM vault.decrypted_secrets
                                                   WHERE name = 'outbox_worker_secret' LIMIT 1), '')),
        body    := '{"limit":25}'::jsonb,
        timeout_milliseconds := 20000
      )
      WHERE EXISTS (SELECT 1 FROM public.outbox_messages WHERE status = 'queued' AND next_attempt_at <= now());
      $job$
    );
  ELSE
    RAISE NOTICE 'pg_cron/pg_net not enabled — outbox-drain job not scheduled (web/edge callers still drain on demand).';
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
