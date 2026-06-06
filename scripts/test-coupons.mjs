// Smoke-test the coupons workflow:
// 1. Insert a sample coupon
// 2. Verify validateCoupon equivalent (direct SELECT)
// 3. Test record_coupon_redemption RPC (rolled back)
const TOKEN = process.env.SUPABASE_MANAGEMENT_TOKEN;
if (!TOKEN) { console.error("Set SUPABASE_MANAGEMENT_TOKEN env var."); process.exit(1); }
const PROJECT = "wqrrwvaxovrjjiilqkmt";

async function q(sql) {
  const r = await fetch(
    `https://api.supabase.com/v1/projects/${PROJECT}/database/query`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query: sql }),
    },
  );
  const text = await r.text();
  try { return { status: r.status, json: JSON.parse(text) }; }
  catch { return { status: r.status, raw: text }; }
}

// 1. Seed two coupons (idempotent via ON CONFLICT)
console.log("1) Seeding coupons…");
const seed = await q(`
  INSERT INTO public.coupons (code, description, discount_type, discount_value, min_amount, usage_limit_per_user, applies_to, is_active)
  VALUES
    ('WELCOME10', 'خصم 10% للحجز الأول', 'percent', 10, 100, 1, 'all', TRUE),
    ('FLAT50', 'خصم ثابت 50 جنيه', 'fixed', 50, 100, 1, 'all', TRUE)
  ON CONFLICT (code) DO UPDATE SET
    description = EXCLUDED.description,
    discount_value = EXCLUDED.discount_value,
    min_amount = EXCLUDED.min_amount,
    usage_limit_per_user = EXCLUDED.usage_limit_per_user,
    is_active = EXCLUDED.is_active,
    updated_at = NOW();
`);
console.log(seed);

// 2. Verify
const list = await q("SELECT code, discount_type, discount_value, is_active, times_used FROM public.coupons WHERE code IN ('WELCOME10','FLAT50') ORDER BY code;");
console.log("2) Active coupons:", list.json);

// 3. Wrap a redemption test in a transaction so it rolls back.
//    Uses the appointment 976d3208-7c46-4d7e-9c97-8d59c9cc69f5 (paid, 750 EGP).
console.log("3) Redemption test (rolled back)…");
const redeem = await q(`
  BEGIN;
  -- Pretend the user applied WELCOME10 at checkout
  UPDATE public.appointments
     SET coupon_code = 'WELCOME10',
         coupon_discount = 75,
         fee = 675
   WHERE id = '976d3208-7c46-4d7e-9c97-8d59c9cc69f5';

  SELECT public.record_coupon_redemption('976d3208-7c46-4d7e-9c97-8d59c9cc69f5'::UUID) AS redemption_id;

  -- Re-call to confirm idempotency (should return the same id, not insert again)
  SELECT public.record_coupon_redemption('976d3208-7c46-4d7e-9c97-8d59c9cc69f5'::UUID) AS redemption_id_again;

  SELECT id, coupon_id, user_id, discount_amount, original_amount, final_amount, currency
    FROM public.coupon_redemptions
   WHERE appointment_id = '976d3208-7c46-4d7e-9c97-8d59c9cc69f5';

  SELECT code, times_used FROM public.coupons WHERE code = 'WELCOME10';
  ROLLBACK;
`);
console.log(redeem);
