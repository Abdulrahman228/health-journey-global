-- ============================================================================
-- Storage bucket for manual-payment receipts (Trust-but-Verify subscriptions).
--
-- Public bucket so the stored public URL renders directly in the admin review
-- queue. Object paths are `{auth.uid()}/{uuid}.{ext}` — unguessable and
-- unlistable — and writes are locked to the uploader's own folder. Size/type
-- are also enforced server-side here as defense-in-depth behind the client
-- checks.
-- ============================================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'receipts',
  'receipts',
  true,
  5242880, -- 5 MB
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
  SET public = EXCLUDED.public,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Idempotent policy (re)creation.
DROP POLICY IF EXISTS "Receipts readable" ON storage.objects;
CREATE POLICY "Receipts readable"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'receipts');

DROP POLICY IF EXISTS "Users upload own receipts" ON storage.objects;
CREATE POLICY "Users upload own receipts"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'receipts'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "Users delete own receipts" ON storage.objects;
CREATE POLICY "Users delete own receipts"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'receipts'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );
