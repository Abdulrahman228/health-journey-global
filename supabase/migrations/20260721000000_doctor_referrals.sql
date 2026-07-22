-- ============================================================================
-- Doctor → doctor referral engine (the compliant, warm growth loop).
--
-- Each doctor gets a unique referral_code + a shareable link. When a peer they
-- invited joins, the peer's app records the attribution via attribute_referral()
-- (consented, self-serve — no scraping, no cold contact). The referrer sees a
-- live count. This is the "doctors trust doctors" engine.
--
-- Additive & safe: one column + one table (RLS-locked, RPC-only) + three RPCs.
-- ============================================================================

-- 1) Per-doctor referral code.
ALTER TABLE public.doctor_details
  ADD COLUMN IF NOT EXISTS referral_code text;

CREATE UNIQUE INDEX IF NOT EXISTS uniq_doctor_details_referral_code
  ON public.doctor_details (referral_code)
  WHERE referral_code IS NOT NULL;

-- 2) Attribution log — one referrer per referred doctor (idempotent + abuse-proof).
CREATE TABLE IF NOT EXISTS public.doctor_referrals (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_doctor_id uuid NOT NULL REFERENCES public.doctor_details(id) ON DELETE CASCADE,
  referred_doctor_id uuid NOT NULL UNIQUE REFERENCES public.doctor_details(id) ON DELETE CASCADE,
  created_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_doctor_referrals_referrer
  ON public.doctor_referrals (referrer_doctor_id);

-- RLS on, ZERO client policies: the table is reachable only via the SECURITY
-- DEFINER RPCs below (no direct reads/writes from the apps).
ALTER TABLE public.doctor_referrals ENABLE ROW LEVEL SECURITY;

-- Helper: resolve the calling user's doctor_details id.
CREATE OR REPLACE FUNCTION public._caller_doctor_id()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT dd.id FROM public.doctor_details dd
  JOIN public.profiles p ON p.id = dd.profile_id
  WHERE p.user_id = auth.uid()
  LIMIT 1;
$$;

-- 3a) Ensure + return the caller-doctor's referral code (generates once).
CREATE OR REPLACE FUNCTION public.ensure_referral_code()
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_doctor uuid;
  v_code   text;
BEGIN
  v_doctor := public._caller_doctor_id();
  IF v_doctor IS NULL THEN RETURN NULL; END IF;

  SELECT referral_code INTO v_code FROM public.doctor_details WHERE id = v_doctor;
  IF v_code IS NOT NULL THEN RETURN v_code; END IF;

  LOOP
    v_code := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));
    BEGIN
      UPDATE public.doctor_details SET referral_code = v_code WHERE id = v_doctor;
      EXIT;
    EXCEPTION WHEN unique_violation THEN
      -- extremely rare collision → retry
    END;
  END LOOP;
  RETURN v_code;
END;
$$;

-- 3b) The caller-doctor's referral code + how many peers they've brought.
CREATE OR REPLACE FUNCTION public.my_referral_stats()
RETURNS TABLE (referral_code text, referred_count integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_doctor uuid;
  v_code   text;
BEGIN
  v_doctor := public._caller_doctor_id();
  IF v_doctor IS NULL THEN
    referral_code := NULL; referred_count := 0; RETURN NEXT; RETURN;
  END IF;

  SELECT dd.referral_code INTO v_code FROM public.doctor_details dd WHERE dd.id = v_doctor;

  SELECT v_code, COALESCE(COUNT(r.id), 0)::int
    INTO referral_code, referred_count
  FROM public.doctor_referrals r
  WHERE r.referrer_doctor_id = v_doctor;

  RETURN NEXT;
END;
$$;

-- 3c) The referred doctor records who invited them (idempotent, no self-referral).
--     Returns true when a NEW attribution was created.
CREATE OR REPLACE FUNCTION public.attribute_referral(p_code text)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_referred uuid;
  v_referrer uuid;
BEGIN
  v_referred := public._caller_doctor_id();
  IF v_referred IS NULL OR p_code IS NULL OR btrim(p_code) = '' THEN
    RETURN false;
  END IF;

  SELECT id INTO v_referrer FROM public.doctor_details
  WHERE upper(referral_code) = upper(btrim(p_code));

  IF v_referrer IS NULL OR v_referrer = v_referred THEN
    RETURN false; -- unknown code or self-referral
  END IF;

  INSERT INTO public.doctor_referrals (referrer_doctor_id, referred_doctor_id)
  VALUES (v_referrer, v_referred)
  ON CONFLICT (referred_doctor_id) DO NOTHING;

  RETURN FOUND;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ensure_referral_code()          TO authenticated;
GRANT EXECUTE ON FUNCTION public.my_referral_stats()             TO authenticated;
GRANT EXECUTE ON FUNCTION public.attribute_referral(text)        TO authenticated;
