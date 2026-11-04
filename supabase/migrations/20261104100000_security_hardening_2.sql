-- ============================================================================
-- Security hardening round 2 + production bug fixes (2026-11-04)
--
-- Findings from the live-project review (anonymous API probes + catalog):
--   §1  BROKEN TRIGGER: on_doctor_created → handle_new_doctor_trial() updates
--       columns that do not exist (doctor_active_tier, trial_ends_at), so EVERY
--       INSERT into doctor_details fails → new doctors never get a doctor record.
--       (The real trial grant is trg_new_doctor_gold_trial, which is fine.)
--   §2  preview_visit_pricing() / get_due_followup_reminders() reference
--       doctor_followup_settings.doctor_id / followup_period_days, which do not
--       exist → كشف/استشارة pricing and the follow-up reminder cron error out.
--       Fixed; preview now returns the same values the apps use
--       ('first_visit' | 'follow_up').
--   §3  SECURITY DEFINER functions executable by anonymous callers with no
--       authorization inside: get_outreach_candidates (phones + claim tokens of
--       seeded doctors), opt_out_scraped_by_phone, _notify (anyone could push
--       notifications with links to any user), _user_id_from_profile,
--       doctor_monthly_pnl (any doctor's revenue), grant_doctor_trial_if_absent,
--       record_coupon_redemption, classify_appointment_visit_type,
--       has_active_subscription/has_plan.  → revoked or guarded.
--   §4  Open policies: anyone could INSERT sponsored_impressions rows with any
--       cost (bypassing the server rate limit) and list every active coupon code.
--   §5  Column exposure to anonymous visitors: profiles.fcm_token/phone/
--       medical_card, doctor_details.license_document_url/verification_notes/
--       national_id_last4, scraped_doctors.claim_token.  → explicit column grants.
--   §6  Storage: the `receipts` bucket (bank-transfer screenshots) was PUBLIC and
--       listable by anyone. → private, owner/admin policies.
--   §7  admin follow-ups: opted_out_reason, is_admin() superset, admin read on
--       subscriptions/payments, lab/pharmacy self-role.
-- Idempotent; one transaction.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- §1 Remove the trigger that breaks doctor registration
-- ----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS on_doctor_created ON public.doctor_details;
DROP FUNCTION IF EXISTS public.handle_new_doctor_trial();

-- ----------------------------------------------------------------------------
-- §2 Visit pricing + follow-up reminders (correct columns, app-consistent values)
-- ----------------------------------------------------------------------------
-- Keep the live signature (p_scheduled_at DEFAULT now()): CREATE OR REPLACE
-- cannot drop a parameter default (42P13).
CREATE OR REPLACE FUNCTION public.preview_visit_pricing(
  p_doctor_id uuid, p_patient_id uuid, p_scheduled_at timestamp with time zone DEFAULT now()
)
RETURNS TABLE (visit_type text, fee numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_days   int;
  v_base   numeric;
  v_fup    numeric;
  v_last   timestamptz;
  v_is_fup boolean := false;
BEGIN
  -- Asking about a SPECIFIC patient's history is allowed only to that patient,
  -- the doctor, or the server. Generic pricing (NULL patient) is public.
  IF p_patient_id IS NOT NULL AND NOT public._is_privileged_writer() THEN
    IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = p_patient_id AND p.user_id = auth.uid())
       AND NOT EXISTS (SELECT 1 FROM public.doctor_details dd JOIN public.profiles p ON p.id = dd.profile_id
                        WHERE dd.id = p_doctor_id AND p.user_id = auth.uid()) THEN
      RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
    END IF;
  END IF;

  SELECT COALESCE(dd.followup_period_days, 14), dd.consultation_fee
    INTO v_days, v_base
    FROM public.doctor_details dd WHERE dd.id = p_doctor_id;

  SELECT dfs.followup_fee INTO v_fup
    FROM public.doctor_followup_settings dfs WHERE dfs.doctor_details_id = p_doctor_id;

  IF p_patient_id IS NOT NULL THEN
    SELECT MAX(a.scheduled_at) INTO v_last
      FROM public.appointments a
     WHERE a.doctor_id = p_doctor_id AND a.patient_id = p_patient_id AND a.status = 'completed';
    IF v_last IS NOT NULL
       AND COALESCE(p_scheduled_at, now()) <= v_last + make_interval(days => v_days) THEN
      v_is_fup := true;
    END IF;
  END IF;

  IF v_is_fup THEN
    RETURN QUERY SELECT 'follow_up'::text, COALESCE(v_fup, 0)::numeric;
  ELSE
    RETURN QUERY SELECT 'first_visit'::text, COALESCE(v_base, 0)::numeric;
  END IF;
END; $$;

CREATE OR REPLACE FUNCTION public.classify_appointment_visit_type(p_appointment_id uuid)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_doctor_id uuid; v_patient_id uuid; v_scheduled_at timestamptz;
  v_type text; v_fee numeric;
BEGIN
  SELECT doctor_id, patient_id, scheduled_at INTO v_doctor_id, v_patient_id, v_scheduled_at
    FROM public.appointments WHERE id = p_appointment_id;
  IF v_doctor_id IS NULL THEN RETURN 'appointment_not_found'; END IF;

  -- Only the patient, the doctor, or the server may (re)classify an appointment.
  IF NOT public._is_privileged_writer()
     AND NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = v_patient_id AND p.user_id = auth.uid())
     AND NOT EXISTS (SELECT 1 FROM public.doctor_details dd JOIN public.profiles p ON p.id = dd.profile_id
                      WHERE dd.id = v_doctor_id AND p.user_id = auth.uid()) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  SELECT vt.visit_type, vt.fee INTO v_type, v_fee
    FROM public.preview_visit_pricing(v_doctor_id, v_patient_id, v_scheduled_at) vt;

  UPDATE public.appointments
     SET visit_type = v_type, fee = COALESCE(v_fee, fee)
   WHERE id = p_appointment_id;
  RETURN v_type;
END; $$;

CREATE OR REPLACE FUNCTION public.get_due_followup_reminders()
RETURNS TABLE (appointment_id uuid, patient_id uuid, doctor_id uuid, patient_name text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN QUERY
  SELECT a.id, a.patient_id, a.doctor_id, p.full_name
    FROM public.appointments a
    JOIN public.profiles p        ON p.id = a.patient_id
    JOIN public.doctor_details dd ON dd.id = a.doctor_id
   WHERE a.status = 'completed'
     AND (a.scheduled_at::date + make_interval(days => COALESCE(dd.followup_period_days, 14)))::date = CURRENT_DATE
     AND NOT EXISTS (
           SELECT 1 FROM public.appointments a2
            WHERE a2.patient_id = a.patient_id AND a2.doctor_id = a.doctor_id
              AND a2.scheduled_at > a.scheduled_at AND a2.status NOT IN ('cancelled', 'rejected', 'no_show'))
     AND NOT EXISTS (
           SELECT 1 FROM public.notifications n
            WHERE n.metadata->>'appointment_id' = a.id::text AND n.kind = 'followup_reminder');
END; $$;

-- doctor_monthly_pnl: owner / admin / server only (was readable by anyone)
CREATE OR REPLACE FUNCTION public.doctor_monthly_pnl(_doctor_details_id uuid, _year integer, _month integer)
RETURNS TABLE (gross_revenue numeric, platform_fees numeric, net_revenue numeric, total_expenses numeric,
               bookings_count integer, net_profit numeric, currency text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_from DATE := make_date(_year, _month, 1);
  v_to   DATE := (make_date(_year, _month, 1) + INTERVAL '1 month')::date;
  v_c_gross NUMERIC := 0; v_c_fees NUMERIC := 0; v_c_net NUMERIC := 0; v_bk INT := 0;
  v_other NUMERIC := 0; v_exp NUMERIC := 0; v_curr TEXT := 'EGP';
BEGIN
  IF NOT public._is_privileged_writer()
     AND NOT EXISTS (SELECT 1 FROM public.doctor_details dd JOIN public.profiles p ON p.id = dd.profile_id
                      WHERE dd.id = _doctor_details_id AND p.user_id = auth.uid()) THEN
    RAISE EXCEPTION 'not_authorized' USING ERRCODE = '42501';
  END IF;

  BEGIN
    SELECT COALESCE(SUM(gross_amount),0), COALESCE(SUM(platform_fee),0),
           COALESCE(SUM(net_amount),0), COUNT(*) FILTER (WHERE type='consultation'),
           COALESCE(MAX(t.currency),'EGP')
      INTO v_c_gross, v_c_fees, v_c_net, v_bk, v_curr
      FROM public.doctor_transactions t
     WHERE t.doctor_details_id = _doctor_details_id AND t.status = 'completed'
       AND t.type IN ('consultation','adjustment','bonus')
       AND t.created_at >= v_from AND t.created_at < v_to;
  EXCEPTION WHEN OTHERS THEN
    v_c_gross := 0; v_c_fees := 0; v_c_net := 0; v_bk := 0; v_curr := 'EGP';
  END;

  BEGIN
    SELECT COALESCE(SUM(amount),0) INTO v_other
      FROM public.doctor_other_income
     WHERE doctor_id = _doctor_details_id AND received_at >= v_from AND received_at < v_to;
  EXCEPTION WHEN OTHERS THEN v_other := 0; END;

  SELECT COALESCE(SUM(amount),0) INTO v_exp
    FROM public.doctor_expenses
   WHERE COALESCE(doctor_details_id, doctor_id) = _doctor_details_id
     AND COALESCE(expense_date, spent_at) >= v_from
     AND COALESCE(expense_date, spent_at) <  v_to;

  RETURN QUERY SELECT
    (v_c_gross + v_other)::numeric, v_c_fees::numeric, (v_c_net + v_other)::numeric,
    v_exp::numeric, v_bk, (v_c_net + v_other - v_exp)::numeric, v_curr;
END; $$;

-- ----------------------------------------------------------------------------
-- §3 Function privileges
-- ----------------------------------------------------------------------------
-- Internal helpers + server-only RPCs: never callable through the API by anon /
-- logged-in users (SECURITY DEFINER callers keep working: they run as owner).
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig FROM pg_proc p
     WHERE p.pronamespace = 'public'::regnamespace
       AND p.proname IN (
         'get_outreach_candidates', 'opt_out_scraped_by_phone', '_notify',
         '_user_id_from_profile', '_user_id_from_doctor_details', '_caller_doctor_id',
         'grant_doctor_trial_if_absent', 'record_coupon_redemption',
         'get_due_followup_reminders', 'has_active_subscription', 'has_plan'
         -- NOT is_super_admin: the "Super Admins read medical records" policy calls
         -- it as the querying user; revoking EXECUTE would break medical_records
         -- for everyone. NOT suggest_unique_slug: the doctor's public-page editor
         -- calls it from the browser (it is in the logged-in list below).
       )
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.sig);
  END LOOP;
END $$;

-- Logged-in only (no reason for anonymous callers):
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig FROM pg_proc p
     WHERE p.pronamespace = 'public'::regnamespace
       AND p.proname IN (
         'classify_appointment_visit_type', 'doctor_monthly_pnl', 'doctor_financial_report',
         'doctor_financial_summary', 'doctor_revenue_series', 'doctor_wallet_balance',
         'add_managed_patient', 'advance_queue', 'book_queue_appointment', 'book_slot_appointment',
         'cancel_appointment', 'check_in_appointment', 'claim_managed_profile', 'complete_visit',
         'confirm_appointment_payment', 'create_lab_order', 'doctor_book_followup',
         'emergency_shift_queue', 'flag_emergency_appointment', 'get_or_create_claim_link',
         'lab_update_order', 'list_care_doctors_for_patient', 'read_my_private_feedback',
         'reply_private_feedback', 'request_withdrawal', 'set_lab_order_authorization',
         'set_shared_care_consent', 'start_visit', 'submit_appointment_receipt',
         'submit_private_feedback', 'attribute_referral', 'ensure_referral_code',
         'request_patient_invite', 'adopt_managed_profile_by_phone', 'set_my_messaging_opt_out',
         'rate_ai_consultation', 'touch_short_link', 'suggest_unique_slug'
       )
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', r.sig);
  END LOOP;
END $$;

-- ----------------------------------------------------------------------------
-- §4 Policies
-- ----------------------------------------------------------------------------
-- Sponsored clicks are billed; only the server (rate-limited, deduplicated)
-- may write them.
DROP POLICY IF EXISTS imp_insert_authenticated ON public.sponsored_impressions;
-- Coupon codes are validated by the server; the list must not be enumerable.
DROP POLICY IF EXISTS coupons_public_select ON public.coupons;

-- ----------------------------------------------------------------------------
-- §5 Column-level exposure for anonymous visitors (explicit allow-lists)
-- ----------------------------------------------------------------------------
-- profiles: public directory needs name/avatar/city/slug/bio… but never the
-- push token, the phone or the medical card.
REVOKE SELECT ON public.profiles FROM anon;
GRANT SELECT (id, user_id, full_name, avatar_url, country, city, created_at, updated_at, slug,
              public_bio, public_banner_url, profile_visibility, profile_views_count,
              social_links, status, managed_by_doctor, shared_care_consent)
  ON public.profiles TO anon;

-- doctor_details: licence documents, verification notes, national id, referral
-- codes and reviewer ids are not public.
REVOKE SELECT ON public.doctor_details FROM anon;
GRANT SELECT (id, profile_id, specialty, clinic_name, clinic_address, bio, consultation_fee, rating,
              years_experience, is_verified, verification_status, created_at, updated_at, currency,
              languages, education, certifications, about_ar, about_en, syndicate_number, is_pro,
              pro_plus_active, telemedicine_enabled, verification_level, solo_mode_enabled,
              solo_brand_color, solo_logo_url, solo_clinic_name, signature_url, stamp_url,
              reviews_count, user_id, subscription_plan, followup_period_days, source, is_claimed,
              claimed_at, university, qualifications, online_consultation_fee)
  ON public.doctor_details TO anon;

-- scraped_doctors: the claim token is the key to taking over a seeded listing.
REVOKE SELECT ON public.scraped_doctors FROM anon, authenticated;
GRANT SELECT (id, full_name, specialty, phone, address, city, governorate, lat, lng,
              external_rating, external_review_cnt, source, listing_status, is_claimed,
              claimed_doctor_id, claimed_at, opted_out, imported_at)
  ON public.scraped_doctors TO anon, authenticated;

-- ----------------------------------------------------------------------------
-- §6 Receipts bucket: private; owner uploads/reads, admins read, nobody lists
-- ----------------------------------------------------------------------------
UPDATE storage.buckets SET public = false WHERE id = 'receipts';
DROP POLICY IF EXISTS "Receipts publicly readable" ON storage.objects;
DROP POLICY IF EXISTS "receipts_owner_read" ON storage.objects;
CREATE POLICY "receipts_owner_read" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'receipts' AND ((auth.uid())::text = (storage.foldername(name))[1] OR public.is_admin()));
-- (existing "Users upload/update/delete own receipts" policies stay: owner folder only)

-- ----------------------------------------------------------------------------
-- §7 Admin / lab audit follow-ups (2026-11-04)
-- ----------------------------------------------------------------------------
-- 7a  scraped_doctors.opted_out_reason — migration 20260722000000 was never
--     applied live; /admin/seed-directory and the claim opt-out both 400 on it.
ALTER TABLE public.scraped_doctors ADD COLUMN IF NOT EXISTS opted_out_reason text;
COMMENT ON COLUMN public.scraped_doctors.opted_out_reason
  IS 'Why the doctor declined from the /claim page: not_me | not_interested | free text.';

-- 7b  Zero-arg is_admin() (used by the "admin full access" policies) still has
--     the 2026-06 body (role = 'admin' only). Delegate to the uuid overload so
--     super_admin is a superset everywhere. Also mirror super_admin -> admin in
--     user_roles so the remaining has_role(..., 'admin') policies include them.
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT public.is_admin(auth.uid()); $$;

INSERT INTO public.user_roles (user_id, role)
SELECT ur.user_id, 'admin'::public.app_role
FROM public.user_roles ur
WHERE ur.role = 'super_admin'
ON CONFLICT DO NOTHING;

-- 7c  Admin read access for the billing pages. Live policies only allowed
--     own-row SELECT, so /admin/subscriptions, /admin/subscription-requests,
--     /admin/billing and the dashboard counters were empty for admins.
DROP POLICY IF EXISTS "admin reads subscriptions" ON public.subscriptions;
CREATE POLICY "admin reads subscriptions" ON public.subscriptions
  FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "super_admin read payments" ON public.payments;
DROP POLICY IF EXISTS "admin reads payments" ON public.payments;
CREATE POLICY "admin reads payments" ON public.payments
  FOR SELECT TO authenticated USING (public.is_admin(auth.uid()));

-- 7d  Lab / pharmacy registration assigns a facility role to the owner. These
--     roles grant nothing by RLS (facility access is ownership-based), they only
--     switch the UI shell, so self-assignment is safe. Admin roles stay
--     super_admin-only.
DROP POLICY IF EXISTS user_roles_insert_own ON public.user_roles;
CREATE POLICY user_roles_insert_own ON public.user_roles
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND role = ANY (ARRAY['patient','doctor','lab','pharmacy']::public.app_role[])
  );

NOTIFY pgrst, 'reload schema';
