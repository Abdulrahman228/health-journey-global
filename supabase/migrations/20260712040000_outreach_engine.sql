-- ============================================================================
-- Growth · Outreach Engine (WhatsApp) — candidate selection + opt-out
--
-- Both functions are SECURITY DEFINER and REVOKED from public/anon/authenticated
-- so ONLY the service role (the cron + webhook, via supabaseAdmin) can call
-- them. This matters because get_outreach_candidates returns claim_token + phone.
-- ============================================================================

-- Candidates for outreach: live, unclaimed, has a phone, NEVER contacted before
-- (listing_status is flipped to 'contacted' by the sender), and — belt &
-- suspenders — no successful outreach logged in the last 7 days. One message per
-- doctor by design. p_limit is the daily throttle.
CREATE OR REPLACE FUNCTION public.get_outreach_candidates(p_limit integer DEFAULT 50)
RETURNS TABLE (
  id          uuid,
  full_name   text,
  phone       text,
  specialty   text,
  city        text,
  claim_token uuid
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT s.id, s.full_name, s.phone, s.specialty, s.city, s.claim_token
  FROM public.scraped_doctors s
  WHERE s.opted_out = false
    AND s.is_claimed = false
    AND s.phone IS NOT NULL
    AND s.listing_status = 'unclaimed'
    -- Successful sends flip listing_status to 'contacted' (excluded above), so
    -- this only backs off FAILED attempts: any attempt in the last 7 days
    -- suppresses a retry, protecting sender reputation from bad numbers.
    AND NOT EXISTS (
      SELECT 1 FROM public.doctor_outreach o
      WHERE o.scraped_doctor_id = s.id
        AND o.created_at > now() - interval '7 days'
    )
  ORDER BY s.imported_at
  LIMIT GREATEST(1, LEAST(p_limit, 200));
$$;

REVOKE ALL ON FUNCTION public.get_outreach_candidates(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_outreach_candidates(integer) TO service_role;

-- Opt-out by phone (STOP/إلغاء handler). Matches on the last 10 digits so
-- +20 / leading-0 / spacing differences all resolve. Returns the affected ids
-- so the webhook can audit-log them.
CREATE OR REPLACE FUNCTION public.opt_out_scraped_by_phone(p_phone text)
RETURNS TABLE (id uuid)
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.scraped_doctors
  SET opted_out = true, opted_out_at = now(), listing_status = 'suppressed'
  WHERE opted_out = false
    AND phone IS NOT NULL
    AND right(regexp_replace(phone, '\D', '', 'g'), 10)
        = right(regexp_replace(p_phone, '\D', '', 'g'), 10)
  RETURNING id;
$$;

REVOKE ALL ON FUNCTION public.opt_out_scraped_by_phone(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.opt_out_scraped_by_phone(text) TO service_role;
