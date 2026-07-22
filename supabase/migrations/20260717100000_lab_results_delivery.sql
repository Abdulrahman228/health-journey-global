-- ============================================================================
-- Lab / radiology result delivery, payment-gated (Point 16).
--
-- medical_attachments already supports doctor uploads + patient reads and has
-- the right types (lab_result, xray, mri, ct, ecg). This adds:
--   1) appointment_id — links a delivered result to the paid service,
--   2) a doctor INSERT policy keyed on the appointment (lab/radiology doctor
--      delivers a result to their appointment's patient),
--   3) payment gating on the patient READ: a result tied to an appointment is
--      hidden until that appointment is paid. The patient's OWN uploads
--      (appointment_id NULL) are always visible, so nothing existing breaks.
-- ============================================================================

ALTER TABLE public.medical_attachments
  ADD COLUMN IF NOT EXISTS appointment_id uuid REFERENCES public.appointments(id) ON DELETE SET NULL;

-- Doctor delivers a result tied to one of THEIR appointments for THAT patient.
DROP POLICY IF EXISTS "doctor delivers result to appointment patient" ON public.medical_attachments;
CREATE POLICY "doctor delivers result to appointment patient" ON public.medical_attachments
  FOR INSERT
  WITH CHECK (
    appointment_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.appointments a
      JOIN public.doctor_details dd ON dd.id = a.doctor_id
      JOIN public.profiles p ON p.id = dd.profile_id
      WHERE a.id = medical_attachments.appointment_id
        AND a.patient_id = medical_attachments.patient_profile_id
        AND p.user_id = auth.uid()
    )
  );

-- Payment-gate the patient read for appointment-linked (doctor-delivered)
-- results; the patient's own uploads (no appointment_id) stay visible.
DROP POLICY IF EXISTS "patient reads own attachments" ON public.medical_attachments;
CREATE POLICY "patient reads own attachments" ON public.medical_attachments
  FOR SELECT
  USING (
    auth.uid() IN (SELECT user_id FROM public.profiles WHERE id = patient_profile_id)
    AND (
      appointment_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.appointments a
        WHERE a.id = medical_attachments.appointment_id
          AND a.payment_status = 'paid'
      )
    )
  );
