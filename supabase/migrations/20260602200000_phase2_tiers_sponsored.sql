-- ============================================================================
-- Phase 2 — Subscription tiers redesign + Pay-to-rank (Sponsored slots)
--
-- Goals:
--   1. Redefine subscription tiers: Free / Premium / Gold with explicit
--      commission_pct, ranking_boost, and sponsored_eligible flags.
--   2. New sponsored_slots table (Gold doctors only) — per region+specialty
--      monthly bidding for top-3 placement on /doctors search.
--   3. sponsored_impressions table for analytics + daily budget capping.
--   4. Ranking helper: public.doctor_ranking_score(doctor_id) — combines
--      verification_level + tier_boost + recency for organic ordering.
--
-- Compliance & SEO (Rank Math course module 7 — Local SEO + Trust):
--   * Sponsored placements MUST be visually labeled "إعلان" / "Sponsored"
--     to comply with Egypt CPA Law 181/2018 + UAE eCommerce 2/2002 +
--     Saudi e-commerce law 2019. Schema.org Offer + advertisingPolicy
--     declared on /doctors page.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Extend subscription_plans with tier metadata
-- ----------------------------------------------------------------------------
ALTER TABLE public.subscription_plans
  ADD COLUMN IF NOT EXISTS tier              TEXT NOT NULL DEFAULT 'free'
    CHECK (tier IN ('free','premium','gold')),
  ADD COLUMN IF NOT EXISTS commission_pct    NUMERIC(5,2) NOT NULL DEFAULT 15.00,
  ADD COLUMN IF NOT EXISTS ranking_boost     INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS sponsored_eligible BOOLEAN NOT NULL DEFAULT FALSE;

-- ----------------------------------------------------------------------------
-- 2) Re-seed plans (Free / Premium 250 EGP / Gold 700 EGP)
--    UPDATE existing rows so we keep stripe_price_id continuity if any.
-- ----------------------------------------------------------------------------
UPDATE public.subscription_plans SET
  name_en = 'Free',
  name_ar = 'مجاني',
  description_en = 'Basic listing — appears in organic search results',
  description_ar = 'ملف أساسي يظهر في نتائج البحث العضوية',
  price_cents = 0,
  tier = 'free',
  commission_pct = 15.00,
  ranking_boost = 0,
  sponsored_eligible = FALSE,
  features = '[
    "ملف أساسي",
    "ظهور في النتائج العضوية",
    "قبول الحجوزات الحضورية",
    "عمولة 15% على الحجوزات"
  ]'::jsonb,
  sort_order = 1
WHERE code = 'doctor_free';

UPDATE public.subscription_plans SET
  code = 'doctor_premium_monthly',
  name_en = 'Premium',
  name_ar = 'بريميوم',
  description_en = 'Higher organic ranking, analytics, verified-priority badge',
  description_ar = 'ترتيب أعلى في النتائج العضوية، تحليلات، أولوية موثّق',
  price_cents = 25000,
  tier = 'premium',
  commission_pct = 12.00,
  ranking_boost = 10,
  sponsored_eligible = FALSE,
  features = '[
    "كل مميزات الخطة المجانية",
    "ترتيب أعلى في نتائج البحث العضوية",
    "شارة بريميوم على البروفايل",
    "تحليلات مفصّلة (مشاهدات، معدلات الحجز)",
    "أولوية الدعم الفني",
    "عمولة 12% بدلاً من 15%"
  ]'::jsonb,
  sort_order = 2
WHERE code = 'doctor_pro_monthly';

UPDATE public.subscription_plans SET
  code = 'doctor_gold_monthly',
  name_en = 'Gold',
  name_ar = 'جولد',
  description_en = 'Eligible for Sponsored top-3 slots + lowest commission',
  description_ar = 'يحق لك حجز أماكن الـ Sponsored في أعلى النتائج + أقل عمولة',
  price_cents = 70000,
  tier = 'gold',
  commission_pct = 10.00,
  ranking_boost = 20,
  sponsored_eligible = TRUE,
  features = '[
    "كل مميزات Premium",
    "حق المنافسة على أماكن Sponsored (أعلى النتائج بشارة \"إعلان\")",
    "حد ميزانية يومية للمزايدة",
    "تحليلات الإعلانات (مشاهدات/نقرات/CTR)",
    "موقع بروفايل خاص dr-{name}.mytabibi.com",
    "PWA قابل للتنصيب باسم العيادة",
    "عمولة 10% فقط (الأقل في السوق)"
  ]'::jsonb,
  sort_order = 3
WHERE code = 'doctor_pro_plus_monthly';

-- ----------------------------------------------------------------------------
-- 3) sponsored_slots — Gold doctors bid here
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sponsored_slots (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id           UUID NOT NULL REFERENCES public.doctor_details(id) ON DELETE CASCADE,
  -- Targeting (any combination)
  governorate_id      UUID REFERENCES public.regions(id) ON DELETE SET NULL,
  city_id             UUID REFERENCES public.regions(id) ON DELETE SET NULL,
  specialty           TEXT,
  -- Budget
  monthly_budget_cents INTEGER NOT NULL CHECK (monthly_budget_cents >= 10000), -- min 100 EGP
  daily_cap_cents     INTEGER,                                                  -- optional daily cap
  cpc_bid_cents       INTEGER NOT NULL DEFAULT 200 CHECK (cpc_bid_cents >= 50), -- cost per click, min 0.50 EGP
  -- State
  status              TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','active','paused','exhausted','expired','cancelled')),
  spent_total_cents   INTEGER NOT NULL DEFAULT 0,
  spent_today_cents   INTEGER NOT NULL DEFAULT 0,
  spent_today_date    DATE NOT NULL DEFAULT CURRENT_DATE,
  starts_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  ends_at             TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_slots_doctor      ON public.sponsored_slots(doctor_id);
CREATE INDEX IF NOT EXISTS idx_slots_status      ON public.sponsored_slots(status);
CREATE INDEX IF NOT EXISTS idx_slots_targeting   ON public.sponsored_slots(governorate_id, specialty)
  WHERE status = 'active';

ALTER TABLE public.sponsored_slots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "slots_doctor_view" ON public.sponsored_slots;
CREATE POLICY "slots_doctor_view" ON public.sponsored_slots
  FOR SELECT TO authenticated
  USING (
    doctor_id IN (
      SELECT dd.id FROM public.doctor_details dd
      JOIN public.profiles p ON p.id = dd.profile_id
      WHERE p.user_id = auth.uid()
    )
    OR public.is_admin()
  );

-- Active slots are publicly readable (so /doctors page can render Sponsored)
DROP POLICY IF EXISTS "slots_public_active_read" ON public.sponsored_slots;
CREATE POLICY "slots_public_active_read" ON public.sponsored_slots
  FOR SELECT TO anon, authenticated
  USING (status = 'active');

DROP POLICY IF EXISTS "slots_admin_all" ON public.sponsored_slots;
CREATE POLICY "slots_admin_all" ON public.sponsored_slots
  FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ----------------------------------------------------------------------------
-- 4) sponsored_impressions — analytics + budget enforcement
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.sponsored_impressions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slot_id      UUID NOT NULL REFERENCES public.sponsored_slots(id) ON DELETE CASCADE,
  doctor_id    UUID NOT NULL REFERENCES public.doctor_details(id) ON DELETE CASCADE,
  occurred_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  position     SMALLINT,                       -- 1, 2, 3 (top-3 slots)
  event_type   TEXT NOT NULL DEFAULT 'impression'
    CHECK (event_type IN ('impression','click','book')),
  cost_cents   INTEGER NOT NULL DEFAULT 0,     -- charged on click/book
  -- Privacy: store only hashed session, not user identifying info
  session_hash TEXT
);

CREATE INDEX IF NOT EXISTS idx_imp_slot       ON public.sponsored_impressions(slot_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_imp_doctor     ON public.sponsored_impressions(doctor_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_imp_event_date ON public.sponsored_impressions(event_type, occurred_at DESC);

ALTER TABLE public.sponsored_impressions ENABLE ROW LEVEL SECURITY;

-- Insert allowed by anyone authenticated (public can be tracked via server fn with rate-limit)
DROP POLICY IF EXISTS "imp_insert_authenticated" ON public.sponsored_impressions;
CREATE POLICY "imp_insert_authenticated" ON public.sponsored_impressions
  FOR INSERT TO anon, authenticated
  WITH CHECK (true);

-- Doctor reads own / admin reads all
DROP POLICY IF EXISTS "imp_doctor_read" ON public.sponsored_impressions;
CREATE POLICY "imp_doctor_read" ON public.sponsored_impressions
  FOR SELECT TO authenticated
  USING (
    doctor_id IN (
      SELECT dd.id FROM public.doctor_details dd
      JOIN public.profiles p ON p.id = dd.profile_id
      WHERE p.user_id = auth.uid()
    )
    OR public.is_admin()
  );

-- ----------------------------------------------------------------------------
-- 5) helper: doctor_active_tier(doctor_details_id) → 'free' | 'premium' | 'gold'
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
      ORDER BY
        CASE sp.tier WHEN 'gold' THEN 3 WHEN 'premium' THEN 2 ELSE 1 END DESC
      LIMIT 1
    ),
    'free'
  );
$$;

-- ----------------------------------------------------------------------------
-- 6) helper: doctor_ranking_score — used by /doctors organic ordering
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.doctor_ranking_score(doctor_details_id UUID)
RETURNS INTEGER
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT (
    -- verification (0–40)
    CASE
      WHEN dd.verification_level >= 2 THEN 40
      WHEN dd.verification_level = 1 THEN 15
      ELSE 0
    END
    -- tier boost (0–20)
    + COALESCE(
        (SELECT sp.ranking_boost FROM public.subscription_plans sp
         WHERE sp.tier = public.doctor_active_tier(dd.id) LIMIT 1),
        0
      )
    -- rating (0–25)
    + COALESCE(LEAST(25, ROUND(dd.rating * 5)::int), 0)
    -- recency: doctors active in last 30 days get +10
    + CASE WHEN dd.updated_at > now() - INTERVAL '30 days' THEN 10 ELSE 0 END
    -- profile completeness (0–5): photo + bio + at least 1 clinic
    + CASE WHEN dd.bio IS NOT NULL AND length(dd.bio) > 50 THEN 5 ELSE 0 END
  )::int
  FROM public.doctor_details dd
  WHERE dd.id = doctor_details_id;
$$;
