-- ============================================================================
-- 2026-11-09 — Gold Lifetime plan (owner decision: 19,999 EGP, one payment).
--
-- A lifetime subscription is a normal `subscriptions` row whose
-- current_period_end is NULL; doctor_active_tier() already treats NULL as
-- "never expires" (same path the admin lifetime grant uses).
-- Also aligns the monthly price with what the site and Paymob charge (999 EGP;
-- the row said 1,000) and refreshes the plan copy that the apps read.
-- ============================================================================
INSERT INTO public.subscription_plans
  (code, name_en, name_ar, description_en, description_ar, price_cents, currency, interval,
   features, is_active, sort_order, tier, commission_pct, ranking_boost, sponsored_eligible)
VALUES
  ('doctor_gold_lifetime', 'Gold Lifetime', 'الباقة الذهبية مدى الحياة',
   'Pay once, keep every Gold feature for life', 'ادفع مرة واحدة واحتفظ بكل مزايا جولد مدى الحياة',
   1999900, 'EGP', 'lifetime', '[]'::jsonb, true, 4, 'gold', 10.00, 20, true)
ON CONFLICT (code) DO UPDATE SET
  name_en = EXCLUDED.name_en,
  name_ar = EXCLUDED.name_ar,
  description_en = EXCLUDED.description_en,
  description_ar = EXCLUDED.description_ar,
  price_cents = EXCLUDED.price_cents,
  interval = EXCLUDED.interval,
  is_active = true,
  tier = 'gold',
  commission_pct = 10.00,
  ranking_boost = 20,
  sponsored_eligible = true,
  updated_at = now();

UPDATE public.subscription_plans
   SET price_cents = 99900, updated_at = now()
 WHERE code = 'doctor_gold_monthly' AND price_cents <> 99900;

UPDATE public.subscription_plans
   SET sponsored_eligible = true, updated_at = now()
 WHERE code = 'doctor_gold_yearly' AND sponsored_eligible = false;

NOTIFY pgrst, 'reload schema';
