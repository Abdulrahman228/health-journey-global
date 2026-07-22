-- ============================================================================
-- doctor_subscription_status() — what the doctor's subscription screen shows.
--
-- Returns the caller-doctor's effective plan state so the app can say clearly:
--   • "أنت على تجربة Gold مجانية — باقٍ X يوم"  (free-month trial)
--   • "اشتراك Gold فعّال — باقٍ X يوم"           (paid / comped, dated)
--   • "Gold مدى الحياة"                          (comped lifetime, no expiry)
--   • free                                        (no active plan)
-- Mirrors the exact access rule inside doctor_active_tier(). Read-only + additive.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.doctor_subscription_status()
RETURNS TABLE (
  tier               text,
  is_trial           boolean,
  is_lifetime        boolean,
  current_period_end timestamptz,
  days_left          integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_doctor uuid;
  v_status text;
  v_end    timestamptz;
BEGIN
  tier := 'free'; is_trial := false; is_lifetime := false;
  current_period_end := NULL; days_left := NULL;

  SELECT dd.id INTO v_doctor
  FROM public.doctor_details dd
  JOIN public.profiles p ON p.id = dd.profile_id
  WHERE p.user_id = auth.uid()
  LIMIT 1;

  IF v_doctor IS NULL THEN
    RETURN NEXT; RETURN;
  END IF;

  tier := public.doctor_active_tier(v_doctor);

  SELECT s.status, s.current_period_end
    INTO v_status, v_end
  FROM public.subscriptions s
  JOIN public.subscription_plans sp ON sp.code = s.plan_code
  WHERE s.user_id = auth.uid()
    AND s.status IN ('active','trialing')
    AND (s.current_period_end IS NULL OR s.current_period_end > now())
    AND (
      s.access_status = 'verified'
      OR (s.access_status = 'pending' AND s.access_granted_at IS NOT NULL
          AND s.access_granted_at > now() - interval '24 hours')
    )
  ORDER BY
    CASE sp.tier WHEN 'gold' THEN 3 WHEN 'premium' THEN 2 ELSE 1 END DESC,
    (s.current_period_end IS NULL) DESC,   -- lifetime first
    s.current_period_end DESC
  LIMIT 1;

  IF FOUND THEN
    is_trial := (v_status = 'trialing');
    is_lifetime := (v_end IS NULL);
    current_period_end := v_end;
    IF v_end IS NOT NULL THEN
      days_left := GREATEST(0, CEIL(EXTRACT(EPOCH FROM (v_end - now())) / 86400.0))::int;
    END IF;
  END IF;

  RETURN NEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION public.doctor_subscription_status() TO authenticated;
