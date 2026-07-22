-- ============================================================================
-- Trust-but-Verify · manual (receipt-based) subscription access
--
-- Doctors who pay manually (bank/InstaPay receipt) get Gold IMMEDIATELY but are
-- flagged pending until an admin verifies the receipt. Access is modeled on the
-- existing `subscriptions` table (the single source of truth that
-- doctor_active_tier() already reads) rather than a parallel table, so the whole
-- app honors it with no extra plumbing.
--
--   access_status:  'pending' | 'verified' | 'rejected'
--     * verified  -> full access (Stripe rows default here; they're pre-verified)
--     * pending   -> access ONLY for the first 24h after access_granted_at
--     * rejected  -> no access (revoked)
-- ============================================================================

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS access_status text NOT NULL DEFAULT 'verified'
    CHECK (access_status IN ('pending', 'verified', 'rejected')),
  ADD COLUMN IF NOT EXISTS access_granted_at timestamptz,
  ADD COLUMN IF NOT EXISTS is_manual boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS receipt_url text;

-- Fast lookup for the admin "Subscription Requests" queue.
CREATE INDEX IF NOT EXISTS idx_subscriptions_pending_manual
  ON public.subscriptions (created_at DESC)
  WHERE is_manual = true AND access_status = 'pending';

-- ----------------------------------------------------------------------------
-- Recreate doctor_active_tier with the access-window rule baked in, so a
-- rejected receipt (or a pending one older than 24h) stops granting Gold
-- everywhere the tier is read (accounting, analytics, sponsorship, ranking...).
-- This is the SQL twin of hasValidAccess() in src/lib/subscriptions.access.ts.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.doctor_active_tier(doctor_details_id UUID)
RETURNS TEXT
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (
      SELECT sp.tier
      FROM public.subscriptions s
      JOIN public.subscription_plans sp ON sp.code = s.plan_code
      JOIN public.doctor_details dd ON dd.profile_id IN (
        SELECT p.id FROM public.profiles p WHERE p.user_id = s.user_id
      )
      WHERE dd.id = doctor_details_id
        AND s.status IN ('active','trialing')
        AND (s.current_period_end IS NULL OR s.current_period_end > now())
        -- Trust-but-Verify access window:
        AND (
          s.access_status = 'verified'
          OR (
            s.access_status = 'pending'
            AND s.access_granted_at IS NOT NULL
            AND s.access_granted_at > now() - interval '24 hours'
          )
        )
      ORDER BY
        CASE sp.tier WHEN 'gold' THEN 3 WHEN 'premium' THEN 2 ELSE 1 END DESC
      LIMIT 1
    ),
    'free'
  );
$$;

-- ----------------------------------------------------------------------------
-- Ensure the YEARLY Gold plan exists in subscription_plans. Gold Yearly was
-- added in the app layer (plans.ts) but never seeded here, so without this a
-- `doctor_gold_yearly` subscription (manual OR Stripe) would fail the
-- sp.code = s.plan_code join in doctor_active_tier and resolve to 'free'.
-- Clones the monthly Gold row's attributes with a yearly price/interval.
-- ----------------------------------------------------------------------------
INSERT INTO public.subscription_plans
  (code, name_en, name_ar, description_en, description_ar, price_cents, currency,
   interval, features, is_active, sort_order, tier, commission_pct, ranking_boost, sponsored_eligible)
SELECT
  'doctor_gold_yearly', name_en, name_ar, description_en, description_ar,
  999900, currency, 'year', features, is_active, sort_order + 1,
  tier, commission_pct, ranking_boost, sponsored_eligible
FROM public.subscription_plans
WHERE code = 'doctor_gold_monthly'
ON CONFLICT (code) DO NOTHING;
