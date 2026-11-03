-- ============================================================================
-- Make doctor upload buckets accept iPhone (HEIC/HEIF) + common image types.
--
-- Both buckets were created with `ON CONFLICT DO NOTHING` and a narrow
-- allow-list, so an iPhone photo (HEIC) is rejected at the storage layer even
-- though the app validates the type. This forces the full allow-list on both
-- the credentials (verification documents) and doctor-assets (signature/stamp)
-- buckets, fixing "upload doesn't complete" for iPhone users.
-- ============================================================================
UPDATE storage.buckets
   SET allowed_mime_types = ARRAY[
         'image/jpeg','image/png','image/webp','image/heic','image/heif','application/pdf'
       ],
       file_size_limit = GREATEST(COALESCE(file_size_limit, 0), 10485760)  -- ≥10 MB
 WHERE id = 'doctor-credentials';

UPDATE storage.buckets
   SET allowed_mime_types = ARRAY[
         'image/jpeg','image/png','image/webp','image/heic','image/heif'
       ],
       file_size_limit = GREATEST(COALESCE(file_size_limit, 0), 2097152)   -- ≥2 MB
 WHERE id = 'doctor-assets';
