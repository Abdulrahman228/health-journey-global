-- ============================================================================
-- Ensure the doctor-credentials bucket accepts the intended file types.
-- The original bucket was created with `ON CONFLICT DO NOTHING`, so if it had
-- ever pre-existed with a narrower allow-list (e.g. no HEIC), iPhone photo
-- uploads would fail at the storage layer. Force the full allow-list + limit.
-- ============================================================================
UPDATE storage.buckets
   SET allowed_mime_types = ARRAY[
         'image/jpeg','image/png','image/webp','image/heic','image/heif','application/pdf'
       ],
       file_size_limit = 10485760  -- 10 MB
 WHERE id = 'doctor-credentials';
