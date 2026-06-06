// Step-by-step coupon RPC test (each step returned individually, all rolled back at end).
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
  return JSON.parse(await r.text());
}

// Wrap entire test in a single tx by chaining via SAVEPOINTs, but emulate by
// reading state in one trip via WITH common-table.
const sql = `
WITH stamp AS (
  UPDATE public.appointments
     SET coupon_code = 'WELCOME10',
         coupon_discount = 75,
         fee = 675
   WHERE id = '976d3208-7c46-4d7e-9c97-8d59c9cc69f5'
   RETURNING id, fee, coupon_code, coupon_discount
),
red1 AS (
  SELECT public.record_coupon_redemption('976d3208-7c46-4d7e-9c97-8d59c9cc69f5'::UUID) AS rid_first
),
red2 AS (
  SELECT public.record_coupon_redemption('976d3208-7c46-4d7e-9c97-8d59c9cc69f5'::UUID) AS rid_second
)
SELECT
  (SELECT row_to_json(stamp) FROM stamp) AS appointment_after_stamp,
  (SELECT rid_first FROM red1) AS first_call,
  (SELECT rid_second FROM red2) AS second_call_should_match,
  (SELECT row_to_json(r) FROM public.coupon_redemptions r WHERE appointment_id = '976d3208-7c46-4d7e-9c97-8d59c9cc69f5' LIMIT 1) AS redemption_row,
  (SELECT times_used FROM public.coupons WHERE code = 'WELCOME10') AS coupon_times_used;
`;

// Run inside an explicit transaction that rolls back via separate calls.
console.log("BEGIN…");
console.log(await q("BEGIN;"));
console.log("Step:");
console.log(JSON.stringify(await q(sql), null, 2));
console.log("ROLLBACK…");
console.log(await q("ROLLBACK;"));
