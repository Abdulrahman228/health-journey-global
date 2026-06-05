-- ============================================================================
-- Phase 6 — Patient lab results page support
--
-- Adds:
--   • notifications table (in-app, per-user)
--   • trigger that fires when a doctor uploads a lab/imaging attachment for
--     a patient — creates an in-app notification "Your lab results are ready"
--   • RPC mark_notifications_read({uuid[]}) and unread_notifications_count()
-- ============================================================================

-- Notifications table -------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.notifications (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind        TEXT NOT NULL,                  -- 'lab_ready', 'appointment_reminder', etc.
  title       TEXT NOT NULL,
  body        TEXT,
  link        TEXT,                           -- in-app deep link
  metadata    JSONB NOT NULL DEFAULT '{}',
  is_read     BOOLEAN NOT NULL DEFAULT false,
  read_at     TIMESTAMPTZ,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notif_user_unread
  ON public.notifications(user_id, created_at DESC)
  WHERE is_read = false;

CREATE INDEX IF NOT EXISTS idx_notif_user_all
  ON public.notifications(user_id, created_at DESC);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notif_user_read" ON public.notifications;
CREATE POLICY "notif_user_read" ON public.notifications
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "notif_user_update" ON public.notifications;
CREATE POLICY "notif_user_update" ON public.notifications
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- Inserts only via SECURITY DEFINER triggers / RPCs.
DROP POLICY IF EXISTS "notif_block_insert" ON public.notifications;
CREATE POLICY "notif_block_insert" ON public.notifications
  FOR INSERT TO authenticated, anon
  WITH CHECK (false);

-- Trigger: when a doctor uploads a lab/imaging attachment, notify the patient.
CREATE OR REPLACE FUNCTION public._notify_patient_lab_ready()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
  v_patient_user UUID;
  v_doctor_name  TEXT;
  v_title        TEXT;
  v_body         TEXT;
BEGIN
  -- Only fire on attachments uploaded by someone OTHER than the patient
  -- (i.e. by a doctor / clinic).
  IF NEW.uploaded_by_profile_id IS NOT NULL
     AND NEW.uploaded_by_profile_id = NEW.patient_profile_id THEN
    RETURN NEW;
  END IF;

  -- Limit to clinical attachments worth notifying about.
  IF NEW.type NOT IN ('lab_result','xray','mri','ct','ecg') THEN
    RETURN NEW;
  END IF;

  SELECT user_id INTO v_patient_user
  FROM public.profiles WHERE id = NEW.patient_profile_id;

  IF v_patient_user IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(full_name, 'الطبيب') INTO v_doctor_name
  FROM public.profiles WHERE id = NEW.uploaded_by_profile_id;

  v_title := CASE NEW.type
    WHEN 'lab_result' THEN 'نتائج التحاليل جاهزة'
    WHEN 'xray'       THEN 'الأشعة جاهزة'
    WHEN 'mri'        THEN 'الرنين المغناطيسي جاهز'
    WHEN 'ct'         THEN 'الأشعة المقطعية جاهزة'
    WHEN 'ecg'        THEN 'تخطيط القلب جاهز'
    ELSE 'مستند طبي جديد'
  END;

  v_body := COALESCE(v_doctor_name, 'الطبيب') || ' رفع لك مستندًا طبيًا. اضغط للعرض.';

  INSERT INTO public.notifications (user_id, kind, title, body, link, metadata)
  VALUES (
    v_patient_user,
    'lab_ready',
    v_title,
    v_body,
    '/profile/lab-results',
    jsonb_build_object(
      'attachment_id', NEW.id,
      'type', NEW.type,
      'file_name', NEW.file_name
    )
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_lab_ready ON public.medical_attachments;
CREATE TRIGGER trg_notify_lab_ready
  AFTER INSERT ON public.medical_attachments
  FOR EACH ROW EXECUTE FUNCTION public._notify_patient_lab_ready();

-- RPCs ----------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.unread_notifications_count()
RETURNS INT
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT COUNT(*)::int
  FROM public.notifications
  WHERE user_id = auth.uid() AND is_read = false;
$$;

CREATE OR REPLACE FUNCTION public.mark_notifications_read(_ids UUID[])
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.notifications
     SET is_read = true,
         read_at = now()
   WHERE user_id = auth.uid()
     AND id = ANY(_ids);
END;
$$;

GRANT EXECUTE ON FUNCTION public.unread_notifications_count() TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_notifications_read(UUID[]) TO authenticated;
