-- ============================================================================
-- Auto 30-day Gold trial for every NEW doctor.
--
-- When a doctor_details row is created (a doctor registers), grant a Gold
-- subscription with status='trialing' that expires in 30 days. Because
-- doctor_active_tier() already honors status IN ('active','trialing') AND
-- current_period_end > now(), the whole app (web + mobile) treats the doctor as
-- Gold during the trial and automatically reverts to Free when it lapses — no
-- extra plumbing, no cron needed.
--
-- The subscriptions table requires non-null stripe_* / price_id columns (built
-- for Stripe), so we insert synthetic placeholders and mark is_manual = true.
-- access_status='verified' grants access immediately.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.grant_new_doctor_gold_trial()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
BEGIN
  SELECT p.user_id INTO v_user_id
  FROM public.profiles p
  WHERE p.id = NEW.profile_id;

  IF v_user_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Don't override an existing subscription (e.g. re-created doctor row).
  IF EXISTS (SELECT 1 FROM public.subscriptions WHERE user_id = v_user_id) THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.subscriptions (
    user_id, stripe_subscription_id, stripe_customer_id, price_id,
    plan_code, status, current_period_start, current_period_end,
    environment, access_status, access_granted_at, is_manual
  ) VALUES (
    v_user_id,
    'trial_' || v_user_id::text,
    'trial',
    'trial',
    'doctor_gold_monthly',
    'trialing',
    now(),
    now() + interval '30 days',
    'live',
    'verified',
    now(),
    true
  )
  ON CONFLICT (stripe_subscription_id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_new_doctor_gold_trial ON public.doctor_details;
CREATE TRIGGER trg_new_doctor_gold_trial
  AFTER INSERT ON public.doctor_details
  FOR EACH ROW
  EXECUTE FUNCTION public.grant_new_doctor_gold_trial();
