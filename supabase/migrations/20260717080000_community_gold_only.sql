-- ============================================================================
-- Community (awareness) posts: restrict authoring to VERIFIED + GOLD doctors.
--
-- The existing policy already required a verified doctor for 'awareness' posts.
-- Per the product rule ("المجتمع لا يظهر للطبيب المجاني"), also require the Gold
-- tier (via doctor_active_tier). Questions / missing-drug posts are unchanged
-- (any authenticated user), so nothing else breaks.
-- ============================================================================
DROP POLICY IF EXISTS "Create posts with role rules" ON public.posts;
CREATE POLICY "Create posts with role rules"
  ON public.posts FOR INSERT
  WITH CHECK (
    auth.uid() IN (SELECT user_id FROM public.profiles WHERE id = author_profile_id)
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
