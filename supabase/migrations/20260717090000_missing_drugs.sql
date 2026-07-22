-- ============================================================================
-- Missing / rare drug requests (Point 15).
--
-- pharmacy_drug_listings is pharmacy INVENTORY (only chain owners can write). It
-- has no place for a doctor/patient to say "I need this drug, who has it?". This
-- adds a lightweight requests board: anyone signed in can post a needed drug,
-- everyone can read active requests, and the poster can mark it resolved/delete.
-- Additive & safe — nothing existing changes.
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.missing_drugs (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id   uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  drug_name    text NOT NULL,
  note         text,
  city         text,
  is_resolved  boolean NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_missing_drugs_active
  ON public.missing_drugs (created_at DESC) WHERE is_resolved = false;

ALTER TABLE public.missing_drugs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Missing drugs readable by everyone" ON public.missing_drugs;
CREATE POLICY "Missing drugs readable by everyone"
  ON public.missing_drugs FOR SELECT USING (true);

DROP POLICY IF EXISTS "Users post own missing drug" ON public.missing_drugs;
CREATE POLICY "Users post own missing drug"
  ON public.missing_drugs FOR INSERT
  WITH CHECK (auth.uid() IN (SELECT user_id FROM public.profiles WHERE id = profile_id));

DROP POLICY IF EXISTS "Users update own missing drug" ON public.missing_drugs;
CREATE POLICY "Users update own missing drug"
  ON public.missing_drugs FOR UPDATE
  USING (auth.uid() IN (SELECT user_id FROM public.profiles WHERE id = profile_id));

DROP POLICY IF EXISTS "Users delete own missing drug" ON public.missing_drugs;
CREATE POLICY "Users delete own missing drug"
  ON public.missing_drugs FOR DELETE
  USING (auth.uid() IN (SELECT user_id FROM public.profiles WHERE id = profile_id));
