// Apply notifications-triggers migration via Supabase Management API.
import { readFileSync } from "node:fs";

const TOKEN = process.env.SUPABASE_MANAGEMENT_TOKEN;
if (!TOKEN) {
  console.error("Set SUPABASE_MANAGEMENT_TOKEN env var.");
  process.exit(1);
}
const PROJECT = "wqrrwvaxovrjjiilqkmt";
const sql = readFileSync(
  "supabase/migrations/20260606140000_notifications_triggers.sql",
  "utf8",
);

const r = await fetch(
  `https://api.supabase.com/v1/projects/${PROJECT}/database/query`,
  {
    method: "POST",
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query: sql }),
  },
);
console.log("status", r.status);
console.log(await r.text());
