-- Prevent a patient from double-booking the same doctor on the same day.
--
-- book_queue_appointment only checked date/time-off/schedule/capacity — never
-- whether this patient already holds an active booking with the doctor that
-- day. So a double-click (or a second visit to the page) created duplicate
-- appointments. A BEFORE INSERT trigger enforces "one active booking per
-- patient per doctor per day" across ALL booking paths, not just that RPC.
--
-- "Active" = not cancelled / no_show / completed, so a patient can re-book
-- after cancelling or after a finished visit.

CREATE OR REPLACE FUNCTION public._block_duplicate_active_booking()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.appointment_date IS NOT NULL
     AND NEW.status NOT IN ('cancelled', 'no_show', 'completed')
     AND EXISTS (
       SELECT 1
         FROM public.appointments a
        WHERE a.patient_id = NEW.patient_id
          AND a.doctor_id = NEW.doctor_id
          AND a.appointment_date = NEW.appointment_date
          AND a.status NOT IN ('cancelled', 'no_show', 'completed')
          AND a.id <> NEW.id
     ) THEN
    RAISE EXCEPTION 'لديك حجز بالفعل مع هذا الطبيب في هذا اليوم'
      USING ERRCODE = '23505';
  END IF;
  RETURN NEW;
END$$;

DROP TRIGGER IF EXISTS trg_block_duplicate_active_booking ON public.appointments;
CREATE TRIGGER trg_block_duplicate_active_booking
  BEFORE INSERT ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public._block_duplicate_active_booking();
