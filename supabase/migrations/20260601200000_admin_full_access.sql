-- Grant admins (user_roles.role = 'admin') full management access to
-- doctor-related tables. Patient-side / public read policies stay intact.

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = 'admin'
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_admin() TO anon, authenticated;

-- Helper macro: drop + recreate an admin ALL policy on each table
DO $$
DECLARE
  tbl TEXT;
  tables TEXT[] := ARRAY[
    'profiles',
    'doctor_details',
    'clinics',
    'clinic_schedules',
    'clinic_time_off',
    'appointments',
    'user_roles',
    'reviews',
    'patient_appointment_consent'
  ];
BEGIN
  FOREACH tbl IN ARRAY tables LOOP
    -- only proceed if the table exists
    IF EXISTS (
      SELECT 1 FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name = tbl
    ) THEN
      EXECUTE format('DROP POLICY IF EXISTS "admin full access" ON public.%I', tbl);
      EXECUTE format(
        'CREATE POLICY "admin full access" ON public.%I FOR ALL '
        'USING (public.is_admin()) WITH CHECK (public.is_admin())',
        tbl
      );
    END IF;
  END LOOP;
END $$;
