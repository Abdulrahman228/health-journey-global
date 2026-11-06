-- ============================================================================
-- 2026-11-06 — Web wiring audit: DB-side fixes (every page checked against the
-- live schema / RLS, read-only). NOT applied yet. Idempotent; safe to re-run.
--
-- Overlaps deliberately left OUT (already in 20261106120000_app_audit_db_fixes):
--   patient_medical_profile doctor policy, storage lab_upload_order_attachment,
--   realtime for posts / medical_records / medical_attachments.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- §1 Admin policies that only accepted role 'admin' (a pure super_admin was
--    refused). Use is_admin() = admin OR super_admin.
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Admins manage articles" ON public.articles;
CREATE POLICY "Admins manage articles" ON public.articles
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "admin manages wd" ON public.doctor_withdrawals;
CREATE POLICY "admin manages wd" ON public.doctor_withdrawals
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "doctor reads own wd" ON public.doctor_withdrawals;
CREATE POLICY "doctor reads own wd" ON public.doctor_withdrawals
  FOR SELECT USING (
    doctor_details_id IN (SELECT dd.id FROM public.doctor_details dd
                            JOIN public.profiles p ON p.id = dd.profile_id
                           WHERE p.user_id = auth.uid())
    OR public.is_admin()
  );

DROP POLICY IF EXISTS error_logs_admin_select ON public.error_logs;
CREATE POLICY error_logs_admin_select ON public.error_logs
  FOR SELECT TO authenticated USING (public.is_admin());

DROP POLICY IF EXISTS wv_admin_select ON public.web_vitals_events;
CREATE POLICY wv_admin_select ON public.web_vitals_events
  FOR SELECT TO authenticated USING (public.is_admin());

DROP POLICY IF EXISTS "admin full attachments" ON public.medical_attachments;
CREATE POLICY "admin full attachments" ON public.medical_attachments
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "admin full labs" ON public.lab_facilities;
CREATE POLICY "admin full labs" ON public.lab_facilities
  FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

-- /admin/subscriptions shows plan names; inactive plans were invisible to admins.
DROP POLICY IF EXISTS "admin reads all plans" ON public.subscription_plans;
CREATE POLICY "admin reads all plans" ON public.subscription_plans
  FOR SELECT TO authenticated USING (public.is_admin());

-- SECURITY DEFINER helpers without a pinned search_path.
ALTER FUNCTION public.is_admin(uuid) SET search_path = public;
ALTER FUNCTION public.is_super_admin(uuid) SET search_path = public;
ALTER FUNCTION public.opt_out_scraped_by_phone(text) SET search_path = public;
ALTER FUNCTION public.get_outreach_candidates(integer) SET search_path = public;

-- ----------------------------------------------------------------------------
-- §2 doctor_details / patient_details identity.
--    a) ~20 policies compare <details>.user_id = auth.uid(), but several insert
--       paths (sign-up, claim, mobile) left it NULL. Derive it from the profile
--       on every insert / profile change, and back-fill.
--    b) doctor_details_insert_own only checked user_id = auth.uid(): any user
--       could attach a doctor_details row to SOMEONE ELSE's profile, which makes
--       that profile world-readable through can_read_profile(). Require
--       ownership of the profile, and one doctor_details row per profile
--       (0 duplicates in prod).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._sync_details_user_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v uuid;
BEGIN
  IF NEW.profile_id IS NOT NULL THEN
    SELECT p.user_id INTO v
      FROM public.profiles p
     WHERE p.id = NEW.profile_id
       AND EXISTS (SELECT 1 FROM auth.users u WHERE u.id = p.user_id);
    IF v IS NOT NULL THEN
      NEW.user_id := v;
    END IF;
  END IF;
  RETURN NEW;
END $$;

-- Fires after trg_guard_doctor_details_writes (trigger names run alphabetically).
DROP TRIGGER IF EXISTS trg_sync_details_user_id ON public.doctor_details;
CREATE TRIGGER trg_sync_details_user_id
  BEFORE INSERT OR UPDATE OF profile_id, user_id ON public.doctor_details
  FOR EACH ROW EXECUTE FUNCTION public._sync_details_user_id();

DROP TRIGGER IF EXISTS trg_sync_details_user_id ON public.patient_details;
CREATE TRIGGER trg_sync_details_user_id
  BEFORE INSERT OR UPDATE OF profile_id, user_id ON public.patient_details
  FOR EACH ROW EXECUTE FUNCTION public._sync_details_user_id();

UPDATE public.doctor_details d SET user_id = p.user_id
  FROM public.profiles p
 WHERE p.id = d.profile_id AND d.user_id IS NULL AND p.user_id IS NOT NULL
   AND EXISTS (SELECT 1 FROM auth.users u WHERE u.id = p.user_id);
UPDATE public.patient_details d SET user_id = p.user_id
  FROM public.profiles p
 WHERE p.id = d.profile_id AND d.user_id IS NULL AND p.user_id IS NOT NULL
   AND EXISTS (SELECT 1 FROM auth.users u WHERE u.id = p.user_id);

DROP POLICY IF EXISTS doctor_details_insert_own ON public.doctor_details;
CREATE POLICY doctor_details_insert_own ON public.doctor_details
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (SELECT 1 FROM public.profiles p
                 WHERE p.id = doctor_details.profile_id AND p.user_id = auth.uid())
  );

CREATE UNIQUE INDEX IF NOT EXISTS doctor_details_profile_id_key
  ON public.doctor_details (profile_id) WHERE profile_id IS NOT NULL;

-- Sign-up / claim used to store the English placeholder "General", which no
-- specialty filter matched. Canonical value = specialties.name_ar for 'general'.
UPDATE public.doctor_details SET specialty = 'طب عام' WHERE specialty = 'General';

-- ----------------------------------------------------------------------------
-- §3 Medical data access.
--    a) "doctor reads attachments of their patients" let any doctor with a
--       record for the patient read LAB results too, bypassing the patient's
--       authorization and the lab's payment gate. Lab results stay on
--       "authorized doctor reads lab result".
--    b) Telemedicine consent: the web stores doctor_id = doctor_details.id, the
--       doctor policy compared it with profiles.id (never matched). Insert now
--       also requires the patient's own appointment.
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS "doctor reads attachments of their patients" ON public.medical_attachments;
CREATE POLICY "doctor reads attachments of their patients" ON public.medical_attachments
  FOR SELECT USING (
    lab_order_id IS NULL
    AND EXISTS (SELECT 1 FROM public.medical_records mr
                  JOIN public.profiles p ON p.id = mr.doctor_profile_id
                 WHERE mr.patient_profile_id = medical_attachments.patient_profile_id
                   AND p.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "Doctors view their patient consents" ON public.patient_appointment_consent;
CREATE POLICY "Doctors view their patient consents" ON public.patient_appointment_consent
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.doctor_details dd
      JOIN public.profiles p ON p.id = dd.profile_id
     WHERE p.user_id = auth.uid()
       AND (dd.id = patient_appointment_consent.doctor_id OR p.id = patient_appointment_consent.doctor_id)
  ));

DROP POLICY IF EXISTS "Patients insert own consent" ON public.patient_appointment_consent;
CREATE POLICY "Patients insert own consent" ON public.patient_appointment_consent
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.appointments a
      JOIN public.profiles p ON p.id = a.patient_id
     WHERE a.id = patient_appointment_consent.appointment_id
       AND a.patient_id = patient_appointment_consent.patient_id
       AND p.user_id = auth.uid()
  ));

-- ----------------------------------------------------------------------------
-- §4 submit_appointment_receipt
--    - after an admin rejects a receipt (payment_status 'failed') a re-upload
--      never re-entered the review queue (it lists 'unpaid' only), although the
--      rejection notice tells the patient to re-upload;
--    - admins holding admin + super_admin got two notifications;
--    - the receipt path is checked against the caller's own folder
--      (web, Android and iOS all upload to "{auth.uid()}/appt-<uuid>.<ext>").
--    payment_status is a locked column (guard_appointment_writes), hence the
--    scoped app.privileged around that one UPDATE.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.submit_appointment_receipt(p_appointment_id uuid, p_receipt_url text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_patient uuid; v_status text; v_admin RECORD;
BEGIN
  SELECT a.patient_id, a.payment_status INTO v_patient, v_status
    FROM public.appointments a WHERE a.id = p_appointment_id;
  IF v_patient IS NULL THEN RAISE EXCEPTION 'not_found'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = v_patient AND p.user_id = auth.uid()) THEN
    RAISE EXCEPTION 'not_your_appointment';
  END IF;
  IF coalesce(trim(p_receipt_url), '') = ''
     OR split_part(p_receipt_url, '/', 1) <> auth.uid()::text THEN
    RAISE EXCEPTION 'receipt_required';
  END IF;

  IF v_status = 'failed' THEN
    PERFORM set_config('app.privileged', 'on', true);
    UPDATE public.appointments
       SET payment_receipt_url = p_receipt_url, payment_receipt_at = now(), payment_status = 'unpaid'
     WHERE id = p_appointment_id;
    PERFORM set_config('app.privileged', '', true);
  ELSE
    UPDATE public.appointments
       SET payment_receipt_url = p_receipt_url, payment_receipt_at = now()
     WHERE id = p_appointment_id;
  END IF;

  FOR v_admin IN
    SELECT DISTINCT ur.user_id FROM public.user_roles ur
     WHERE ur.role IN ('admin'::public.app_role, 'super_admin'::public.app_role)
  LOOP
    INSERT INTO public.notifications (user_id, kind, title, body, link)
    VALUES (v_admin.user_id, 'payment_review', 'إيصال دفع بانتظار المراجعة',
            'رفع مريض إيصال تحويل لموعد — راجِعه وأكِّد الدفع.', '/admin/appointment-payments');
  END LOOP;
END; $$;

-- ----------------------------------------------------------------------------
-- §5 Doctor money.
--    The web booking writes appointment_type 'clinic' (mobile/older: 'in_person').
--    The DB only treated 'in_person' as paid-at-the-clinic, so clinic visits were
--    charged the online commission (7 prod transactions) and counted as
--    withdrawable wallet money / "online" ledger income. Gold also resolved to
--    15 % because the newest gold plan row (doctor_gold_yearly) says 15 while
--    /pricing and plans.ts promise 10 %.
--    Already-posted wrong fees are re-priced separately by
--    supabase/data_fixes/20261106_commission_backfill_qa_cleanup.sql.
-- ----------------------------------------------------------------------------
UPDATE public.subscription_plans SET commission_pct = 10.00
 WHERE code = 'doctor_gold_yearly' AND commission_pct <> 10.00;

CREATE OR REPLACE FUNCTION public.create_transaction_on_appointment_completion()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_doctor_details_id UUID;
  v_tier              TEXT;
  v_commission_pct    NUMERIC(5,2);
  v_settings_pct      NUMERIC(5,2);
  v_fee_pct           NUMERIC(5,2);
  v_fee               NUMERIC(10,2);
  v_net               NUMERIC(10,2);
  v_appt_type         TEXT;
  v_description       TEXT;
BEGIN
  IF NEW.status = 'completed' AND (OLD.status IS DISTINCT FROM 'completed') THEN
    v_doctor_details_id := NEW.doctor_id;
    v_appt_type := COALESCE(NEW.appointment_type, 'in_person');

    IF EXISTS (SELECT 1 FROM public.doctor_transactions
                WHERE appointment_id = NEW.id AND type = 'consultation') THEN
      RETURN NEW;
    END IF;

    -- 'clinic' (web) and 'in_person' (mobile / older rows) = paid at the clinic → 0 %.
    IF v_appt_type IN ('in_person', 'clinic') THEN
      v_fee_pct := 0;
      v_description := 'Auto: clinic visit completed (0% commission)';
    ELSE
      v_tier := public.doctor_active_tier(v_doctor_details_id);
      v_commission_pct := COALESCE(
        (SELECT MIN(sp.commission_pct) FROM public.subscription_plans sp
          WHERE sp.tier = v_tier AND sp.is_active),
        (SELECT sp.commission_pct FROM public.subscription_plans sp
          WHERE sp.tier = v_tier ORDER BY sp.created_at DESC LIMIT 1)
      );
      SELECT platform_fee_pct INTO v_settings_pct
        FROM public.doctor_billing_settings WHERE doctor_details_id = v_doctor_details_id;
      v_fee_pct := COALESCE(LEAST(v_settings_pct, v_commission_pct), v_commission_pct, 15.00);
      v_description := format('Auto: online consultation completed (%s tier, %s%% commission)',
                              v_tier, v_fee_pct);
    END IF;

    v_fee := ROUND((COALESCE(NEW.fee, 0) * v_fee_pct / 100)::numeric, 2);
    v_net := COALESCE(NEW.fee, 0) - v_fee;

    INSERT INTO public.doctor_transactions(
      doctor_details_id, appointment_id, type,
      gross_amount, platform_fee, net_amount, currency, status, description, metadata
    ) VALUES (
      v_doctor_details_id, NEW.id, 'consultation',
      COALESCE(NEW.fee, 0), v_fee, v_net, 'EGP', 'completed', v_description,
      jsonb_build_object('tier', COALESCE(v_tier, 'in_person'),
                         'commission_pct', v_fee_pct,
                         'appointment_type', v_appt_type)
    );
  END IF;
  RETURN NEW;
END;
$$;

-- Wallet = ONLINE earnings only. Also lets admins / the server read it
-- (was has_role('admin') only, so super_admin and the service role were refused).
CREATE OR REPLACE FUNCTION public.doctor_wallet_balance(_doctor_details_id uuid)
RETURNS TABLE(withdrawable numeric, online_net_earned numeric, total_paid_out numeric,
              pending_out numeric, currency text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_online numeric := 0; v_paid numeric := 0; v_pending numeric := 0;
BEGIN
  IF NOT public._is_privileged_writer() AND NOT EXISTS (
    SELECT 1 FROM public.doctor_details dd
      JOIN public.profiles p ON p.id = dd.profile_id
     WHERE dd.id = _doctor_details_id AND p.user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(SUM(net_amount), 0) INTO v_online
    FROM public.doctor_transactions
   WHERE doctor_details_id = _doctor_details_id AND status = 'completed'
     AND type IN ('consultation', 'adjustment', 'bonus')
     AND COALESCE(metadata->>'appointment_type', 'in_person') NOT IN ('in_person', 'clinic');

  SELECT COALESCE(SUM(amount), 0) INTO v_paid
    FROM public.doctor_withdrawals
   WHERE doctor_details_id = _doctor_details_id AND status = 'paid';

  SELECT COALESCE(SUM(amount), 0) INTO v_pending
    FROM public.doctor_withdrawals
   WHERE doctor_details_id = _doctor_details_id AND status IN ('requested', 'approved', 'processing');

  RETURN QUERY SELECT GREATEST(v_online - v_paid - v_pending, 0)::numeric,
                      v_online::numeric, v_paid::numeric, v_pending::numeric, 'EGP'::text;
END; $$;

-- Ledger: clinic visits under consultation_clinic (same columns; keeps security_invoker).
CREATE OR REPLACE VIEW public.v_doctor_ledger WITH (security_invoker = true) AS
 SELECT dt.doctor_details_id,
    (dt.created_at)::date AS entry_date,
    'income'::text AS direction,
        CASE
            WHEN COALESCE(dt.metadata ->> 'appointment_type', 'in_person') IN ('in_person', 'clinic')
              THEN 'consultation_clinic'::text
            ELSE 'consultation_online'::text
        END AS category,
    dt.net_amount AS amount,
    COALESCE(dt.currency, 'EGP'::text) AS currency,
    COALESCE(dt.description, ''::text) AS description,
    'doctor_transactions'::text AS source,
    dt.id AS source_id
   FROM public.doctor_transactions dt
  WHERE dt.status = 'completed'::text
    AND dt.type = ANY (ARRAY['consultation'::text, 'adjustment'::text, 'bonus'::text])
UNION ALL
 SELECT oi.doctor_id AS doctor_details_id,
    oi.received_at AS entry_date,
    'income'::text AS direction,
    ('other_'::text || COALESCE(oi.source_type, 'other'::text)) AS category,
    oi.amount,
    'EGP'::text AS currency,
    COALESCE(oi.note, ''::text) AS description,
    'doctor_other_income'::text AS source,
    oi.id AS source_id
   FROM public.doctor_other_income oi
UNION ALL
 SELECT COALESCE(e.doctor_details_id, e.doctor_id) AS doctor_details_id,
    COALESCE(e.expense_date, e.spent_at) AS entry_date,
    'expense'::text AS direction,
    COALESCE(e.category, 'other'::text) AS category,
    e.amount,
    COALESCE(e.currency, 'EGP'::text) AS currency,
    COALESCE(e.description, e.note, ''::text) AS description,
    'doctor_expenses'::text AS source,
    e.id AS source_id
   FROM public.doctor_expenses e
UNION ALL
 SELECT w.doctor_details_id,
    (w.created_at)::date AS entry_date,
    'withdrawal'::text AS direction,
    'withdrawal'::text AS category,
    w.amount,
    COALESCE(w.currency, 'EGP'::text) AS currency,
    COALESCE(w.method, ''::text) AS description,
    'doctor_withdrawals'::text AS source,
    w.id AS source_id
   FROM public.doctor_withdrawals w
  WHERE w.status <> ALL (ARRAY['rejected'::text, 'cancelled'::text]);

-- ----------------------------------------------------------------------------
-- §6 Labs / pharmacies could mark themselves verified (owner policies have no
--    column limits). Admins / the server (_is_privileged_writer) still can.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_facility_verification()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public._is_privileged_writer() THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.is_verified := false;
    IF TG_TABLE_NAME = 'pharmacy_chains' THEN NEW.verification_status := 'pending'; END IF;
  ELSE
    NEW.is_verified := OLD.is_verified;
    IF TG_TABLE_NAME = 'pharmacy_chains' THEN NEW.verification_status := OLD.verification_status; END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_guard_lab_verification ON public.lab_facilities;
CREATE TRIGGER trg_guard_lab_verification BEFORE INSERT OR UPDATE ON public.lab_facilities
  FOR EACH ROW EXECUTE FUNCTION public.guard_facility_verification();
DROP TRIGGER IF EXISTS trg_guard_pharmacy_verification ON public.pharmacy_chains;
CREATE TRIGGER trg_guard_pharmacy_verification BEFORE INSERT OR UPDATE ON public.pharmacy_chains
  FOR EACH ROW EXECUTE FUNCTION public.guard_facility_verification();

-- ----------------------------------------------------------------------------
-- §7 Community feed: author UPDATE policies have no WITH CHECK, so an author
--    could flip question→awareness (skipping the verified+Gold rule), pin, forge
--    counters, or set is_doctor_verified on a reply. Counter bumps run from
--    bump_*_count() at trigger depth 2 → privileged, unaffected.
--    (Reply author_role: raw 'super_admin'/'lab' violated the CHECK — derived here.)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_post_writes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF public._is_privileged_writer() THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' THEN
    NEW.is_pinned := false; NEW.reactions_count := 0; NEW.replies_count := 0;
    NEW.is_resolved := false;
    NEW.author_role := 'doctor';  -- the INSERT policy only admits doctors
  ELSE
    NEW.author_profile_id := OLD.author_profile_id; NEW.author_role := OLD.author_role;
    NEW.post_type := OLD.post_type; NEW.is_pinned := OLD.is_pinned;
    NEW.reactions_count := OLD.reactions_count; NEW.replies_count := OLD.replies_count;
    NEW.created_at := OLD.created_at;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_guard_post_writes ON public.posts;
CREATE TRIGGER trg_guard_post_writes BEFORE INSERT OR UPDATE ON public.posts
  FOR EACH ROW EXECUTE FUNCTION public.guard_post_writes();

CREATE OR REPLACE FUNCTION public.guard_reply_writes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_uid uuid;
BEGIN
  IF public._is_privileged_writer() THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' THEN
    SELECT user_id INTO v_uid FROM public.profiles WHERE id = NEW.author_profile_id;
    NEW.author_role := CASE
      WHEN EXISTS (SELECT 1 FROM public.doctor_details WHERE profile_id = NEW.author_profile_id) THEN 'doctor'
      WHEN v_uid IS NOT NULL AND public.is_admin(v_uid) THEN 'admin'
      WHEN v_uid IS NOT NULL AND public.has_role(v_uid, 'pharmacy') THEN 'pharmacist'
      ELSE 'patient' END;
  ELSE
    NEW.post_id := OLD.post_id; NEW.author_profile_id := OLD.author_profile_id;
    NEW.author_role := OLD.author_role; NEW.is_doctor_verified := OLD.is_doctor_verified;
    NEW.parent_reply_id := OLD.parent_reply_id; NEW.created_at := OLD.created_at;
  END IF;
  RETURN NEW;
END $$;
-- Name sorts before trg_replies_set_verified, which still sets is_doctor_verified on INSERT.
DROP TRIGGER IF EXISTS trg_replies_guard ON public.post_replies;
CREATE TRIGGER trg_replies_guard BEFORE INSERT OR UPDATE ON public.post_replies
  FOR EACH ROW EXECUTE FUNCTION public.guard_reply_writes();

-- ----------------------------------------------------------------------------
-- §8 Exposure to signed-out visitors.
--    a) anon could read every doctor's signature / stamp image URL (no anon
--       page uses them; the doctor reads them signed in).
--    b) profile_short_links was world-readable → anyone could enumerate
--       "unlisted" /u/ slugs. /q/{id} resolves server-side (service role); only
--       the owner's dashboard reads the table from the browser.
--    c) handle_emergency_booking(uuid): unused, references a missing column,
--       not SECURITY DEFINER, executable by anon.
-- ----------------------------------------------------------------------------
REVOKE SELECT (signature_url, stamp_url) ON public.doctor_details FROM anon;

DROP POLICY IF EXISTS short_links_public_read ON public.profile_short_links;
DROP POLICY IF EXISTS short_links_owner_read ON public.profile_short_links;
CREATE POLICY short_links_owner_read ON public.profile_short_links
  FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles p
             WHERE p.id = profile_short_links.profile_id AND p.user_id = auth.uid())
    OR public.is_admin()
  );

REVOKE EXECUTE ON FUNCTION public.handle_emergency_booking(uuid) FROM PUBLIC, anon, authenticated;

-- ----------------------------------------------------------------------------
-- §9 Upload buckets without size / type limits (pharmacy-logos and post-media
--    are public). Matches what web, Android and iOS upload.
-- ----------------------------------------------------------------------------
UPDATE storage.buckets
   SET file_size_limit = 5242880,
       allowed_mime_types = ARRAY['image/jpeg','image/png','image/webp','image/heic','image/heif']
 WHERE id = 'receipts';
UPDATE storage.buckets
   SET file_size_limit = 5242880,
       allowed_mime_types = ARRAY['image/jpeg','image/png','image/webp']
 WHERE id = 'pharmacy-logos';
UPDATE storage.buckets
   SET file_size_limit = 5242880,
       allowed_mime_types = ARRAY['image/jpeg','image/png','image/webp','image/gif','image/heic','image/heif']
 WHERE id = 'post-media';

-- ----------------------------------------------------------------------------
-- §10 Realtime: the web subscribes to prescriptions (patient file / medical
--     history) and subscriptions (useSubscription refresh after admin approval);
--     neither was published, so those channels never fired. RLS still applies.
-- ----------------------------------------------------------------------------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['prescriptions', 'subscriptions'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables
                    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
