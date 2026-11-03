-- ============================================================================
-- 2026-11-02 — Security hardening (audit of the LIVE project wqrrwvaxovrjjiilqkmt)
--
-- Every section is independent and idempotent (safe to re-run).
--
--   1. profiles      : patient rows (phone, fcm_token, medical card …) were
--                      readable WITHOUT login — profile_visibility defaults to
--                      'unlisted' and profiles_public_readable exposed
--                      public+unlisted rows. Doctors stay public; a patient row
--                      is now readable only by the patient, the doctors / labs
--                      who treat them, and admins. Community author names go
--                      through public_profile_cards() (name/avatar/city only).
--   2. v_clinic_queue : leaked patient_id to anonymous callers.
--   3. finance PIN    : doctor_details.finance_pin_hash was publicly readable
--                      (offline brute force of a short PIN). Moved to a locked
--                      table, owner-only verification, lockout after 5 failures.
--   4. appointments   : a patient could write payment columns directly
--                      (payment_status='paid', paid_at…) or set status
--                      'completed' (which posts revenue to the doctor ledger).
--   5. doctor_details : a doctor could self-set is_verified / is_pro /
--                      telemedicine_enabled / rating … with a direct update.
--   6. profiles       : status (ban flag) and ownership (user_id) guarded.
--   7. zero-argument RPCs were executable by anonymous callers.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 0. Shared helpers
-- ----------------------------------------------------------------------------

-- TRUE when the current writer is trusted: the service role, or no PostgREST
-- JWT at all (server functions, webhooks, cron, migrations, auth-admin
-- triggers), an admin, a trigger fired by another trigger (internal
-- bookkeeping such as rating recalculation), or an explicit per-transaction
-- bypass (SELECT set_config('app.privileged','on',true)).
-- NOTE: `anon` is deliberately NOT trusted — a future anon-writable policy
-- must still go through the guards.
CREATE OR REPLACE FUNCTION public._is_privileged_writer()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT coalesce(
           nullif(current_setting('request.jwt.claim.role', true), ''),
           nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
           ''
         ) IN ('', 'service_role')
      OR pg_trigger_depth() > 1
      OR coalesce(current_setting('app.privileged', true), '') = 'on'
      OR EXISTS (
           SELECT 1 FROM public.user_roles ur
            WHERE ur.user_id = auth.uid()
              AND ur.role::text IN ('admin', 'super_admin')
         );
$$;
REVOKE ALL ON FUNCTION public._is_privileged_writer() FROM PUBLIC, anon, authenticated;

-- Evaluates a column's DEFAULT expression and returns it as jsonb
-- ('null'::jsonb when the column has no default or does not exist).
CREATE OR REPLACE FUNCTION public._col_default_json(p_table regclass, p_col text)
RETURNS jsonb
LANGUAGE plpgsql STABLE SET search_path = public
AS $$
DECLARE
  v_expr text;
  v_val  jsonb;
BEGIN
  SELECT pg_get_expr(d.adbin, d.adrelid) INTO v_expr
    FROM pg_attribute a
    JOIN pg_attrdef   d ON d.adrelid = a.attrelid AND d.adnum = a.attnum
   WHERE a.attrelid = p_table AND a.attname = p_col AND NOT a.attisdropped;
  IF v_expr IS NULL THEN
    RETURN 'null'::jsonb;
  END IF;
  EXECUTE 'SELECT to_jsonb(' || v_expr || ')' INTO v_val;
  RETURN coalesce(v_val, 'null'::jsonb);
END;
$$;
REVOKE ALL ON FUNCTION public._col_default_json(regclass, text) FROM PUBLIC, anon, authenticated;


-- ----------------------------------------------------------------------------
-- 1. profiles — stop exposing patient rows to the public
-- ----------------------------------------------------------------------------

-- Who may read a given profile row (besides its owner and admins)?
CREATE OR REPLACE FUNCTION public.can_read_profile(p_profile_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    -- 1) Doctor profiles are public directory entries.
    EXISTS (SELECT 1 FROM public.doctor_details dd WHERE dd.profile_id = p_profile_id)
    -- 2) Care relationship: the caller is a doctor who treats this patient.
    OR EXISTS (
      SELECT 1
        FROM public.profiles me
       WHERE me.user_id = (SELECT auth.uid())
         AND (
              EXISTS (SELECT 1 FROM public.doctor_patients dp
                       WHERE dp.patient_profile_id = p_profile_id
                         AND dp.doctor_profile_id  = me.id)
           OR EXISTS (SELECT 1 FROM public.profiles pt
                       WHERE pt.id = p_profile_id
                         AND pt.managed_by_doctor = me.id)
           OR EXISTS (SELECT 1 FROM public.appointments a
                        JOIN public.doctor_details dd ON dd.id = a.doctor_id
                       WHERE a.patient_id = p_profile_id
                         AND dd.profile_id = me.id)
           OR EXISTS (SELECT 1 FROM public.consultation_requests cr
                        JOIN public.doctor_details dd ON dd.id = cr.doctor_details_id
                       WHERE cr.patient_id = p_profile_id
                         AND dd.profile_id = me.id)
           OR EXISTS (SELECT 1 FROM public.medical_records mr
                       WHERE mr.patient_profile_id = p_profile_id
                         AND mr.doctor_profile_id  = me.id)
         )
    )
    -- 3) Lab / radiology facility with an order for this patient.
    OR EXISTS (
      SELECT 1
        FROM public.lab_orders lo
        JOIN public.lab_facilities lf ON lf.id = lo.lab_id
       WHERE lo.patient_profile_id = p_profile_id
         AND lf.owner_user_id = auth.uid()
    );
$$;
GRANT EXECUTE ON FUNCTION public.can_read_profile(uuid) TO anon, authenticated;

DROP POLICY IF EXISTS "Profiles viewable by everyone"          ON public.profiles;
DROP POLICY IF EXISTS "Own profile or doctor profile viewable" ON public.profiles;
DROP POLICY IF EXISTS profiles_public_readable                ON public.profiles;
DROP POLICY IF EXISTS profiles_read_v2                        ON public.profiles;
CREATE POLICY profiles_read_v2 ON public.profiles
  FOR SELECT
  USING ((SELECT auth.uid()) = user_id OR public.can_read_profile(id));
-- ("admin read profiles" from 20260710000002 stays in place.)

-- Community feed: author cards (name / avatar / city ONLY) for post and reply
-- authors — replaces the direct profiles read in src/lib/feed.ts.
CREATE OR REPLACE FUNCTION public.public_profile_cards(p_ids uuid[])
RETURNS TABLE (id uuid, full_name text, avatar_url text, city text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT p.id, p.full_name, p.avatar_url, p.city
    FROM public.profiles p
   WHERE p.id = ANY (p_ids)
     AND (
          EXISTS (SELECT 1 FROM public.doctor_details dd WHERE dd.profile_id = p.id)
       OR EXISTS (SELECT 1 FROM public.posts        po WHERE po.author_profile_id = p.id)
       OR EXISTS (SELECT 1 FROM public.post_replies pr WHERE pr.author_profile_id = p.id)
     )
   LIMIT 200;
$$;
GRANT EXECUTE ON FUNCTION public.public_profile_cards(uuid[]) TO anon, authenticated;


-- ----------------------------------------------------------------------------
-- 2. v_clinic_queue — public queue board without patient identities
-- ----------------------------------------------------------------------------
DROP VIEW IF EXISTS public.v_clinic_queue;
CREATE VIEW public.v_clinic_queue AS
SELECT
  a.clinic_id,
  a.appointment_date,
  a.id              AS appointment_id,
  a.queue_number,
  a.status,
  a.estimated_start_at,
  a.called_at,
  a.started_at,
  a.ended_at
  FROM public.appointments a
 WHERE a.clinic_id IS NOT NULL
   AND a.queue_number IS NOT NULL
   AND a.status IN ('waiting', 'called', 'in_progress', 'completed');
GRANT SELECT ON public.v_clinic_queue TO anon, authenticated;


-- ----------------------------------------------------------------------------
-- 3. Finance PIN — private table + owner-only verification + lockout
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.doctor_finance_pins (
  doctor_details_id uuid PRIMARY KEY REFERENCES public.doctor_details(id) ON DELETE CASCADE,
  pin_hash          text NOT NULL,
  failed_attempts   integer NOT NULL DEFAULT 0,
  locked_until      timestamptz,
  updated_at        timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.doctor_finance_pins ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.doctor_finance_pins FROM PUBLIC, anon, authenticated;
-- No policies on purpose: only the SECURITY DEFINER functions below touch it.

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'doctor_details'
       AND column_name = 'finance_pin_hash'
  ) THEN
    INSERT INTO public.doctor_finance_pins (doctor_details_id, pin_hash)
    SELECT id, finance_pin_hash
      FROM public.doctor_details
     WHERE finance_pin_hash IS NOT NULL
    ON CONFLICT (doctor_details_id) DO NOTHING;

    ALTER TABLE public.doctor_details DROP COLUMN finance_pin_hash;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.set_finance_pin(p_doctor_id uuid, p_pin text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
BEGIN
  IF auth.uid() IS NULL OR auth.uid() NOT IN (
    SELECT p.user_id FROM public.doctor_details dd
    JOIN public.profiles p ON p.id = dd.profile_id
    WHERE dd.id = p_doctor_id
  ) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  IF p_pin IS NULL OR length(p_pin) < 4 OR length(p_pin) > 12 THEN
    RAISE EXCEPTION 'invalid_pin';
  END IF;

  INSERT INTO public.doctor_finance_pins (doctor_details_id, pin_hash, failed_attempts, locked_until, updated_at)
  VALUES (p_doctor_id, crypt(p_pin, gen_salt('bf')), 0, NULL, now())
  ON CONFLICT (doctor_details_id) DO UPDATE
     SET pin_hash        = EXCLUDED.pin_hash,
         failed_attempts = 0,
         locked_until    = NULL,
         updated_at      = now();
END;
$$;

CREATE OR REPLACE FUNCTION public.verify_finance_pin(p_doctor_id uuid, p_pin text)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE
  v    public.doctor_finance_pins%ROWTYPE;
  v_ok boolean;
BEGIN
  -- Only the doctor themself may verify their PIN (the old version let any
  -- logged-in user brute-force any doctor's PIN by id).
  IF auth.uid() IS NULL OR auth.uid() NOT IN (
    SELECT p.user_id FROM public.doctor_details dd
    JOIN public.profiles p ON p.id = dd.profile_id
    WHERE dd.id = p_doctor_id
  ) THEN
    RETURN false;
  END IF;

  SELECT * INTO v FROM public.doctor_finance_pins
   WHERE doctor_details_id = p_doctor_id FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  IF v.locked_until IS NOT NULL AND v.locked_until > now() THEN RETURN false; END IF;

  v_ok := (v.pin_hash = crypt(coalesce(p_pin, ''), v.pin_hash));

  IF v_ok THEN
    UPDATE public.doctor_finance_pins
       SET failed_attempts = 0, locked_until = NULL
     WHERE doctor_details_id = p_doctor_id;
  ELSE
    -- An expired lock starts a fresh window (counter → 1); the 5th failure
    -- inside a window locks for 15 minutes.
    UPDATE public.doctor_finance_pins
       SET failed_attempts = CASE WHEN locked_until IS NOT NULL AND locked_until <= now()
                                  THEN 1 ELSE failed_attempts + 1 END,
           locked_until    = CASE WHEN (CASE WHEN locked_until IS NOT NULL AND locked_until <= now()
                                             THEN 1 ELSE failed_attempts + 1 END) >= 5
                                  THEN now() + interval '15 minutes'
                                  ELSE NULL END
     WHERE doctor_details_id = p_doctor_id;
  END IF;
  RETURN v_ok;
END;
$$;

CREATE OR REPLACE FUNCTION public.has_finance_pin(p_doctor_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.doctor_finance_pins WHERE doctor_details_id = p_doctor_id);
$$;

REVOKE ALL ON FUNCTION public.set_finance_pin(uuid, text)    FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.verify_finance_pin(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.has_finance_pin(uuid)          FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_finance_pin(uuid, text)    TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.verify_finance_pin(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_finance_pin(uuid)          TO authenticated, service_role;


-- ----------------------------------------------------------------------------
-- 4. appointments — money + workflow columns are not patient-writable
-- ----------------------------------------------------------------------------
-- Rules (non-privileged writers only):
--   • the appointment's DOCTOR (taken from the STORED row on update) keeps
--     full control (cash clinic ledger);
--   • a PATIENT insert always starts unpaid, with no payment/refund/invoice/
--     queue-progress data and a status of pending/confirmed/waiting. `fee`,
--     `coupon_*`, `clinic_id` are intentionally left to the booking RPCs
--     (book_slot_appointment & co. run with the patient's JWT and compute
--     them — forcing them here would override those RPCs);
--   • a PATIENT update cannot touch money, parties, clinic, queue or visit
--     classification, and may only change status to 'cancelled'.
-- Columns are patched through jsonb so a column that does not exist on this
-- database is simply ignored instead of breaking every write.
CREATE OR REPLACE FUNCTION public.guard_appointment_writes()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_uid       uuid := auth.uid();
  v_is_doctor boolean := false;
  v_patch     jsonb := '{}'::jsonb;
  v_locked    text[] := ARRAY[
    'payment_status', 'paid_at', 'payment_intent_id', 'payment_environment',
    'refunded_amount', 'refunded_at', 'invoice_id', 'commission_cents',
    'consultation_fee_cents', 'fee', 'currency', 'coupon_code', 'coupon_discount',
    'doctor_id', 'patient_id', 'clinic_id', 'queue_number',
    'called_at', 'started_at', 'ended_at', 'visit_type'
  ];
  -- (is_emergency is NOT locked: flag_emergency_appointment() lets the patient
  --  flag their own appointment with their own JWT.)
BEGIN
  IF public._is_privileged_writer() THEN
    RETURN NEW;
  END IF;

  -- On UPDATE use the STORED doctor (OLD) — NEW.doctor_id is caller-supplied.
  -- (OLD reads as NULL inside INSERT triggers on PG ≥ 11, so coalesce is safe.)
  SELECT EXISTS (
    SELECT 1 FROM public.doctor_details dd
    JOIN public.profiles p ON p.id = dd.profile_id
    WHERE dd.id = coalesce(OLD.doctor_id, NEW.doctor_id) AND p.user_id = v_uid
  ) INTO v_is_doctor;
  IF v_is_doctor THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    v_patch := jsonb_build_object(
      'payment_status', 'unpaid', 'paid_at', NULL, 'payment_intent_id', NULL,
      'payment_environment', NULL, 'refunded_amount', 0, 'refunded_at', NULL,
      'invoice_id', NULL, 'commission_cents', 0,
      'called_at', NULL, 'started_at', NULL, 'ended_at', NULL
    );
    IF NEW.status IS NULL OR NEW.status NOT IN ('pending', 'confirmed', 'waiting') THEN
      v_patch := v_patch || jsonb_build_object('status', 'pending');
    END IF;
    RETURN jsonb_populate_record(NEW, v_patch);
  END IF;

  -- UPDATE by the patient
  SELECT coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb) INTO v_patch
    FROM jsonb_each(to_jsonb(OLD)) e
   WHERE e.key = ANY (v_locked);

  IF NEW.status IS DISTINCT FROM OLD.status
     AND NOT (NEW.status = 'cancelled' AND OLD.status IN ('pending', 'confirmed', 'waiting', 'called')) THEN
    v_patch := v_patch || jsonb_build_object('status', OLD.status);
  END IF;

  RETURN jsonb_populate_record(NEW, v_patch);
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_appointment_writes ON public.appointments;
CREATE TRIGGER trg_guard_appointment_writes
  BEFORE INSERT OR UPDATE ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.guard_appointment_writes();


-- ----------------------------------------------------------------------------
-- 5. doctor_details — verification / tier / rating are not self-editable
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_doctor_details_writes()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_locked text[] := ARRAY[
    'is_verified', 'verification_status', 'verification_level',
    'verification_submitted_at', 'verification_reviewed_at', 'verification_reviewed_by',
    'verification_notes', 'credentials_completed_at', 'credentials_review_started_at',
    'is_pro', 'pro_plus_active', 'telemedicine_enabled', 'subscription_plan',
    'is_claimed', 'claimed_at', 'source', 'rating', 'reviews_count',
    'license_document_url', 'profile_id', 'user_id'
  ];
  -- (referral_code is NOT locked: ensure_referral_code() writes it with the
  --  doctor's own JWT and the unique index already prevents collisions.)
  v_patch   jsonb := '{}'::jsonb;
  k         text;
  v_hasdef  boolean;
  v_notnull boolean;
BEGIN
  IF public._is_privileged_writer() THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    SELECT coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb) INTO v_patch
      FROM jsonb_each(to_jsonb(OLD)) e
     WHERE e.key = ANY (v_locked);
    -- The doctor may (re)submit for review from the browser
    -- (doctor.verification.tsx): status may move to 'pending' only — never to
    -- 'approved' — and never away from an already approved state.
    IF NEW.verification_status = 'pending'
       AND coalesce(OLD.verification_status, '') <> 'approved' THEN
      v_patch := v_patch - ARRAY['verification_status', 'verification_submitted_at', 'verification_notes'];
    END IF;
  ELSE
    -- INSERT by the doctor: every locked column starts at its DEFAULT, or
    -- NULL when it has no default and is nullable. A NOT NULL column without
    -- a default is left as sent (we cannot invent a value for it).
    -- profile_id / user_id are validated by the INSERT policy itself.
    FOREACH k IN ARRAY v_locked LOOP
      CONTINUE WHEN k IN ('profile_id', 'user_id');
      SELECT a.atthasdef, a.attnotnull INTO v_hasdef, v_notnull
        FROM pg_attribute a
       WHERE a.attrelid = 'public.doctor_details'::regclass
         AND a.attname = k AND NOT a.attisdropped AND a.attnum > 0;
      CONTINUE WHEN NOT FOUND;
      IF v_hasdef THEN
        v_patch := v_patch || jsonb_build_object(k, public._col_default_json('public.doctor_details'::regclass, k));
      ELSIF NOT v_notnull THEN
        v_patch := v_patch || jsonb_build_object(k, NULL);
      END IF;
    END LOOP;
  END IF;

  RETURN jsonb_populate_record(NEW, v_patch);
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_doctor_details_writes ON public.doctor_details;
CREATE TRIGGER trg_guard_doctor_details_writes
  BEFORE INSERT OR UPDATE ON public.doctor_details
  FOR EACH ROW EXECUTE FUNCTION public.guard_doctor_details_writes();


-- ----------------------------------------------------------------------------
-- 6. profiles — ban flag and ownership are not self-editable
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_profile_writes()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_patch jsonb := '{}'::jsonb;
  v_me    uuid;
BEGIN
  IF public._is_privileged_writer() THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' THEN
    -- (profile_views_count is not guarded: touch_profile_view / track_doctor_view
    --  increment it with the viewer's own JWT; it is a vanity counter only.)
    v_patch := jsonb_build_object('status', 'active');
    -- A doctor may create a managed patient only under their own profile.
    IF NEW.managed_by_doctor IS NOT NULL THEN
      SELECT id INTO v_me FROM public.profiles WHERE user_id = auth.uid() LIMIT 1;
      IF v_me IS NULL OR NEW.managed_by_doctor <> v_me THEN
        v_patch := v_patch || jsonb_build_object('managed_by_doctor', NULL);
      END IF;
    END IF;
    RETURN jsonb_populate_record(NEW, v_patch);
  END IF;

  v_patch := jsonb_build_object('status', OLD.status);
  -- Ownership of an already-claimed profile never changes from the client;
  -- an unclaimed managed profile (user_id NULL) may still be claimed.
  IF OLD.user_id IS NOT NULL THEN
    v_patch := v_patch || jsonb_build_object('user_id', OLD.user_id, 'managed_by_doctor', OLD.managed_by_doctor);
  END IF;
  RETURN jsonb_populate_record(NEW, v_patch);
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_profile_writes ON public.profiles;
CREATE TRIGGER trg_guard_profile_writes
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_profile_writes();


-- ----------------------------------------------------------------------------
-- 7. Zero-argument RPCs: logged-in users only
-- ----------------------------------------------------------------------------
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
      FROM pg_proc p
     WHERE p.pronamespace = 'public'::regnamespace
       AND p.proname IN (
         'ensure_doctor_trial', 'next_prescription_number', 'get_managed_patients',
         'list_my_care_doctors', 'list_appointment_payment_reviews',
         'doctor_subscription_status', 'unread_notifications_count',
         'mark_notifications_read', 'my_referral_stats', 'doctor_today_queue_stats'
       )
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', r.sig);
  END LOOP;
END $$;


-- Refresh the API schema cache (dropped column, new functions / view).
NOTIFY pgrst, 'reload schema';
