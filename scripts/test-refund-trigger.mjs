// Test the refund trigger atomically in a transaction that rolls back.
const TOKEN = process.env.SUPABASE_MANAGEMENT_TOKEN;
if (!TOKEN) { console.error("Set SUPABASE_MANAGEMENT_TOKEN env var."); process.exit(1); }
const PROJECT = "wqrrwvaxovrjjiilqkmt";

async function q(sql) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: sql }),
  });
  return [res.status, await res.text()];
}

const APPT_ID = "976d3208-7c46-4d7e-9c97-8d59c9cc69f5"; // fee=750, net=675

const [_s0, t0] = await q(
  `SELECT id, type, gross_amount, platform_fee, net_amount FROM public.doctor_transactions WHERE appointment_id='${APPT_ID}' ORDER BY created_at;`,
);
console.log("BEFORE:", t0);

const partialSql = `
BEGIN;
UPDATE public.appointments
   SET payment_status = 'partially_refunded',
       refunded_amount = 250
 WHERE id = '${APPT_ID}';
SELECT id, type, gross_amount, platform_fee, net_amount, description, metadata
  FROM public.doctor_transactions
 WHERE appointment_id = '${APPT_ID}' AND type = 'refund';
ROLLBACK;
`;
const [s1, t1] = await q(partialSql);
console.log("PARTIAL REFUND TEST (rolled back):", s1, t1);

const fullSql = `
BEGIN;
UPDATE public.appointments
   SET payment_status = 'refunded'
 WHERE id = '${APPT_ID}';
SELECT id, type, gross_amount, platform_fee, net_amount, description, metadata
  FROM public.doctor_transactions
 WHERE appointment_id = '${APPT_ID}' AND type = 'refund';
ROLLBACK;
`;
const [s2, t2] = await q(fullSql);
console.log("FULL REFUND TEST (rolled back):", s2, t2);

const [_s3, t3] = await q(
  `SELECT id, type, gross_amount, platform_fee, net_amount FROM public.doctor_transactions WHERE appointment_id='${APPT_ID}' ORDER BY created_at;`,
);
console.log("AFTER (should match BEFORE):", t3);
