-- Articles table for TOFU/MOFU SEO content engine.
-- Targets long-tail informational queries ("ما هي أعراض ضغط الدم"...)
-- and funnels readers into specialty/doctor pages via internal links.
CREATE TABLE IF NOT EXISTS public.articles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text UNIQUE NOT NULL,
  language text NOT NULL DEFAULT 'ar' CHECK (language IN ('ar','en')),
  title text NOT NULL,
  excerpt text,
  body_md text NOT NULL,
  cover_image text,
  specialty_slug text,
  author_name text,
  author_doctor_id uuid REFERENCES public.doctor_details(id) ON DELETE SET NULL,
  reading_minutes integer DEFAULT 5,
  is_published boolean NOT NULL DEFAULT false,
  published_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_articles_published ON public.articles (is_published, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_articles_specialty ON public.articles (specialty_slug) WHERE is_published = true;
CREATE INDEX IF NOT EXISTS idx_articles_lang ON public.articles (language, is_published);

ALTER TABLE public.articles ENABLE ROW LEVEL SECURITY;

-- Public can read published articles only.
CREATE POLICY "Published articles viewable by everyone"
  ON public.articles FOR SELECT
  USING (is_published = true);

-- Admins (role='admin' in user_roles) manage all articles.
CREATE POLICY "Admins manage articles"
  ON public.articles FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid() AND ur.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid() AND ur.role = 'admin'
    )
  );

CREATE TRIGGER trg_articles_updated_at
  BEFORE UPDATE ON public.articles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
