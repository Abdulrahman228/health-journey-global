// E2E test for notifications event triggers.
const TOKEN = process.env.SUPABASE_MANAGEMENT_TOKEN;
if (!TOKEN) {
  console.error("Set SUPABASE_MANAGEMENT_TOKEN env var.");
  process.exit(1);
}
const PROJECT = "wqrrwvaxovrjjiilqkmt";
const URL = `https://api.supabase.com/v1/projects/${PROJECT}/database/query`;

async function sql(q) {
  const r = await fetch(URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: q }),
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`SQL ${r.status}: ${text}`);
  try { return JSON.parse(text); } catch { return text; }
}

const APPT = "358659ad-de12-4ee9-95d5-f03ea97bfec4";
const PATIENT_USER = "69613505-6042-4bd2-b3ee-6e56364c48db";
const DOCTOR_USER = "f980ae3e-2aeb-4e79-839e-1742c840c192";

console.log("--- Cleanup pre-test notifications ---");
await sql(
  `DELETE FROM notifications WHERE metadata ->> 'event_key' LIKE 'appt:${APPT}:%' OR metadata ->> 'event_key' LIKE 'review:%:p3test%'`,
);

console.log("--- Reset appointment to fresh state ---");
await sql(
  `UPDATE appointments SET status='confirmed', payment_status='pending' WHERE id='${APPT}'`,
);
await sql(
  `DELETE FROM notifications WHERE metadata ->> 'event_key' LIKE 'appt:${APPT}:%'`,
);

console.log("\n--- Test 1: payment_status -> paid (notifies patient) ---");
await sql(
  `UPDATE appointments SET payment_status='paid' WHERE id='${APPT}'`,
);
const paid = await sql(
  `SELECT user_id, kind, title FROM notifications WHERE metadata ->> 'event_key' = 'appt:${APPT}:paid'`,
);
console.log("paid notifs:", paid);

console.log("\n--- Test 2: status -> completed (notifies patient) ---");
await sql(`UPDATE appointments SET status='completed' WHERE id='${APPT}'`);
const completed = await sql(
  `SELECT user_id, kind FROM notifications WHERE metadata ->> 'event_key' = 'appt:${APPT}:completed'`,
);
console.log("completed notifs:", completed);

console.log("\n--- Test 3: status -> cancelled (notifies BOTH) ---");
await sql(`UPDATE appointments SET status='cancelled' WHERE id='${APPT}'`);
const cancelled = await sql(
  `SELECT user_id, kind FROM notifications WHERE metadata ->> 'event_key' LIKE 'appt:${APPT}:cancelled%' ORDER BY created_at`,
);
console.log("cancelled notifs:", cancelled);

console.log("\n--- Test 4: payment_status -> refunded ---");
await sql(`UPDATE appointments SET payment_status='refunded' WHERE id='${APPT}'`);
const refunded = await sql(
  `SELECT user_id, kind FROM notifications WHERE metadata ->> 'event_key' = 'appt:${APPT}:refunded'`,
);
console.log("refunded notifs:", refunded);

console.log("\n--- Test 5: idempotency (same UPDATE again) ---");
await sql(`UPDATE appointments SET payment_status='refunded' WHERE id='${APPT}'`);
const dup = await sql(
  `SELECT count(*) AS n FROM notifications WHERE metadata ->> 'event_key' = 'appt:${APPT}:refunded'`,
);
console.log("after dup update count:", dup);

console.log("\n--- Test 6: review submission notifies doctor ---");
// First we need to delete any prior review on this appointment + bring it back to completed+paid
await sql(`UPDATE appointments SET status='completed', payment_status='paid' WHERE id='${APPT}'`);
await sql(`DELETE FROM reviews WHERE appointment_id='${APPT}'`);
const [rev] = await sql(
  `INSERT INTO reviews (appointment_id, doctor_id, patient_id, rating, comment, status)
   SELECT id, doctor_id, patient_id, 5, 'p3 test review', 'pending'
     FROM appointments WHERE id='${APPT}'
   RETURNING id`,
);
console.log("inserted review:", rev);
const submitted = await sql(
  `SELECT user_id, kind FROM notifications WHERE metadata ->> 'event_key' = 'review:${rev.id}:submitted'`,
);
console.log("submitted notifs:", submitted);

console.log("\n--- Test 7: review approval notifies patient + doctor ---");
await sql(`UPDATE reviews SET status='approved' WHERE id='${rev.id}'`);
const approved = await sql(
  `SELECT user_id, metadata ->> 'event_key' as ek FROM notifications WHERE metadata ->> 'event_key' LIKE 'review:${rev.id}:approved%' ORDER BY created_at`,
);
console.log("approved notifs:", approved);

console.log("\n--- Final cleanup ---");
await sql(`DELETE FROM reviews WHERE id='${rev.id}'`);
await sql(
  `DELETE FROM notifications WHERE metadata ->> 'event_key' LIKE 'appt:${APPT}:%' OR metadata ->> 'event_key' LIKE 'review:${rev.id}:%'`,
);
// Restore appointment to canonical paid+completed state
await sql(`UPDATE appointments SET status='completed', payment_status='paid' WHERE id='${APPT}'`);

const ok =
  paid.length === 1 && paid[0].user_id === PATIENT_USER &&
  completed.length === 1 && completed[0].user_id === PATIENT_USER &&
  cancelled.length === 2 &&
  cancelled.some((c) => c.user_id === PATIENT_USER) &&
  cancelled.some((c) => c.user_id === DOCTOR_USER) &&
  refunded.length === 1 && refunded[0].user_id === PATIENT_USER &&
  dup[0].n === 1 &&
  submitted.length === 1 && submitted[0].user_id === DOCTOR_USER &&
  approved.length === 2;

console.log(ok ? "\nALL ASSERTIONS PASSED ✓" : "\nFAILED ✗");
process.exit(ok ? 0 : 1);
