// Verify the refund trigger was created.
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

const [s1, t1] = await q(
  "SELECT trigger_name FROM information_schema.triggers WHERE event_object_schema='public' AND event_object_table='appointments' ORDER BY trigger_name;",
);
console.log("Triggers:", s1, t1);

const [s2, t2] = await q(
  "SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='appointments' AND column_name='refunded_amount';",
);
console.log("Column:", s2, t2);

const [s3, t3] = await q(
  "SELECT proname FROM pg_proc p JOIN pg_namespace n ON p.pronamespace=n.oid WHERE n.nspname='public' AND p.proname='create_transaction_on_appointment_refund';",
);
console.log("Function:", s3, t3);
