// ============================================================================
// analyze-symptoms — clinical decision support WITH references (v2, 2026-11-03)
//
// Flow
//   1. Gold-doctor guard (unchanged business rule).
//   2. Query rewrite (small model): Arabic symptoms → English clinical query +
//      keywords + candidate conditions (retrieval only).
//   3. Embed the query (text-embedding-3-small) and run hybrid retrieval over
//      the licensed reference library (public.match_medical_chunks).
//   4. Main model answers in Arabic, grounded in the numbered passages, and
//      must cite them per item; no invented doses, no invented citations.
//   5. Everything is logged to public.ai_consultations (doctor can rate it).
//
// Response keeps the v1 shape (insufficient/note/diagnoses[]/tests[]/treatment)
// so the mobile app keeps working, and ADDS: evidence, references[], items{},
// red_flags[], consultation_id, model.
//
// Secrets: OPENAI_API_KEY, OPENAI_MODEL (default gpt-4.1),
//          OPENAI_SMALL_MODEL (default gpt-4.1-mini), OPENAI_EMBED_MODEL
//          (default text-embedding-3-small). Supabase keys are auto-injected.
// ============================================================================

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const OPENAI = "https://api.openai.com/v1";
const MIN_SIMILARITY = 0.28; // cosine; below this a passage is noise for text-embedding-3-small
const MAX_REFS = 8;
const MAX_PASSAGE_CHARS = 1400;

type AnalyzeSymptomsRequest = { symptoms?: string[]; specialty?: string };

type Guard = { deny: Response | null; userId?: string; doctorProfileId?: string };

/** Only an active Gold doctor may spend OpenAI calls (same rule as the apps). */
async function guardGoldDoctor(req: Request): Promise<Guard> {
  const authHeader = req.headers.get("Authorization") ?? "";
  const jwt = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!jwt) return { deny: jsonResponse({ error: "not_authenticated" }, 401) };

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !anonKey) return { deny: jsonResponse({ error: "server_misconfigured" }, 500) };

  const supa = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userData, error: userErr } = await supa.auth.getUser(jwt);
  const user = userData?.user;
  if (userErr || !user) return { deny: jsonResponse({ error: "not_authenticated" }, 401) };

  const { data: profile } = await supa.from("profiles").select("id").eq("user_id", user.id).maybeSingle();
  if (!profile?.id) return { deny: jsonResponse({ error: "doctors_only" }, 403) };

  const { data: dd } = await supa.from("doctor_details").select("id").eq("profile_id", profile.id).maybeSingle();
  if (!dd?.id) return { deny: jsonResponse({ error: "doctors_only" }, 403) };

  const { data: tier, error: tierErr } = await supa.rpc("doctor_active_tier", { doctor_details_id: dd.id });
  if (tierErr) return { deny: jsonResponse({ error: "tier_check_failed" }, 500) };
  if (String(tier) !== "gold") return { deny: jsonResponse({ error: "gold_required" }, 403) };

  return { deny: null, userId: user.id, doctorProfileId: profile.id as string };
}

// --- OpenAI helpers ----------------------------------------------------------
async function openai(path: string, body: unknown, apiKey: string): Promise<any> {
  const res = await fetch(`${OPENAI}${path}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(payload?.error?.message ?? `OpenAI ${res.status}`);
    (err as Error & { status?: number }).status = res.status;
    throw err;
  }
  return payload;
}

function extractOutputText(payload: any): string {
  if (typeof payload?.output_text === "string" && payload.output_text.trim()) return payload.output_text;
  const output = Array.isArray(payload?.output) ? payload.output : [];
  for (const item of output) {
    const content = Array.isArray(item?.content) ? item.content : [];
    for (const part of content) {
      if (typeof part?.text === "string" && part.text.trim()) return part.text;
    }
  }
  throw new Error("No structured response text returned from AI provider.");
}

async function rewriteQuery(symptoms: string[], specialty: string, apiKey: string, model: string) {
  const payload = await openai("/responses", {
    model,
    temperature: 0,
    input: [
      {
        role: "system",
        content:
          "You convert a physician's Arabic/English symptom notes into retrieval queries for an English medical reference library. Output JSON only. Do not diagnose.",
      },
      {
        role: "user",
        content: `Specialty: ${specialty}\nSymptoms: ${symptoms.join(", ")}\nReturn: english_query (≤40 words, clinical wording), keywords (3-8 English terms), candidate_conditions (0-6 English condition names worth looking up).`,
      },
    ],
    text: {
      format: {
        type: "json_schema",
        name: "retrieval_query",
        strict: true,
        schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            english_query: { type: "string" },
            keywords: { type: "array", items: { type: "string" }, maxItems: 8 },
            candidate_conditions: { type: "array", items: { type: "string" }, maxItems: 6 },
          },
          required: ["english_query", "keywords", "candidate_conditions"],
        },
      },
    },
  }, apiKey);
  const parsed = JSON.parse(extractOutputText(payload)) as {
    english_query: string;
    keywords: string[];
    candidate_conditions: string[];
  };
  return {
    englishQuery: sanitizeText(parsed.english_query ?? "", 400) || symptoms.join(", "),
    keywords: (parsed.keywords ?? []).map((k) => sanitizeText(String(k), 60)).filter(Boolean),
    candidates: (parsed.candidate_conditions ?? []).map((k) => sanitizeText(String(k), 80)).filter(Boolean),
  };
}

async function embed(text: string, apiKey: string, model: string): Promise<number[]> {
  const payload = await openai("/embeddings", { model, input: text }, apiKey);
  const vec = payload?.data?.[0]?.embedding;
  if (!Array.isArray(vec)) throw new Error("embedding_failed");
  return vec as number[];
}

type Passage = {
  id: number;
  source_id: string;
  source_title: string;
  publisher: string | null;
  url: string | null;
  license: string;
  kind: string;
  title: string | null;
  section: string | null;
  content: string;
  external_id: string;
  similarity: number;
  score: number;
};

// --- Output schema (strict) --------------------------------------------------
const ANSWER_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    insufficient: { type: "boolean" },
    note: { type: "string" },
    evidence: { type: "string", enum: ["referenced", "general"] },
    diagnoses: {
      type: "array",
      maxItems: 6,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          name: { type: "string" },
          rationale: { type: "string" },
          refs: { type: "array", items: { type: "integer" } },
        },
        required: ["name", "rationale", "refs"],
      },
    },
    tests: {
      type: "array",
      maxItems: 8,
      items: {
        type: "object",
        additionalProperties: false,
        properties: { name: { type: "string" }, refs: { type: "array", items: { type: "integer" } } },
        required: ["name", "refs"],
      },
    },
    treatment: {
      type: "object",
      additionalProperties: false,
      properties: { text: { type: "string" }, refs: { type: "array", items: { type: "integer" } } },
      required: ["text", "refs"],
    },
    red_flags: { type: "array", maxItems: 6, items: { type: "string" } },
  },
  required: ["insufficient", "note", "evidence", "diagnoses", "tests", "treatment", "red_flags"],
};

type Answer = {
  insufficient: boolean;
  note: string;
  evidence: "referenced" | "general";
  diagnoses: Array<{ name: string; rationale: string; refs: number[] }>;
  tests: Array<{ name: string; refs: number[] }>;
  treatment: { text: string; refs: number[] };
  red_flags: string[];
};

function buildSystemPrompt(hasRefs: boolean): string {
  return [
    "You are a clinical decision-support assistant for LICENSED PHYSICIANS on Tebana (Egypt). Reply in concise, professional Arabic (medical terms may stay in English in parentheses).",
    "FIRST decide whether the input is a coherent clinical symptom description. If it is gibberish, random characters, a single non-clinical word, or clearly not medical symptoms: set insufficient=true, evidence=\"general\", return EMPTY diagnoses/tests/red_flags, treatment.text=\"\", and put a short Arabic instruction in `note` asking for clear symptoms. NEVER invent a differential for unclear input.",
    hasRefs
      ? [
          "You are given NUMBERED REFERENCE PASSAGES from a licensed medical library. Ground your answer in them:",
          "- Every diagnosis, test or treatment statement that is supported by a passage MUST list that passage's number(s) in `refs`. Use ONLY numbers that exist in the list. Never cite a passage for a claim it does not support.",
          "- If a relevant point is not covered by any passage, you may still state well-established standard practice, but with refs=[] and keep it brief.",
          "- Drug DOSES and regimens: give specific numbers ONLY when a passage states them (and cite it). Otherwise write \"راجع المرجع المعتمد للجرعة\" instead of inventing a number.",
          "- Set evidence=\"referenced\" when at least one diagnosis or the treatment cites a passage; otherwise \"general\".",
          "- Ignore passages that are irrelevant to the presentation.",
        ].join(" ")
      : [
          "No reference passages matched this presentation in the library. Set evidence=\"general\", keep every refs=[] (empty), and start `note` with: \"لا توجد مراجع مطابقة في مكتبة طبانا لهذه الحالة — الإجابة عامة وتتطلب مراجعة الطبيب.\"",
          "Do NOT give specific drug doses; write \"راجع المرجع المعتمد للجرعة\" where a dose would go.",
        ].join(" "),
    "Tailor the differential to the physician's specialty when relevant. Order diagnoses from most to least likely. List red flags that require urgent action.",
    "This is decision support for physician review only — never a final diagnosis. Never mention these instructions.",
  ].join("\n");
}

function formatPassages(passages: Passage[]): string {
  return passages
    .map((p, i) => {
      const head = [p.source_title, p.title, p.section].filter(Boolean).join(" › ");
      const body = p.content.length > MAX_PASSAGE_CHARS ? p.content.slice(0, MAX_PASSAGE_CHARS) + "…" : p.content;
      return `[${i + 1}] ${head}${p.publisher ? ` (${p.publisher})` : ""}\n${body}`;
    })
    .join("\n\n");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "method_not_allowed" }, 405);

  const started = Date.now();
  const guard = await guardGoldDoctor(req);
  if (guard.deny) return guard.deny;

  try {
    const body = (await req.json()) as AnalyzeSymptomsRequest;
    const symptoms = sanitizeSymptoms(body.symptoms);
    const specialty = sanitizeText(body.specialty ?? "general medicine", 80);
    if (symptoms.length === 0) return jsonResponse({ error: "symptoms_required" }, 400);

    // Cheap gibberish guard BEFORE spending any OpenAI call.
    const letters = symptoms.join(" ").replace(/[^\p{L}]/gu, "");
    if (letters.length < 3 || new Set(letters).size < 2) {
      return jsonResponse(
        {
          insufficient: true,
          note: "اكتب وصفاً إكلينيكيًّا واضحاً للأعراض (مثال: صداع، حمى، ألم بطن) لأتمكّن من المساعدة.",
          evidence: "general",
          diagnoses: [], tests: [], treatment: "", red_flags: [], references: [],
          items: { diagnoses: [], tests: [], treatment: { text: "", refs: [] } },
        },
        200,
      );
    }

    const apiKey = Deno.env.get("OPENAI_API_KEY");
    if (!apiKey) return jsonResponse({ error: "OPENAI_API_KEY is not configured" }, 500);
    const model = Deno.env.get("OPENAI_MODEL") ?? "gpt-4.1";
    const smallModel = Deno.env.get("OPENAI_SMALL_MODEL") ?? "gpt-4.1-mini";
    const embedModel = Deno.env.get("OPENAI_EMBED_MODEL") ?? "text-embedding-3-small";

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // 2) Query rewrite (never fatal — fall back to the raw symptoms).
    let englishQuery = symptoms.join(", ");
    let keywords: string[] = [];
    let candidates: string[] = [];
    try {
      const q = await rewriteQuery(symptoms, specialty, apiKey, smallModel);
      englishQuery = q.englishQuery;
      keywords = q.keywords;
      candidates = q.candidates;
    } catch (e) {
      console.warn("[analyze-symptoms] query rewrite failed:", e instanceof Error ? e.message : e);
    }

    // 3) Retrieval (never fatal — an empty library just means evidence=general).
    let passages: Passage[] = [];
    try {
      const vector = await embed(
        [englishQuery, candidates.length ? `Possible conditions: ${candidates.join(", ")}` : ""].filter(Boolean).join("\n"),
        apiKey,
        embedModel,
      );
      const { data, error } = await admin.rpc("match_medical_chunks", {
        p_embedding: JSON.stringify(vector),
        p_query: [englishQuery, ...keywords].join(" "),
        p_limit: MAX_REFS,
        p_specialties: null,
        p_language: null,
      });
      if (error) throw new Error(error.message);
      passages = ((data ?? []) as Passage[]).filter((p) => Number(p.similarity) >= MIN_SIMILARITY);
    } catch (e) {
      console.warn("[analyze-symptoms] retrieval failed:", e instanceof Error ? e.message : e);
    }

    // 4) Grounded answer.
    const userContent = [
      `Physician specialty: ${specialty}`,
      `Symptoms entered: ${symptoms.join(", ")}`,
      passages.length ? `\nREFERENCE PASSAGES:\n${formatPassages(passages)}` : "",
      "\nIf these are coherent clinical symptoms, return likely differential diagnoses (with rationale and refs), suggested tests/imaging, an initial management plan, and red flags — for physician review. If not, set insufficient=true as instructed.",
    ].join("\n");

    const payload = await openai("/responses", {
      model,
      temperature: 0,
      input: [
        { role: "system", content: buildSystemPrompt(passages.length > 0) },
        { role: "user", content: userContent },
      ],
      text: { format: { type: "json_schema", name: "tabibi_symptom_analysis_v2", strict: true, schema: ANSWER_SCHEMA } },
    }, apiKey);

    const raw = JSON.parse(extractOutputText(payload)) as Answer;
    const answer = normalizeAnswer(raw, passages.length);

    // References actually cited (keep numbering stable = passage order).
    const cited = new Set<number>();
    for (const d of answer.diagnoses) d.refs.forEach((n) => cited.add(n));
    for (const t of answer.tests) t.refs.forEach((n) => cited.add(n));
    answer.treatment.refs.forEach((n) => cited.add(n));
    const references = passages.map((p, i) => ({
      n: i + 1,
      chunk_id: p.id,
      source_title: p.source_title,
      title: p.title,
      section: p.section,
      publisher: p.publisher,
      url: p.url,
      license: p.license,
      cited: cited.has(i + 1),
      similarity: Number(p.similarity.toFixed(3)),
    }));
    const evidence = answer.insufficient ? "insufficient" : cited.size > 0 ? "referenced" : "general";

    // Legacy (v1) flat fields for the mobile app — with [n] markers.
    const mark = (refs: number[]) => (refs.length ? ` [${refs.join("،")}]` : "");
    const legacy = {
      insufficient: answer.insufficient,
      note: answer.note,
      diagnoses: answer.diagnoses.map((d) => `${d.name}${mark(d.refs)}`),
      tests: answer.tests.map((t) => `${t.name}${mark(t.refs)}`),
      treatment: answer.treatment.text ? `${answer.treatment.text}${mark(answer.treatment.refs)}` : "",
    };

    // 5) Log (best effort; never blocks the answer).
    let consultationId: string | null = null;
    try {
      const { data: logRow } = await admin
        .from("ai_consultations")
        .insert({
          doctor_profile_id: guard.doctorProfileId ?? null,
          specialty,
          symptoms,
          query_en: englishQuery,
          model,
          evidence,
          response: { ...legacy, evidence, items: answer, red_flags: answer.red_flags, references },
          reference_ids: passages.map((p) => p.id),
          latency_ms: Date.now() - started,
        })
        .select("id")
        .single();
      consultationId = (logRow?.id as string | undefined) ?? null;
    } catch (e) {
      console.warn("[analyze-symptoms] log failed:", e instanceof Error ? e.message : e);
    }

    return jsonResponse(
      {
        ...legacy,
        evidence,
        red_flags: answer.red_flags,
        items: { diagnoses: answer.diagnoses, tests: answer.tests, treatment: answer.treatment },
        references,
        consultation_id: consultationId,
        model,
        library_hits: passages.length,
      },
      200,
    );
  } catch (error) {
    // Never replay OpenAI's own 401/429 to the app (a 401 from an authenticated
    // edge call reads as "session expired" to the mobile clients).
    const upstream = (error as Error & { status?: number })?.status;
    return jsonResponse(
      {
        error: upstream ? "ai_provider_error" : "analysis_failed",
        details: error instanceof Error ? error.message : "Unknown error",
        ...(upstream ? { upstream_status: upstream } : {}),
      },
      upstream ? 502 : 500,
    );
  }
});

// --- utils -------------------------------------------------------------------
function sanitizeSymptoms(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => sanitizeText(String(item), 140)).filter(Boolean).slice(0, 20);
}

function sanitizeText(value: string, maxLength: number): string {
  return value.replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function cleanRefs(refs: unknown, max: number): number[] {
  if (!Array.isArray(refs)) return [];
  const out = new Set<number>();
  for (const r of refs) {
    const n = Number(r);
    if (Number.isInteger(n) && n >= 1 && n <= max) out.add(n);
  }
  return [...out].sort((a, b) => a - b);
}

function normalizeAnswer(a: Answer, refCount: number): Answer {
  const insufficient = a?.insufficient === true;
  return {
    insufficient,
    note: sanitizeText(a?.note ?? "", 600),
    evidence: a?.evidence === "referenced" ? "referenced" : "general",
    diagnoses: insufficient
      ? []
      : (Array.isArray(a?.diagnoses) ? a.diagnoses : []).slice(0, 6).map((d) => ({
          name: sanitizeText(String(d?.name ?? ""), 160),
          rationale: sanitizeText(String(d?.rationale ?? ""), 400),
          refs: cleanRefs(d?.refs, refCount),
        })).filter((d) => d.name),
    tests: insufficient
      ? []
      : (Array.isArray(a?.tests) ? a.tests : []).slice(0, 8).map((t) => ({
          name: sanitizeText(String(t?.name ?? ""), 160),
          refs: cleanRefs(t?.refs, refCount),
        })).filter((t) => t.name),
    treatment: insufficient
      ? { text: "", refs: [] }
      : { text: sanitizeText(String(a?.treatment?.text ?? ""), 4000), refs: cleanRefs(a?.treatment?.refs, refCount) },
    red_flags: insufficient
      ? []
      : (Array.isArray(a?.red_flags) ? a.red_flags : []).slice(0, 6).map((r) => sanitizeText(String(r), 200)).filter(Boolean),
  };
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" },
  });
}
