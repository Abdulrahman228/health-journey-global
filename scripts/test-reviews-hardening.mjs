// E2E test for reviews hardening: eligibility + uniqueness + aggregation.
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
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

const APPT = "358659ad-de12-4ee9-95d5-f03ea97bfec4";
// known: patient_id = 718db63b-7b1b-48c4-bdac-14e3d273860d (a profile.id), fee 1000, paid

// Look up doctor_id for the appointment.
const [appt] = await sql(
  `SELECT id, patient_id, doctor_id, status, payment_status, fee FROM appointments WHERE id='${APPT}'`,
);
console.log("appt:", appt);

if (appt.status !== "completed") {
  console.log("Setting status=completed…");
  await sql(`UPDATE appointments SET status='completed' WHERE id='${APPT}'`);
}

// Clean any previous test review
await sql(`DELETE FROM reviews WHERE appointment_id='${APPT}'`);

// Pre-state for doctor
const [pre] = await sql(
  `SELECT id, rating, reviews_count FROM doctor_details WHERE id='${appt.doctor_id}'`,
);
console.log("pre doctor:", pre);

// 1) Negative: bad patient_id (wrong profile)
let err1 = null;
try {
  await sql(
    `INSERT INTO reviews (appointment_id, doctor_id, patient_id, rating, comment, status)
     VALUES ('${APPT}', '${appt.doctor_id}', '00000000-0000-0000-0000-000000000000', 5, 'bad patient', 'pending')`,
  );
} catch (e) {
  err1 = String(e.message).split("\\n")[0].slice(0, 200);
}
console.log("neg-bad-patient (should fail):", err1 ?? "NOT BLOCKED");

// 2) Negative: doctor mismatch
let err2 = null;
try {
  await sql(
    `INSERT INTO reviews (appointment_id, doctor_id, patient_id, rating, comment, status)
     VALUES ('${APPT}', '00000000-0000-0000-0000-000000000000', '${appt.patient_id}', 5, 'bad doctor', 'pending')`,
  );
} catch (e) {
  err2 = String(e.message).split("\\n")[0].slice(0, 200);
}
console.log("neg-bad-doctor (should fail):", err2 ?? "NOT BLOCKED");

// 3) Positive insert
const [ins] = await sql(
  `INSERT INTO reviews (appointment_id, doctor_id, patient_id, rating, comment, status)
   VALUES ('${APPT}', '${appt.doctor_id}', '${appt.patient_id}', 5, 'test review p2', 'approved')
   RETURNING id`,
);
console.log("inserted review:", ins);

// 4) Duplicate insert (UNIQUE)
let err4 = null;
try {
  await sql(
    `INSERT INTO reviews (appointment_id, doctor_id, patient_id, rating, status)
     VALUES ('${APPT}', '${appt.doctor_id}', '${appt.patient_id}', 4, 'pending')`,
  );
} catch (e) {
  err4 = String(e.message).split("\\n")[0].slice(0, 200);
}
console.log("neg-duplicate (should fail):", err4 ?? "NOT BLOCKED");

// 5) Aggregation refresh
const [post] = await sql(
  `SELECT id, rating, reviews_count FROM doctor_details WHERE id='${appt.doctor_id}'`,
);
console.log("post doctor:", post);

// 6) Rating out of range
let err6 = null;
try {
  await sql(
    `INSERT INTO reviews (appointment_id, doctor_id, patient_id, rating, status)
     VALUES (NULL, '${appt.doctor_id}', '${appt.patient_id}', 6, 'pending')`,
  );
} catch (e) {
  err6 = String(e.message).split("\\n")[0].slice(0, 200);
}
console.log("neg-rating-6 (should fail):", err6 ?? "NOT BLOCKED");

// Cleanup
await sql(`DELETE FROM reviews WHERE appointment_id='${APPT}'`);
const [after] = await sql(
  `SELECT id, rating, reviews_count FROM doctor_details WHERE id='${appt.doctor_id}'`,
);
console.log("after cleanup doctor:", after);

const allOk =
  err1 && err2 && err4 && err6 && ins?.id && post.reviews_count > (pre.reviews_count ?? 0);
console.log(allOk ? "\\nALL ASSERTIONS PASSED ✓" : "\\nFAILED ✗");
process.exit(allOk ? 0 : 1);
