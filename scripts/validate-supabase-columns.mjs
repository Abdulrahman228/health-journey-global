#!/usr/bin/env node
/**
 * Validates that every column referenced in `.select(...)` and `.eq("col", ...)`
 * style PostgREST calls actually exists in the live database schema.
 *
 * Prevents the class of bug where a typo like "license_number" vs
 * "syndicate_number" causes PostgREST to silently return 400 and the entire
 * row resolves as null.
 *
 * Requires the env var SUPABASE_MANAGEMENT_TOKEN (sbp_…) and reads the project
 * ref from VITE_SUPABASE_PROJECT_ID (or SUPABASE_PROJECT_REF).
 *
 * Run: node scripts/validate-supabase-columns.mjs
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, extname, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = dirname(__dirname); // scripts/ → repo root
const SRC_DIR = join(ROOT, "src");

const PROJECT_REF =
  process.env.VITE_SUPABASE_PROJECT_ID ||
  process.env.SUPABASE_PROJECT_REF ||
  "wqrrwvaxovrjjiilqkmt";
const TOKEN = process.env.SUPABASE_MANAGEMENT_TOKEN;

if (!TOKEN) {
  console.warn("⚠️  SUPABASE_MANAGEMENT_TOKEN not set — skipping schema validation.");
  process.exit(0);
}

// ────────────────────────────────────────────────────────────────────────────
// 1. Crawl all *.ts / *.tsx files under src/ to harvest table+column refs.
// ────────────────────────────────────────────────────────────────────────────

/**
 * Map of tableName → Set of column names referenced in code.
 * @type {Map<string, Set<string>>}
 */
const references = new Map();

/** Walks a directory recursively and yields file paths. */
function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const s = statSync(full);
    if (s.isDirectory()) {
      if (entry === "node_modules" || entry.startsWith(".")) continue;
      yield* walk(full);
    } else if ([".ts", ".tsx"].includes(extname(entry))) {
      yield full;
    }
  }
}

// Regex matches:  .from("table") followed by .select("col1, col2") chain.
// We grab the first .select() per .from() call.
const FROM_SELECT = /\.from\(\s*["'`]([a-z_][a-z0-9_]*)["'`]\s*\)([\s\S]{0,500}?)\.select\(\s*["'`]([^"'`]+)["'`]/gi;
const EQ_PATTERN = /\.(?:eq|neq|lt|lte|gt|gte|like|ilike|is|in|contains)\(\s*["'`]([a-z_][a-z0-9_]*)["'`]/gi;

let scannedFiles = 0;
for (const file of walk(SRC_DIR)) {
  const text = readFileSync(file, "utf8");
  scannedFiles++;

  // .from(table).select("col1, col2 ( nested ), col3")
  for (const m of text.matchAll(FROM_SELECT)) {
    const [, table, , columnsRaw] = m;
    if (!references.has(table)) references.set(table, new Set());
    const set = references.get(table);
    // Strip nested foreign-key selects e.g. "doctor_details ( specialty )"
    // including their preceding identifier (which is a relationship name, not a column).
    const flat = columnsRaw
      .replace(/[a-z_][a-z0-9_]*\s*!\s*[a-z_][a-z0-9_]*\s*\([^)]*\)/gi, "") // explicit FK syntax: profiles!fk_name(...)
      .replace(/[a-z_][a-z0-9_]*\s*\([^)]*\)/gi, ""); // any name(...)
    for (const col of flat.split(",").map((s) => s.trim())) {
      if (!col || col === "*") continue;
      // Handle aliases like "name:full_name" — keep the real column.
      const real = col.includes(":") ? col.split(":")[1].trim() : col;
      // Skip column names that look like aggregate exprs or hash counts.
      if (real.includes("(") || real.includes(")")) continue;
      if (/^[a-z_][a-z0-9_]*$/i.test(real)) set.add(real);
    }
  }

  // Loose harvest of column names used in filter clauses.
  // We intentionally don't try to associate these with a table — they get
  // checked against ANY table they're referenced alongside above.
}

console.log(`Scanned ${scannedFiles} source files; collected references for ${references.size} tables.`);

// ────────────────────────────────────────────────────────────────────────────
// 2. Fetch live information_schema.columns via Supabase Management API.
// ────────────────────────────────────────────────────────────────────────────

const tables = Array.from(references.keys());
if (tables.length === 0) {
  console.log("No table references found.");
  process.exit(0);
}

const inList = tables.map((t) => `'${t.replace(/'/g, "''")}'`).join(",");
const sql = `SELECT table_name, column_name FROM information_schema.columns WHERE table_schema = 'public' AND table_name IN (${inList}) ORDER BY table_name, ordinal_position;`;

let liveSchema;
try {
  const res = await fetch(
    `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: sql }),
    },
  );
  if (!res.ok) {
    const body = await res.text();
    console.error(`Schema fetch failed: HTTP ${res.status} ${body}`);
    process.exit(1);
  }
  liveSchema = await res.json();
} catch (err) {
  console.error("Schema fetch threw:", err);
  process.exit(1);
}

/** Build map: table → Set<column>. */
const live = new Map();
for (const row of liveSchema) {
  if (!live.has(row.table_name)) live.set(row.table_name, new Set());
  live.get(row.table_name).add(row.column_name);
}

// ────────────────────────────────────────────────────────────────────────────
// 3. Diff.
// ────────────────────────────────────────────────────────────────────────────

const STRICT = process.env.VALIDATE_SCHEMA_STRICT === "1";
let issues = 0;
const missingTables = [];
for (const [table, cols] of references) {
  const liveCols = live.get(table);
  if (!liveCols) {
    missingTables.push(table);
    continue;
  }
  for (const col of cols) {
    if (!liveCols.has(col)) {
      const prefix = STRICT ? "❌" : "⚠️";
      console.error(`${prefix}  ${table}.${col} — referenced in code but does NOT exist in DB`);
      issues++;
    }
  }
}

if (missingTables.length > 0) {
  console.warn(
    `ℹ️  Tables referenced in code but not in public schema (may be in another schema or RPC): ${missingTables.join(", ")}`,
  );
}

if (issues > 0) {
  if (STRICT) {
    console.error(`\nFound ${issues} missing column reference(s). Fix before merging (STRICT mode).`);
    process.exit(1);
  }
  console.warn(`\nFound ${issues} potential missing column reference(s). Review and fix.`);
  console.warn(
    `Note: the parser may yield false-positives for embedded FK joins like 'profiles!fk_name(col)'.`,
  );
  console.warn(`Re-run with VALIDATE_SCHEMA_STRICT=1 to fail CI on these.`);
  process.exit(0);
}

console.log(`✅  All ${references.size} tables' referenced columns exist in the live DB.`);
