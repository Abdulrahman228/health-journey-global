-- =====================================================================
-- Phase 9: Priority Support — ticket system tied to doctor tier.
--
-- Free      → no SLA badge, normal queue (priority 'normal')
-- Premium   → priority 'high'  badge "<24h"
-- Gold      → priority 'urgent' badge "<4h"
--
-- Patients can also file tickets (priority 'normal').
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.support_tickets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  subject TEXT NOT NULL,
  body TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'general',
  priority TEXT NOT NULL DEFAULT 'normal'
    CHECK (priority IN ('normal','high','urgent')),
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open','in_progress','resolved','closed')),
  admin_response TEXT,
  responded_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  responded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_support_tickets_user
  ON public.support_tickets (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_support_tickets_status_priority
  ON public.support_tickets (status, priority, created_at DESC);

ALTER TABLE public.support_tickets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "support_tickets_user_select" ON public.support_tickets;
CREATE POLICY "support_tickets_user_select"
  ON public.support_tickets FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin());

DROP POLICY IF EXISTS "support_tickets_user_insert" ON public.support_tickets;
CREATE POLICY "support_tickets_user_insert"
  ON public.support_tickets FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "support_tickets_admin_update" ON public.support_tickets;
CREATE POLICY "support_tickets_admin_update"
  ON public.support_tickets FOR UPDATE TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "support_tickets_admin_delete" ON public.support_tickets;
CREATE POLICY "support_tickets_admin_delete"
  ON public.support_tickets FOR DELETE TO authenticated
  USING (public.is_admin());

DROP TRIGGER IF EXISTS trg_support_tickets_updated_at ON public.support_tickets;
CREATE TRIGGER trg_support_tickets_updated_at
  BEFORE UPDATE ON public.support_tickets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Auto-set ticket priority based on the user's active doctor tier.
CREATE OR REPLACE FUNCTION public._set_ticket_priority_from_tier()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile_id UUID;
  v_dd_id UUID;
  v_tier TEXT;
BEGIN
  -- Don't override priority if explicitly set by admin/elevated logic.
  IF TG_OP = 'INSERT' AND NEW.priority = 'normal' THEN
    SELECT id INTO v_profile_id
      FROM public.profiles
     WHERE user_id = NEW.user_id
     LIMIT 1;

    IF v_profile_id IS NOT NULL THEN
      SELECT id INTO v_dd_id
        FROM public.doctor_details
       WHERE profile_id = v_profile_id
       LIMIT 1;

      IF v_dd_id IS NOT NULL THEN
        v_tier := public.doctor_active_tier(v_dd_id);
        IF v_tier = 'gold' THEN
          NEW.priority := 'urgent';
        ELSIF v_tier = 'premium' THEN
          NEW.priority := 'high';
        END IF;
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_support_tickets_set_priority ON public.support_tickets;
CREATE TRIGGER trg_support_tickets_set_priority
  BEFORE INSERT ON public.support_tickets
  FOR EACH ROW EXECUTE FUNCTION public._set_ticket_priority_from_tier();

-- Notify admins when a ticket is filed (best-effort: insert into notifications
-- for every admin user).
CREATE OR REPLACE FUNCTION public._notify_admins_on_ticket()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin RECORD;
  v_label TEXT;
BEGIN
  v_label := CASE NEW.priority
    WHEN 'urgent' THEN 'عاجلة (Gold)'
    WHEN 'high'   THEN 'مهمة (Premium)'
    ELSE 'عادية'
  END;

  FOR v_admin IN
    SELECT ur.user_id
      FROM public.user_roles ur
     WHERE ur.role = 'admin'::public.app_role
  LOOP
    INSERT INTO public.notifications (user_id, kind, title, body, link, metadata)
    VALUES (
      v_admin.user_id,
      'support_ticket',
      'تذكرة دعم جديدة — ' || v_label,
      LEFT(NEW.subject, 200),
      '/admin/support-tickets',
      jsonb_build_object('ticket_id', NEW.id, 'priority', NEW.priority)
    );
  END LOOP;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_support_tickets_notify_admins ON public.support_tickets;
CREATE TRIGGER trg_support_tickets_notify_admins
  AFTER INSERT ON public.support_tickets
  FOR EACH ROW EXECUTE FUNCTION public._notify_admins_on_ticket();

-- Notify ticket owner when admin responds.
CREATE OR REPLACE FUNCTION public._notify_user_on_ticket_response()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.admin_response IS NOT NULL
     AND (OLD.admin_response IS NULL OR OLD.admin_response <> NEW.admin_response) THEN
    INSERT INTO public.notifications (user_id, kind, title, body, link, metadata)
    VALUES (
      NEW.user_id,
      'support_ticket_reply',
      'وصلك رد من فريق الدعم',
      LEFT(COALESCE(NEW.subject, 'تذكرة دعم'), 160),
      '/dashboard/support',
      jsonb_build_object('ticket_id', NEW.id)
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_support_tickets_notify_user ON public.support_tickets;
CREATE TRIGGER trg_support_tickets_notify_user
  AFTER UPDATE ON public.support_tickets
  FOR EACH ROW EXECUTE FUNCTION public._notify_user_on_ticket_response();

