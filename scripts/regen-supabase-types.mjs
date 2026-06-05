// Regenerate src/integrations/supabase/types.ts from current schema.
import { writeFile } from "node:fs/promises";

const TOKEN = process.env.SUPABASE_MANAGEMENT_TOKEN;
if (!TOKEN) { console.error("Set SUPABASE_MANAGEMENT_TOKEN env var."); process.exit(1); }
const PROJECT = "wqrrwvaxovrjjiilqkmt";

const url = `https://api.supabase.com/v1/projects/${PROJECT}/types/typescript?included_schemas=public`;
const r = await fetch(url, {
  headers: { Authorization: `Bearer ${TOKEN}` },
});
if (!r.ok) {
  console.error("HTTP", r.status, await r.text());
  process.exit(1);
}
const ct = r.headers.get("content-type") || "";
let types;
if (ct.includes("application/json")) {
  const body = await r.json();
  types = body.types;
} else {
  types = await r.text();
}
if (!types || types.length < 1000) {
  console.error("Unexpected payload (first 500 chars):", String(types).slice(0, 500));
  process.exit(1);
}
await writeFile("src/integrations/supabase/types.ts", types, "utf8");
console.log(`Wrote types.ts (${types.length} bytes).`);
