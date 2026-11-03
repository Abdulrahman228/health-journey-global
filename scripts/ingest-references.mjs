#!/usr/bin/env node
/**
 * Tebana — medical reference library ingestion
 * ------------------------------------------------------------------------
 * Fills public.medical_sources / public.medical_chunks (pgvector) that the
 * analyze-symptoms edge function retrieves from and cites.
 *
 *   npm run ingest:references -- medlineplus [--date YYYY-MM-DD] [--lang English|Spanish]
 *   npm run ingest:references -- pdf  --file "C:\refs\book.pdf" --title "…" --publisher "…" --license owned-license [--specialties cardiology,internal] [--language en] [--slug my-book]
 *   npm run ingest:references -- text --file notes.txt --title "…" --publisher "…" --license moh-protocol
 *   npm run ingest:references -- jobs            # process uploads queued from /admin/ai-references
 *
 * Environment (process env, then .dev.vars, then .env):
 *   SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OPENAI_API_KEY, [OPENAI_EMBED_MODEL]
 *
 * ONLY ingest material you are licensed to use commercially (public domain,
 * CC-BY, a licence you bought, your own protocols). The script records the
 * licence on every source; the assistant shows it next to each citation.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve, basename } from "node:path";
import { createClient } from "@supabase/supabase-js";

// ---------------------------------------------------------------- env ----
function loadEnvFile(path) {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line.replace(/^\uFEFF/, ""));
    if (!m) continue;
    const key = m[1];
    let val = m[2];
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'")))
      val = val.slice(1, -1);
    if (!process.env[key]) process.env[key] = val;
  }
}
loadEnvFile(resolve(".dev.vars"));
loadEnvFile(resolve(".env"));

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const OPENAI_KEY = process.env.OPENAI_API_KEY;
const EMBED_MODEL = process.env.OPENAI_EMBED_MODEL || "text-embedding-3-small";
const EMBED_DIMS = 1536;

// --------------------------------------------------------------- args ----
const [, , command, ...rest] = process.argv;
const KNOWN = ["medlineplus", "pdf", "text", "jobs"];
if (KNOWN.includes(command) && (!SUPABASE_URL || !SERVICE_KEY || !OPENAI_KEY)) {
  console.error(
    "Missing env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OPENAI_API_KEY (put them in .dev.vars — git-ignored).",
  );
  process.exit(1);
}
const db = KNOWN.includes(command)
  ? createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
  : null;
const flags = {};
for (let i = 0; i < rest.length; i++) {
  const a = rest[i];
  if (a.startsWith("--")) {
    const key = a.slice(2);
    const next = rest[i + 1];
    if (next !== undefined && !next.startsWith("--")) {
      flags[key] = next;
      i++;
    } else flags[key] = "true";
  }
}

// ------------------------------------------------------------ helpers ----
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function slugify(s) {
  return (
    String(s)
      .toLowerCase()
      .replace(/[^a-z0-9\u0600-\u06FF]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 80) || "source"
  );
}

function stripHtml(html) {
  return String(html)
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h\d|tr|ul|ol)>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Split long text into ~maxChars chunks at paragraph/sentence boundaries with overlap. */
function chunkText(text, { maxChars = 1800, overlap = 200, minChars = 120 } = {}) {
  const clean = String(text).replace(/\r/g, "").trim();
  if (clean.length <= maxChars) return clean.length >= minChars ? [clean] : [];
  const out = [];
  let start = 0;
  while (start < clean.length) {
    let end = Math.min(start + maxChars, clean.length);
    if (end < clean.length) {
      const window = clean.slice(start, end);
      const cut = Math.max(
        window.lastIndexOf("\n\n"),
        window.lastIndexOf(". "),
        window.lastIndexOf("। "),
        window.lastIndexOf("؟ "),
        window.lastIndexOf(".\n"),
      );
      if (cut > maxChars * 0.5) end = start + cut + 1;
    }
    const piece = clean.slice(start, end).trim();
    if (piece.length >= minChars) out.push(piece);
    if (end >= clean.length) break;
    start = Math.max(end - overlap, start + 1);
  }
  return out;
}

async function embedBatch(texts) {
  for (let attempt = 1; attempt <= 6; attempt++) {
    const res = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: { Authorization: `Bearer ${OPENAI_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ model: EMBED_MODEL, input: texts }),
    });
    if (res.ok) {
      const json = await res.json();
      return json.data.sort((a, b) => a.index - b.index).map((d) => d.embedding);
    }
    const body = await res.text();
    if (res.status === 429 || res.status >= 500) {
      const wait = 1500 * attempt * attempt;
      console.warn(`  embeddings ${res.status}, retrying in ${wait}ms`);
      await sleep(wait);
      continue;
    }
    throw new Error(`embeddings ${res.status}: ${body.slice(0, 300)}`);
  }
  throw new Error("embeddings: too many retries");
}

async function upsertSource(src) {
  const { data, error } = await db
    .from("medical_sources")
    .upsert(
      {
        slug: src.slug,
        title: src.title,
        publisher: src.publisher ?? null,
        url: src.url ?? null,
        license: src.license,
        license_note: src.license_note ?? null,
        kind: src.kind ?? "reference",
        language: src.language ?? "en",
        specialties: src.specialties ?? [],
        storage_path: src.storage_path ?? null,
        is_active: true,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "slug" },
    )
    .select("id")
    .single();
  if (error) throw new Error(`medical_sources upsert: ${error.message}`);
  return data.id;
}

/**
 * items: [{ external_id, title, section, content, specialties? }]
 * Each item is chunked, embedded and upserted; existing chunks of the source
 * are deleted first when `replace` is true.
 */
async function ingestItems(sourceId, items, { language = "en", replace = true, onProgress } = {}) {
  if (replace) {
    const { error } = await db.from("medical_chunks").delete().eq("source_id", sourceId);
    if (error) throw new Error(`delete old chunks: ${error.message}`);
  }
  // 1) chunk
  const rows = [];
  for (const it of items) {
    const pieces = chunkText(it.content);
    pieces.forEach((content, idx) =>
      rows.push({
        source_id: sourceId,
        external_id: String(it.external_id),
        chunk_index: idx,
        title: it.title ?? null,
        section: it.section ?? null,
        content,
        specialties: it.specialties ?? [],
        language,
      }),
    );
  }
  console.log(`  ${items.length} items → ${rows.length} chunks`);
  // 2) embed + insert in batches
  const BATCH = 64;
  let done = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const slice = rows.slice(i, i + BATCH);
    const vectors = await embedBatch(
      slice.map(
        (r) => `${r.title ? r.title + "\n" : ""}${r.section ? r.section + "\n" : ""}${r.content}`,
      ),
    );
    const payload = slice.map((r, j) => ({ ...r, embedding: vectors[j] }));
    const { error } = await db
      .from("medical_chunks")
      .upsert(payload, { onConflict: "source_id,external_id,chunk_index" });
    if (error) throw new Error(`medical_chunks upsert: ${error.message}`);
    done += slice.length;
    onProgress?.(done, rows.length);
    if (done % (BATCH * 5) === 0 || done === rows.length)
      console.log(`  embedded ${done}/${rows.length}`);
  }
  return rows.length;
}

// ------------------------------------------------------- MedlinePlus -----
function fmtDate(d) {
  return d.toISOString().slice(0, 10);
}

async function fetchMedlinePlusXml(dateFlag) {
  const tried = [];
  const start = dateFlag ? new Date(dateFlag + "T00:00:00Z") : new Date();
  for (let back = 0; back < 10; back++) {
    const d = new Date(start.getTime() - back * 86400000);
    const url = `https://medlineplus.gov/xml/mplus_topics_${fmtDate(d)}.xml`;
    tried.push(url);
    const res = await fetch(url);
    if (res.ok) {
      console.log(`  downloaded ${url}`);
      return { xml: await res.text(), url, date: fmtDate(d) };
    }
    if (dateFlag) break;
  }
  throw new Error(`MedlinePlus XML not found. Tried:\n  ${tried.join("\n  ")}`);
}

function parseMedlinePlus(xml, language) {
  const topics = [];
  const re = /<health-topic\b([^>]*)>([\s\S]*?)<\/health-topic>/g;
  let m;
  while ((m = re.exec(xml))) {
    const attrs = m[1];
    const body = m[2];
    const attr = (name) => {
      const a = new RegExp(`\\b${name}="([^"]*)"`).exec(attrs);
      return a ? stripHtml(a[1]) : "";
    };
    if (language && attr("language") !== language) continue;
    const id = attr("id");
    const title = attr("title");
    const url = attr("url");
    const sum = /<full-summary>([\s\S]*?)<\/full-summary>/.exec(body);
    const summary = sum ? stripHtml(sum[1]) : "";
    if (!id || !title || summary.length < 200) continue;
    const groups = [...body.matchAll(/<group\b[^>]*>([\s\S]*?)<\/group>/g)]
      .map((g) => stripHtml(g[1]).toLowerCase())
      .filter(Boolean);
    const also = [...body.matchAll(/<also-called>([\s\S]*?)<\/also-called>/g)]
      .map((g) => stripHtml(g[1]))
      .filter(Boolean);
    topics.push({
      external_id: id,
      title,
      section: also.length ? `Also called: ${also.slice(0, 6).join(", ")}` : null,
      content: summary,
      specialties: [...new Set(groups)].slice(0, 8),
      url,
    });
  }
  return topics;
}

async function cmdMedlinePlus() {
  const language = flags.lang || "English";
  const { xml, url, date } = await fetchMedlinePlusXml(flags.date);
  const topics = parseMedlinePlus(xml, language);
  console.log(`  parsed ${topics.length} ${language} topics`);
  const langCode = language === "Spanish" ? "es" : "en";
  const sourceId = await upsertSource({
    slug: `medlineplus-health-topics-${langCode}`,
    title: `MedlinePlus Health Topics (${language})`,
    publisher: "U.S. National Library of Medicine (NIH)",
    url: "https://medlineplus.gov/healthtopics.html",
    license: "public-domain",
    license_note: `Health topic summaries are in the public domain. Attribution required: "Information from MedlinePlus.gov". Snapshot ${date} (${url}).`,
    kind: "health_topic",
    language: langCode,
    specialties: [],
  });
  const n = await ingestItems(sourceId, topics, { language: langCode, replace: true });
  console.log(`DONE medlineplus: ${n} chunks in source ${sourceId}`);
}

// ------------------------------------------------------------ PDF/text ----
async function pdfToItems(buffer, { title }) {
  const { getDocumentProxy, extractText } = await import("unpdf");
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  const { totalPages, text } = await extractText(pdf, { mergePages: false });
  const pages = Array.isArray(text) ? text : [String(text)];
  const items = [];
  for (let i = 0; i < pages.length; i++) {
    const t = String(pages[i] ?? "")
      .replace(/[ \t]+/g, " ")
      .replace(/\s*\n\s*/g, "\n")
      .trim();
    if (t.length < 120) continue; // blank / figure-only pages
    items.push({ external_id: `p${i + 1}`, title, section: `Page ${i + 1}`, content: t });
  }
  console.log(`  pdf: ${totalPages} pages, ${items.length} with text`);
  return items;
}

function requireFlags(names) {
  const missing = names.filter((n) => !flags[n]);
  if (missing.length) {
    console.error(`Missing flags: ${missing.map((m) => "--" + m).join(", ")}`);
    process.exit(1);
  }
}

async function cmdFile(kind) {
  requireFlags(["file", "title", "license"]);
  const file = resolve(flags.file);
  if (!existsSync(file)) {
    console.error(`File not found: ${file}`);
    process.exit(1);
  }
  const title = flags.title;
  const specialties = flags.specialties
    ? flags.specialties
        .split(",")
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean)
    : [];
  const language = flags.language || "en";
  const slug = flags.slug || slugify(title);
  const buffer = readFileSync(file);
  const items =
    kind === "pdf"
      ? await pdfToItems(buffer, { title })
      : [{ external_id: basename(file), title, section: null, content: buffer.toString("utf8") }];
  const sourceId = await upsertSource({
    slug,
    title,
    publisher: flags.publisher ?? null,
    url: flags.url ?? null,
    license: flags.license,
    license_note: flags["license-note"] ?? null,
    kind: flags.kind ?? (kind === "pdf" ? "textbook" : "reference"),
    language,
    specialties,
  });
  const n = await ingestItems(sourceId, items, { language, replace: true });
  console.log(`DONE ${kind}: ${n} chunks in source ${sourceId} (${slug})`);
}

// ---------------------------------------------------------------- jobs ----
async function cmdJobs() {
  const { data: jobs, error } = await db
    .from("medical_ingest_jobs")
    .select("*")
    .eq("status", "queued")
    .order("created_at");
  if (error) throw new Error(error.message);
  if (!jobs?.length) {
    console.log("No queued jobs.");
    return;
  }
  for (const job of jobs) {
    console.log(`\n>>> job ${job.id} (${job.kind}) ${job.params?.title ?? ""}`);
    await db
      .from("medical_ingest_jobs")
      .update({ status: "running", updated_at: new Date().toISOString() })
      .eq("id", job.id);
    try {
      const p = job.params ?? {};
      let items;
      let sourceId;
      if (job.kind === "medlineplus") {
        flags.lang = p.language === "es" ? "Spanish" : "English";
        await cmdMedlinePlus();
        await db
          .from("medical_ingest_jobs")
          .update({ status: "done", processed: 1, total: 1, updated_at: new Date().toISOString() })
          .eq("id", job.id);
        continue;
      }
      if (!p.storage_path) throw new Error("job has no storage_path");
      const { data: blob, error: dlErr } = await db.storage
        .from("medical-references")
        .download(p.storage_path);
      if (dlErr) throw new Error(`download: ${dlErr.message}`);
      const buffer = Buffer.from(await blob.arrayBuffer());
      items =
        job.kind === "pdf"
          ? await pdfToItems(buffer, { title: p.title })
          : [
              {
                external_id: basename(p.storage_path),
                title: p.title,
                section: null,
                content: buffer.toString("utf8"),
              },
            ];
      sourceId = await upsertSource({
        slug: p.slug || slugify(p.title),
        title: p.title,
        publisher: p.publisher ?? null,
        url: p.url ?? null,
        license: p.license || "owned-license",
        license_note: p.license_note ?? null,
        kind: p.kind ?? (job.kind === "pdf" ? "textbook" : "reference"),
        language: p.language || "en",
        specialties: Array.isArray(p.specialties) ? p.specialties : [],
        storage_path: p.storage_path,
      });
      await db
        .from("medical_ingest_jobs")
        .update({ source_id: sourceId, total: items.length })
        .eq("id", job.id);
      const chunks = await ingestItems(sourceId, items, {
        language: p.language || "en",
        replace: true,
        onProgress: async (done, total) => {
          if (done % 320 === 0 || done === total) {
            await db
              .from("medical_ingest_jobs")
              .update({ chunks: done, updated_at: new Date().toISOString() })
              .eq("id", job.id);
          }
        },
      });
      await db
        .from("medical_ingest_jobs")
        .update({
          status: "done",
          processed: items.length,
          chunks,
          updated_at: new Date().toISOString(),
        })
        .eq("id", job.id);
      console.log(`<<< job ${job.id} done (${chunks} chunks)`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`<<< job ${job.id} FAILED: ${msg}`);
      await db
        .from("medical_ingest_jobs")
        .update({
          status: "failed",
          error: msg.slice(0, 1000),
          updated_at: new Date().toISOString(),
        })
        .eq("id", job.id);
    }
  }
}

// ---------------------------------------------------------------- main ----
try {
  switch (command) {
    case "medlineplus":
      await cmdMedlinePlus();
      break;
    case "pdf":
      await cmdFile("pdf");
      break;
    case "text":
      await cmdFile("text");
      break;
    case "jobs":
      await cmdJobs();
      break;
    default:
      console.log(`Usage:
  node scripts/ingest-references.mjs medlineplus [--date YYYY-MM-DD] [--lang English|Spanish]
  node scripts/ingest-references.mjs pdf  --file <path.pdf> --title "…" --license owned-license [--publisher "…"] [--specialties a,b] [--language en] [--slug x]
  node scripts/ingest-references.mjs text --file <path.txt> --title "…" --license moh-protocol [...]
  node scripts/ingest-references.mjs jobs`);
      process.exit(command ? 1 : 0);
  }
} catch (e) {
  console.error("FAILED:", e instanceof Error ? e.message : e);
  process.exit(1);
}
