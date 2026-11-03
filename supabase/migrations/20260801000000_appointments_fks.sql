-- Add the missing foreign keys on `appointments`.
--
-- The table was created with patient_id/doctor_id/clinic_id as plain uuid
-- columns and no FKs. But the app reads appointments with PostgREST embeds that
-- reference FK names explicitly, e.g.:
--     doctor_details!appointments_doctor_id_fkey ( ... )   (my-queue page)
--     profiles!appointments_patient_id_fkey ( ... )        (doctor live queue)
--     clinic:clinics ( ... )                               (auto-relationship)
-- Without those constraints PostgREST returns PGRST200 and the query throws, so
-- e.g. the my-queue page shows "الحجز غير موجود" for a freshly booked slot.
--
-- Named exactly as the embeds expect; NOT VALID so creation never fails on any
-- pre-existing orphan row while still being detected by PostgREST + enforced for
-- new rows.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'appointments_patient_id_fkey'
       AND conrelid = 'public.appointments'::regclass
  ) THEN
    ALTER TABLE public.appointments
      ADD CONSTRAINT appointments_patient_id_fkey
      FOREIGN KEY (patient_id) REFERENCES public.profiles(id) ON DELETE CASCADE
      NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'appointments_doctor_id_fkey'
       AND conrelid = 'public.appointments'::regclass
  ) THEN
    ALTER TABLE public.appointments
      ADD CONSTRAINT appointments_doctor_id_fkey
      FOREIGN KEY (doctor_id) REFERENCES public.doctor_details(id) ON DELETE CASCADE
      NOT VALID;
  END IF;

  -- clinic_id was added later and is nullable (online visits) — SET NULL.
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'appointments' AND column_name = 'clinic_id'
  ) AND NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'appointments_clinic_id_fkey'
       AND conrelid = 'public.appointments'::regclass
  ) THEN
    ALTER TABLE public.appointments
      ADD CONSTRAINT appointments_clinic_id_fkey
      FOREIGN KEY (clinic_id) REFERENCES public.clinics(id) ON DELETE SET NULL
      NOT VALID;
  END IF;
END$$;

NOTIFY pgrst, 'reload schema';
