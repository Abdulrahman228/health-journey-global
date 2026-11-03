-- ============================================================================
-- RBAC Phase 1 — permission lockdown (roles strategy, batch 3).
--
-- Two tightenings. No schema change, so policies take effect immediately
-- (no NOTIFY pgrst needed). Nothing else is touched:
--   • Patient medical card  → doctor already reads via "doctor reads patient
--     profile of treated patients" (20260528000200). No change.
--   • Pharmacy drug listings → already chain-owner-only INSERT
--     (20260526082716). No change. (missing_drugs stays open: it is the
--     PATIENT reporting a drug they can't find, not a pharmacy listing.)
--
-- 1) PRESCRIPTIONS read — SECURITY FIX. The old policy's USING only checked
--    that the parent medical_record EXISTS, with no identity test, so ANY
--    authenticated user could read ANY prescription. Restrict reads to the
--    record's own doctor OR the record's own patient. (Admin keeps full
--    access via the existing "admin full prescriptions" policy.) This both
--    seals the hole and matches the product rule: the doctor authors/edits,
--    the patient reads their own copy, the pharmacy has no direct access.
--
-- 2) COMMUNITY posts INSERT — restrict authoring to DOCTORS for every post
--    type (patients can no longer post; they read and interact only).
--    'awareness' keeps its extra verified + Gold gate.
-- ============================================================================

-- 1) Prescriptions: doctor of the record OR patient of the record only. ------
DROP POLICY IF EXISTS "prescriptions read via parent record" ON public.prescriptions;
CREATE POLICY "prescriptions read via parent record" ON public.prescriptions
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.medical_records mr
      WHERE mr.id = prescriptions.medical_record_id
        AND (
          auth.uid() IN (SELECT user_id FROM public.profiles WHERE id = mr.doctor_profile_id)
          OR
          auth.uid() IN (SELECT user_id FROM public.profiles WHERE id = mr.patient_profile_id)
        )
    )
  );

-- prescription_items follows the parent prescription; tighten its read the
-- same way so items are not readable when the parent is not.
DROP POLICY IF EXISTS "rx_items read via parent rx" ON public.prescription_items;
CREATE POLICY "rx_items read via parent rx" ON public.prescription_items
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.prescriptions p
      JOIN public.medical_records mr ON mr.id = p.medical_record_id
      WHERE p.id = prescription_items.prescription_id
        AND (
          auth.uid() IN (SELECT user_id FROM public.profiles WHERE id = mr.doctor_profile_id)
          OR
          auth.uid() IN (SELECT user_id FROM public.profiles WHERE id = mr.patient_profile_id)
        )
    )
  );

-- 2) Community posts: doctors author, patients view only. --------------------
DROP POLICY IF EXISTS "Create posts with role rules" ON public.posts;
CREATE POLICY "Create posts with role rules"
  ON public.posts FOR INSERT
  WITH CHECK (
    -- author owns the profile they are posting as
    auth.uid() IN (SELECT user_id FROM public.profiles WHERE id = author_profile_id)
    -- and is a doctor (has a doctor_details row) — patients cannot post
    AND EXISTS (
      SELECT 1 FROM public.doctor_details dd WHERE dd.profile_id = author_profile_id
    )
    AND (
      post_type IN ('question', 'missing_drug')
      OR (
        post_type = 'awareness'
        AND public.is_verified_doctor_profile(author_profile_id)
        AND EXISTS (
          SELECT 1 FROM public.doctor_details dd
          WHERE dd.profile_id = author_profile_id
            AND public.doctor_active_tier(dd.id) = 'gold'
        )
      )
    )
  );
