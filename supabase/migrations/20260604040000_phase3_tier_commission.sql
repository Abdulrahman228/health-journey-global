-- ============================================================================
-- Phase 3 — Tier-based commission + batch tier helper
--
-- Goals:
-- 1. Replace the consultation-completion trigger so it reads the
--    doctor's *active subscription tier* (free/premium/gold) and applies
--    the matching commission_pct from public.subscription_plans.
--    In-person bookings remain commission-free (per /pricing copy).
-- 2. Add doctor_active_tiers(uuid[]) batch helper for the doctor-list
--    UI so the front-end can fetch tiers for many doctors in one round-trip.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Updated trigger: tier-aware commission + in-person free
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_transaction_on_appointment_completion()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_doctor_details_id UUID;
  v_tier              TEXT;
  v_commission_pct    NUMERIC(5,2);
  v_settings_pct      NUMERIC(5,2);
  v_fee_pct           NUMERIC(5,2);
  v_fee               NUMERIC(10,2);
  v_net               NUMERIC(10,2);
  v_appt_type         TEXT;
  v_description       TEXT;
BEGIN
  IF NEW.status = 'completed' AND (OLD.status IS DISTINCT FROM 'completed') THEN
    -- appointments.doctor_id references doctor_details.id directly
    v_doctor_details_id := NEW.doctor_id;
    v_appt_type := COALESCE(NEW.appointment_type, 'in_person');

    -- Idempotency guard
    IF EXISTS (
      SELECT 1 FROM public.doctor_transactions
      WHERE appointment_id = NEW.id AND type = 'consultation'
    ) THEN
      RETURN NEW;
    END IF;

    -- In-person bookings are 100% commission-free per /pricing.
    IF v_appt_type = 'in_person' THEN
      v_fee_pct := 0;
      v_description := 'Auto: in-person visit completed (0% commission)';
    ELSE
      -- Online consultation → resolve tier-based commission.
      v_tier := public.doctor_active_tier(v_doctor_details_id);

      SELECT sp.commission_pct INTO v_commission_pct
        FROM public.subscription_plans sp
        WHERE sp.tier = v_tier
        ORDER BY sp.is_active DESC, sp.created_at DESC
        LIMIT 1;

      -- Manual override (admin): doctor_billing_settings.platform_fee_pct
      -- when explicitly set lower than the tier rate, takes precedence
      -- (this keeps existing "VIP" / partnership deals working).
      SELECT platform_fee_pct INTO v_settings_pct
        FROM public.doctor_billing_settings
        WHERE doctor_details_id = v_doctor_details_id;

      v_fee_pct := COALESCE(LEAST(v_settings_pct, v_commission_pct), v_commission_pct, 15.00);
      v_description := format(
        'Auto: online consultation completed (%s tier, %s%% commission)',
        v_tier, v_fee_pct
      );
    END IF;

    v_fee := ROUND((COALESCE(NEW.fee, 0) * v_fee_pct / 100)::numeric, 2);
    v_net := COALESCE(NEW.fee, 0) - v_fee;

    INSERT INTO public.doctor_transactions(
      doctor_details_id, appointment_id, type,
      gross_amount, platform_fee, net_amount, currency, status, description, metadata
    ) VALUES (
      v_doctor_details_id, NEW.id, 'consultation',
      COALESCE(NEW.fee, 0), v_fee, v_net, 'EGP', 'completed',
      v_description,
      jsonb_build_object(
        'tier', COALESCE(v_tier, 'in_person'),
        'commission_pct', v_fee_pct,
        'appointment_type', v_appt_type
      )
    );
  END IF;
  RETURN NEW;
END;
$$;

-- ----------------------------------------------------------------------------
-- 2) Batch tier resolver for the public doctor list
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.doctor_active_tiers(_doctor_ids UUID[])
RETURNS TABLE (doctor_id UUID, tier TEXT)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT dd.id AS doctor_id,
         public.doctor_active_tier(dd.id) AS tier
    FROM public.doctor_details dd
   WHERE dd.id = ANY(_doctor_ids);
$$;

GRANT EXECUTE ON FUNCTION public.doctor_active_tiers(UUID[]) TO anon, authenticated;

-- Make sure single-tier helper is callable by the public/anon role for the
-- /doctor/$id page (already SECURITY DEFINER but RLS-bypassing requires GRANT).
GRANT EXECUTE ON FUNCTION public.doctor_active_tier(UUID) TO anon, authenticated;
