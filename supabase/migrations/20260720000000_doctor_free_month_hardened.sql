-- ============================================================================
-- Doctor free month (Gold trial) — hardened & robust.
--
-- Problem with the first version (20260717010000): the AFTER INSERT trigger
-- inserted the trial subscription directly, so ANY failure there rolled back the
-- doctor_details insert → doctor registration itself could break. It also never
-- covered doctors created before it, and anchored the window to now() instead of
-- the join date.
--
-- This replaces it with a belt-and-suspenders design:
--   1) grant_doctor_trial_if_absent(doctor_id) — the single source of truth.
--      Grants a 30-day Gold trial ANCHORED TO THE JOIN DATE (doctor_details.created_at),
--      only if the doctor has NO subscription yet AND the 30-day window is still
--      open. Idempotent + abuse-proof (one trial per doctor, ever).
--   2) A SAFE trigger that calls it inside an exception guard → registration can
--      never be blocked by trial errors.
--   3) ensure_doctor_trial() RPC the app calls on doctor login (last-resort net).
--   4) A one-time backfill for existing doctors.
--
-- doctor_active_tier() already treats status='trialing' + verified + not-expired
-- as Gold, and 'doctor_gold_monthly' maps to tier='gold' in subscription_plans,
-- so no tier-logic change is needed. Additive & safe.
-- ============================================================================

-- 1) Single source of truth.
CREATE OR REPLACE FUNCTION public.grant_doctor_trial_if_absent(p_doctor_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user    uuid;
  v_created timestamptz;
BEGIN
  SELECT p.user_id, dd.created_at
    INTO v_user, v_created
  FROM public.doctor_details dd
  JOIN public.profiles p ON p.id = dd.profile_id
  WHERE dd.id = p_doctor_id;

  IF v_user IS NULL THEN
    RETURN; -- no owner resolved yet
  END IF;

  -- One trial per doctor, ever (also blocks re-grant after it lapses).
  IF EXISTS (SELECT 1 FROM public.subscriptions WHERE user_id = v_user) THEN
    RETURN;
  END IF;

  IF v_created IS NULL THEN v_created := now(); END IF;

  -- Anchor the 30-day window to the JOIN date; don't grant a dead trial.
  IF v_created + interval '30 days' <= now() THEN
    RETURN;
  END IF;

  INSERT INTO public.subscriptions (
    user_id, stripe_subscription_id, stripe_customer_id, price_id,
    plan_code, status, current_period_start, current_period_end,
    environment, access_status, access_granted_at, is_manual
  ) VALUES (
    v_user,
    'trial_' || v_user::text,
    'trial',
    'trial',
    'doctor_gold_monthly',
    'trialing',
    v_created,
    v_created + interval '30 days',
    'live',
    'verified',
    now(),
    true
  )
  ON CONFLICT (stripe_subscription_id) DO NOTHING;
END;
$$;

-- 2) SAFE trigger — trial errors must NEVER block doctor registration.
CREATE OR REPLACE FUNCTION public.grant_new_doctor_gold_trial()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  BEGIN
    PERFORM public.grant_doctor_trial_if_absent(NEW.id);
  EXCEPTION WHEN OTHERS THEN
    NULL; -- best-effort: registration always succeeds
  END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_new_doctor_gold_trial ON public.doctor_details;
CREATE TRIGGER trg_new_doctor_gold_trial
  AFTER INSERT ON public.doctor_details
  FOR EACH ROW
  EXECUTE FUNCTION public.grant_new_doctor_gold_trial();

-- 3) Last-resort net: the doctor app calls this on login/dashboard load. Resolves
--    the CALLER's own doctor row, ensures the trial, returns the current tier.
CREATE OR REPLACE FUNCTION public.ensure_doctor_trial()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_doctor uuid;
BEGIN
  SELECT dd.id INTO v_doctor
  FROM public.doctor_details dd
  JOIN public.profiles p ON p.id = dd.profile_id
  WHERE p.user_id = auth.uid()
  LIMIT 1;

  IF v_doctor IS NULL THEN
    RETURN 'free';
  END IF;

  BEGIN
    PERFORM public.grant_doctor_trial_if_absent(v_doctor);
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;

  RETURN public.doctor_active_tier(v_doctor);
END;
$$;

GRANT EXECUTE ON FUNCTION public.ensure_doctor_trial() TO authenticated;

-- 4) One-time backfill for doctors that already exist (test doctors today).
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT id FROM public.doctor_details LOOP
    BEGIN
      PERFORM public.grant_doctor_trial_if_absent(r.id);
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END LOOP;
END $$;
