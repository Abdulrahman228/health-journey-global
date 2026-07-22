-- ============================================================================
-- Mobile CRUD fixes (from real-device testing)
-- ============================================================================

-- #1  patient_addresses is missing `label` on the deployed DB (the mobile insert
--     writes label/address_line/city/governorate). Add them idempotently.
ALTER TABLE public.patient_addresses ADD COLUMN IF NOT EXISTS label text NOT NULL DEFAULT 'home';
ALTER TABLE public.patient_addresses ADD COLUMN IF NOT EXISTS address_line text;
ALTER TABLE public.patient_addresses ADD COLUMN IF NOT EXISTS city text;
ALTER TABLE public.patient_addresses ADD COLUMN IF NOT EXISTS governorate text;
ALTER TABLE public.patient_addresses ADD COLUMN IF NOT EXISTS is_default boolean NOT NULL DEFAULT false;

-- #2  Patients could READ/INSERT their attachments but there was NO DELETE
--     policy — so the mobile delete silently affected 0 rows ("nothing happens").
--     Add the missing DELETE policy (mirrors "patient reads own attachments").
DROP POLICY IF EXISTS "patient deletes own attachments" ON public.medical_attachments;
CREATE POLICY "patient deletes own attachments" ON public.medical_attachments
  FOR DELETE
  USING (auth.uid() IN (SELECT user_id FROM public.profiles WHERE id = patient_profile_id));

-- #3  Ensure the founder account resolves as super_admin. Both the web
--     (useAuth) and the mobile read `user_roles` with the same priority, so the
--     admin routing works once the role row exists. Idempotent.
INSERT INTO public.user_roles (user_id, role)
SELECT u.id, 'super_admin'
FROM auth.users u
WHERE u.email = 'm248635197@gmail.com'
  AND NOT EXISTS (
    SELECT 1 FROM public.user_roles r WHERE r.user_id = u.id AND r.role = 'super_admin'
  );
