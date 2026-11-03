-- ============================================================================
-- AI clinical decision support — reference library + retrieval (2026-11-03)
--
-- The analyze-symptoms edge function stops answering from the model's memory
-- alone: it retrieves passages from a curated, LICENSED reference library
-- (pgvector + full-text hybrid search) and must cite them. This migration adds:
--   §1 medical_sources / medical_chunks   – the library (service-role writes)
--   §2 match_medical_chunks()             – hybrid search (vector ⊕ keyword, RRF)
--   §3 medical_ingest_jobs                – queue for scripts/ingest-references.mjs (admin uploads)
--   §4 ai_consultations                   – every AI answer is logged with its
--                                           citations; doctors rate it (👍/👎)
--   §5 private storage bucket for uploaded PDFs (admins only)
-- Idempotent; one transaction.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA extensions;

-- ----------------------------------------------------------------------------
-- §1 Library
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.medical_sources (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug          text NOT NULL UNIQUE,
  title         text NOT NULL,
  publisher     text,
  url           text,
  license       text NOT NULL,                -- 'public-domain' | 'cc-by' | 'owned-license' | 'moh-protocol' | …
  license_note  text,
  kind          text NOT NULL DEFAULT 'reference'
                  CHECK (kind IN ('health_topic','guideline','drug_label','textbook','protocol','reference')),
  language      text NOT NULL DEFAULT 'en',
  specialties   text[] NOT NULL DEFAULT '{}',
  is_active     boolean NOT NULL DEFAULT true,
  chunk_count   int NOT NULL DEFAULT 0,
  storage_path  text,                         -- uploaded file in bucket medical-references
  created_by    uuid,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.medical_chunks (
  id             bigserial PRIMARY KEY,
  source_id      uuid NOT NULL REFERENCES public.medical_sources(id) ON DELETE CASCADE,
  external_id    text NOT NULL DEFAULT '',   -- topic id / page range inside the source
  chunk_index    int  NOT NULL DEFAULT 0,
  title          text,
  section        text,
  content        text NOT NULL,
  content_chars  int  GENERATED ALWAYS AS (length(content)) STORED,
  specialties    text[] NOT NULL DEFAULT '{}',
  language       text NOT NULL DEFAULT 'en',
  embedding      extensions.vector(1536),
  fts            tsvector GENERATED ALWAYS AS
                   (to_tsvector('english', coalesce(title, '') || ' ' || coalesce(section, '') || ' ' || content)) STORED,
  created_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_id, external_id, chunk_index)
);
CREATE INDEX IF NOT EXISTS idx_medical_chunks_source ON public.medical_chunks (source_id);
CREATE INDEX IF NOT EXISTS idx_medical_chunks_fts    ON public.medical_chunks USING gin (fts);
CREATE INDEX IF NOT EXISTS idx_medical_chunks_embedding
  ON public.medical_chunks USING hnsw (embedding extensions.vector_cosine_ops);

ALTER TABLE public.medical_sources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.medical_chunks  ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS medical_sources_admin_all ON public.medical_sources;
CREATE POLICY medical_sources_admin_all ON public.medical_sources
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
-- Doctors can see WHICH references the assistant uses (transparency), not the text.
DROP POLICY IF EXISTS medical_sources_read_active ON public.medical_sources;
CREATE POLICY medical_sources_read_active ON public.medical_sources
  FOR SELECT TO authenticated USING (is_active);

DROP POLICY IF EXISTS medical_chunks_admin_read ON public.medical_chunks;
CREATE POLICY medical_chunks_admin_read ON public.medical_chunks
  FOR SELECT TO authenticated USING (public.is_admin());
-- chunk writes: service role only (ingest-reference edge function)

-- Keep medical_sources.chunk_count in sync (statement-level: recount all).
CREATE OR REPLACE FUNCTION public._touch_medical_source_count()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.medical_sources s
     SET chunk_count = coalesce((SELECT count(*) FROM public.medical_chunks c WHERE c.source_id = s.id), 0),
         updated_at  = now();
  RETURN NULL;
END; $$;
DROP TRIGGER IF EXISTS trg_medical_chunks_count ON public.medical_chunks;
CREATE TRIGGER trg_medical_chunks_count
  AFTER INSERT OR DELETE ON public.medical_chunks
  FOR EACH STATEMENT EXECUTE FUNCTION public._touch_medical_source_count();

-- ----------------------------------------------------------------------------
-- §2 Hybrid retrieval: vector similarity ⊕ keyword (reciprocal rank fusion)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.match_medical_chunks(
  p_embedding   extensions.vector(1536),
  p_query       text DEFAULT NULL,
  p_limit       int  DEFAULT 8,
  p_specialties text[] DEFAULT NULL,
  p_language    text DEFAULT NULL
)
RETURNS TABLE (
  id            bigint,
  source_id     uuid,
  source_title  text,
  publisher     text,
  url           text,
  license       text,
  kind          text,
  title         text,
  section       text,
  content       text,
  external_id   text,
  similarity    real,
  score         real
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, extensions AS $$
  WITH params AS (
    SELECT greatest(1, least(coalesce(p_limit, 8), 30)) AS lim,
           nullif(trim(coalesce(p_query, '')), '')       AS q
  ),
  vec AS (
    SELECT c.id,
           (1 - (c.embedding <=> p_embedding))::real AS sim,
           row_number() OVER (ORDER BY c.embedding <=> p_embedding) AS rn
      FROM public.medical_chunks c
      JOIN public.medical_sources s ON s.id = c.source_id AND s.is_active
     WHERE c.embedding IS NOT NULL
       AND (p_specialties IS NULL OR cardinality(p_specialties) = 0
            OR c.specialties && p_specialties OR cardinality(c.specialties) = 0)
       AND (p_language IS NULL OR c.language = p_language)
     ORDER BY c.embedding <=> p_embedding
     LIMIT (SELECT lim * 4 FROM params)
  ),
  kw AS (
    SELECT c.id,
           row_number() OVER (ORDER BY ts_rank_cd(c.fts, websearch_to_tsquery('english', (SELECT q FROM params))) DESC) AS rn
      FROM public.medical_chunks c
      JOIN public.medical_sources s ON s.id = c.source_id AND s.is_active
     WHERE (SELECT q FROM params) IS NOT NULL
       AND c.fts @@ websearch_to_tsquery('english', (SELECT q FROM params))
       AND (p_specialties IS NULL OR cardinality(p_specialties) = 0
            OR c.specialties && p_specialties OR cardinality(c.specialties) = 0)
       AND (p_language IS NULL OR c.language = p_language)
     ORDER BY rn
     LIMIT (SELECT lim * 4 FROM params)
  ),
  fused AS (
    SELECT coalesce(v.id, k.id) AS id,
           coalesce(v.sim, 0)::real AS sim,
           (coalesce(1.0 / (60 + v.rn), 0) + coalesce(1.0 / (60 + k.rn), 0))::real AS score
      FROM vec v FULL OUTER JOIN kw k ON k.id = v.id
  )
  SELECT c.id, c.source_id, s.title AS source_title, s.publisher, s.url, s.license, s.kind,
         c.title, c.section, c.content, c.external_id,
         -- real cosine similarity for EVERY fused row (keyword-only hits too),
         -- so callers can threshold on it without dropping the keyword branch
         CASE WHEN c.embedding IS NULL THEN f.sim
              ELSE (1 - (c.embedding <=> p_embedding))::real END AS similarity,
         f.score
    FROM fused f
    JOIN public.medical_chunks  c ON c.id = f.id
    JOIN public.medical_sources s ON s.id = c.source_id
   ORDER BY f.score DESC, f.sim DESC
   LIMIT (SELECT lim FROM params);
$$;
REVOKE EXECUTE ON FUNCTION public.match_medical_chunks(extensions.vector, text, int, text[], text) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.match_medical_chunks(extensions.vector, text, int, text[], text) TO service_role;

-- ----------------------------------------------------------------------------
-- §3 Ingestion queue (admins upload PDFs; scripts/ingest-references.mjs processes)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.medical_ingest_jobs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id   uuid REFERENCES public.medical_sources(id) ON DELETE CASCADE,
  kind        text NOT NULL CHECK (kind IN ('medlineplus','pdf','text')),
  status      text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','staging','running','done','failed')),
  params      jsonb NOT NULL DEFAULT '{}'::jsonb,
  total       int,
  processed   int NOT NULL DEFAULT 0,
  chunks      int NOT NULL DEFAULT 0,
  cursor      int NOT NULL DEFAULT 0,
  error       text,
  created_by  uuid,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.medical_ingest_jobs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ingest_jobs_admin_all ON public.medical_ingest_jobs;
CREATE POLICY ingest_jobs_admin_all ON public.medical_ingest_jobs
  FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());

-- ----------------------------------------------------------------------------
-- §4 Answer log + doctor feedback
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ai_consultations (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_profile_id  uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  specialty          text,
  symptoms           text[] NOT NULL DEFAULT '{}',
  query_en           text,
  model              text,
  evidence           text,                    -- 'referenced' | 'general' | 'insufficient'
  response           jsonb NOT NULL DEFAULT '{}'::jsonb,
  reference_ids      bigint[] NOT NULL DEFAULT '{}',
  latency_ms         int,
  feedback           smallint CHECK (feedback IN (-1, 1)),
  feedback_note      text,
  created_at         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ai_consultations_doctor ON public.ai_consultations (doctor_profile_id, created_at DESC);
ALTER TABLE public.ai_consultations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ai_consultations_doctor_read ON public.ai_consultations;
CREATE POLICY ai_consultations_doctor_read ON public.ai_consultations
  FOR SELECT TO authenticated
  USING (doctor_profile_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid()) OR public.is_admin());
-- inserts: service role (edge function); feedback through the RPC below

CREATE OR REPLACE FUNCTION public.rate_ai_consultation(p_id uuid, p_rating int, p_note text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_rating IS NULL OR p_rating NOT IN (-1, 1) THEN RAISE EXCEPTION 'bad_rating'; END IF;
  UPDATE public.ai_consultations
     SET feedback = p_rating, feedback_note = left(coalesce(p_note, ''), 1000)
   WHERE id = p_id
     AND doctor_profile_id IN (SELECT id FROM public.profiles WHERE user_id = auth.uid());
  IF NOT FOUND THEN RAISE EXCEPTION 'not_found'; END IF;
END; $$;
REVOKE EXECUTE ON FUNCTION public.rate_ai_consultation(uuid, int, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.rate_ai_consultation(uuid, int, text) TO authenticated;

-- ----------------------------------------------------------------------------
-- §5 Private bucket for uploaded reference PDFs (admins upload; edge fn reads)
-- ----------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('medical-references', 'medical-references', false, 209715200, ARRAY['application/pdf','text/plain'])
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "medical refs admin all" ON storage.objects;
CREATE POLICY "medical refs admin all" ON storage.objects
  FOR ALL TO authenticated
  USING (bucket_id = 'medical-references' AND public.is_admin())
  WITH CHECK (bucket_id = 'medical-references' AND public.is_admin());

NOTIFY pgrst, 'reload schema';
