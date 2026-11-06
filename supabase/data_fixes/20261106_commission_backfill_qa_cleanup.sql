-- ============================================================================
-- One-off DATA fix (owner decisions, 2026-11-06). Not a schema migration.
-- Run AFTER 20261106100000_wiring_audit_fixes.sql. Safe to run twice: the
-- second run changes nothing.
--
-- 1) Re-price consultation fees that were posted under the old, wrong rules
--    (same rules the fixed create_transaction_on_appointment_completion uses):
--      - clinic visits ('clinic' from the web, 'in_person' from mobile) = 0 %
--      - Gold online consultations                                      = 10 %
--    Each corrected row keeps the old fee in metadata (corrected_from_fee).
-- 2) Delete the two QA accounts (qa.doctor@ / qa.patient@mytabibi.com) and
--    everything they own. Stops if a QA row is linked to a real account.
-- ============================================================================

-- 1a) Clinic visits that were charged a commission → 0 %.
UPDATE public.doctor_transactions t
   SET platform_fee = 0,
       net_amount   = t.gross_amount,
       description  = 'Auto: clinic visit completed (0% commission)',
       metadata     = COALESCE(t.metadata, '{}'::jsonb) || jsonb_build_object(
                        'tier', 'in_person',
                        'commission_pct', 0,
                        'corrected_at', now(),
                        'corrected_from_fee', t.platform_fee,
                        'corrected_from_tier', t.metadata->>'tier',
                        'correction', 'clinic visits are 0% commission')
 WHERE t.type = 'consultation'
   AND COALESCE(t.metadata->>'appointment_type', 'in_person') IN ('clinic', 'in_person')
   AND t.platform_fee <> 0;

-- 1b) Gold online consultations charged more than 10 % → 10 %.
UPDATE public.doctor_transactions t
   SET platform_fee = ROUND(t.gross_amount * 10 / 100, 2),
       net_amount   = t.gross_amount - ROUND(t.gross_amount * 10 / 100, 2),
       description  = 'Auto: online consultation completed (gold tier, 10.00% commission)',
       metadata     = t.metadata || jsonb_build_object(
                        'commission_pct', 10.00,
                        'corrected_at', now(),
                        'corrected_from_fee', t.platform_fee,
                        'correction', 'Gold online commission is 10%')
 WHERE t.type = 'consultation'
   AND COALESCE(t.metadata->>'appointment_type', 'in_person') NOT IN ('clinic', 'in_person')
   AND t.metadata->>'tier' = 'gold'
   AND (t.metadata->>'commission_pct')::numeric > 10;

-- 2) QA accounts.
DO $$
DECLARE
  v_users    uuid[];
  v_profiles uuid[];
  v_doctors  uuid[];
  v_appts    uuid[];
  v_n        integer;
BEGIN
  SELECT array_agg(id) INTO v_users FROM auth.users
   WHERE lower(email) IN ('qa.doctor@mytabibi.com', 'qa.patient@mytabibi.com');
  IF v_users IS NULL THEN
    RAISE NOTICE 'QA accounts already deleted';
    RETURN;
  END IF;

  SELECT COALESCE(array_agg(id), '{}') INTO v_profiles
    FROM public.profiles WHERE user_id = ANY (v_users);
  SELECT COALESCE(array_agg(id), '{}') INTO v_doctors
    FROM public.doctor_details WHERE profile_id = ANY (v_profiles) OR user_id = ANY (v_users);
  SELECT COALESCE(array_agg(id), '{}') INTO v_appts
    FROM public.appointments WHERE doctor_id = ANY (v_doctors) OR patient_id = ANY (v_profiles);

  -- The QA accounts only ever dealt with each other. Never touch a real person's data.
  IF EXISTS (SELECT 1 FROM public.appointments
              WHERE id = ANY (v_appts)
                AND NOT (doctor_id = ANY (v_doctors) AND patient_id = ANY (v_profiles)))
     OR EXISTS (SELECT 1 FROM public.medical_records
              WHERE (doctor_profile_id = ANY (v_profiles)) <> (patient_profile_id = ANY (v_profiles)))
     OR EXISTS (SELECT 1 FROM public.doctor_patients
              WHERE (doctor_profile_id = ANY (v_profiles)) <> (patient_profile_id = ANY (v_profiles)))
     OR EXISTS (SELECT 1 FROM public.profiles
              WHERE managed_by_doctor = ANY (v_profiles) AND NOT (id = ANY (v_profiles))) THEN
    RAISE EXCEPTION 'QA cleanup stopped: a QA record is linked to a real account';
  END IF;

  DELETE FROM public.doctor_transactions
   WHERE appointment_id = ANY (v_appts) OR doctor_details_id = ANY (v_doctors);
  DELETE FROM public.appointments WHERE id = ANY (v_appts);
  -- clinics has no FK to doctor_details; schedules / time off cascade from clinics.
  DELETE FROM public.clinics WHERE doctor_id = ANY (v_doctors);
  -- profiles has no FK to auth.users; doctor/patient details, medical profile,
  -- profile views, etc. cascade from profiles.
  DELETE FROM public.profiles WHERE id = ANY (v_profiles);
  DELETE FROM public.user_roles WHERE user_id = ANY (v_users);
  -- subscriptions, addresses, emergency contacts, notifications, identities and
  -- sessions cascade from auth.users.
  DELETE FROM auth.users WHERE id = ANY (v_users);
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RAISE NOTICE 'QA cleanup: % accounts deleted', v_n;
END $$;
