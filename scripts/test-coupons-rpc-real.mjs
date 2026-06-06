// Validate record_coupon_redemption end-to-end against a paid appointment
// whose patient profile has a real user_id. Cleans up afterwards.
const TOKEN = process.env.SUPABASE_MANAGEMENT_TOKEN;
if (!TOKEN) { console.error("Set SUPABASE_MANAGEMENT_TOKEN env var."); process.exit(1); }
const PROJECT = "wqrrwvaxovrjjiilqkmt";
const APPT = "358659ad-de12-4ee9-95d5-f03ea97bfec4"; // fee=1000, paid, real user

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

console.log("Stamp appointment with WELCOME10 (10% of 1000 = 100):");
console.log(await q(`UPDATE public.appointments SET coupon_code='WELCOME10', coupon_discount=100, fee=900 WHERE id='${APPT}' RETURNING id, fee, coupon_code, coupon_discount;`));

console.log("\nFirst RPC call:");
console.log(await q(`SELECT public.record_coupon_redemption('${APPT}'::UUID) AS rid;`));

console.log("\nSecond RPC call (idempotency check):");
console.log(await q(`SELECT public.record_coupon_redemption('${APPT}'::UUID) AS rid;`));

console.log("\nRedemption row:");
console.log(await q(`SELECT id, coupon_id, user_id, discount_amount, original_amount, final_amount, currency FROM public.coupon_redemptions WHERE appointment_id='${APPT}';`));

console.log("\nCoupon usage counter:");
console.log(await q(`SELECT code, times_used FROM public.coupons WHERE code='WELCOME10';`));

console.log("\nCleanup:");
console.log(await q(`DELETE FROM public.coupon_redemptions WHERE appointment_id='${APPT}'; UPDATE public.coupons SET times_used = GREATEST(times_used - 1, 0) WHERE code = 'WELCOME10'; UPDATE public.appointments SET coupon_code=NULL, coupon_discount=NULL, fee=1000 WHERE id='${APPT}';`));
