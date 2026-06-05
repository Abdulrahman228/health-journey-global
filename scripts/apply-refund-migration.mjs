// Apply refund-settlement migration via Supabase Management API.
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SQL_PATH = resolve(__dirname, "../supabase/migrations/20260606000000_refund_settlement.sql");

const TOKEN = process.env.SUPABASE_MANAGEMENT_TOKEN;
if (!TOKEN) { console.error("Set SUPABASE_MANAGEMENT_TOKEN env var."); process.exit(1); }
const PROJECT = process.env.VITE_SUPABASE_PROJECT_ID || "wqrrwvaxovrjjiilqkmt";

const sql = readFileSync(SQL_PATH, "utf8");

const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT}/database/query`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${TOKEN}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ query: sql }),
});

const text = await res.text();
console.log(`Status: ${res.status}`);
console.log(text);
process.exit(res.ok ? 0 : 1);
