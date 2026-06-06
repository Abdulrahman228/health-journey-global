-- =====================================================================
-- P1-C: Coupon / promo system (June 6, 2026)
--
-- Adds `coupons` and `coupon_redemptions` tables, plus two columns on
-- `appointments` (coupon_code, coupon_discount) to track applied
-- discounts. Idempotency is enforced by a UNIQUE constraint on
-- (coupon_id, appointment_id) in coupon_redemptions.
--
-- RLS:
--   coupons              — public SELECT for active in-window rows; INSERT/UPDATE/DELETE admin only
--   coupon_redemptions   — SELECT own user rows + admin all; INSERT only via service role
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.coupons (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code                  TEXT NOT NULL UNIQUE,
  description           TEXT,
  discount_type         TEXT NOT NULL CHECK (discount_type IN ('percent', 'fixed')),
  discount_value        NUMERIC(10,2) NOT NULL CHECK (discount_value > 0),
  currency              TEXT,                            -- only meaningful for fixed
  min_amount            NUMERIC(10,2),                   -- minimum order amount (major units)
  max_discount          NUMERIC(10,2),                   -- cap for percent type
  valid_from            TIMESTAMPTZ,
  valid_until           TIMESTAMPTZ,
  usage_limit           INT,                             -- NULL = unlimited overall
  usage_limit_per_user  INT DEFAULT 1,                   -- NULL = unlimited per user
  times_used            INT NOT NULL DEFAULT 0,
  applies_to            TEXT NOT NULL DEFAULT 'all'
                           CHECK (applies_to IN ('all', 'video', 'in_person')),
  doctor_id             UUID,                            -- restrict to one doctor (doctor_details.id)
  is_active             BOOLEAN NOT NULL DEFAULT TRUE,
  created_by            UUID,                            -- admin user_id
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT coupons_percent_range CHECK (
    discount_type <> 'percent' OR (discount_value > 0 AND discount_value <= 100)
  )
);

CREATE INDEX IF NOT EXISTS coupons_code_idx           ON public.coupons (code);
CREATE INDEX IF NOT EXISTS coupons_active_window_idx  ON public.coupons (is_active, valid_from, valid_until);
CREATE INDEX IF NOT EXISTS coupons_doctor_idx         ON public.coupons (doctor_id) WHERE doctor_id IS NOT NULL;

-- Always store codes upper-cased.
CREATE OR REPLACE FUNCTION public._normalize_coupon_code()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.code := UPPER(TRIM(NEW.code));
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_coupons_normalize ON public.coupons;
CREATE TRIGGER trg_coupons_normalize
BEFORE INSERT OR UPDATE ON public.coupons
FOR EACH ROW EXECUTE FUNCTION public._normalize_coupon_code();

-- ---------------------------------------------------------------------
-- coupon_redemptions
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.coupon_redemptions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  coupon_id         UUID NOT NULL REFERENCES public.coupons(id) ON DELETE CASCADE,
  user_id           UUID NOT NULL,                       -- auth.users.id
  appointment_id    UUID NOT NULL REFERENCES public.appointments(id) ON DELETE CASCADE,
  discount_amount   NUMERIC(10,2) NOT NULL,
  original_amount   NUMERIC(10,2) NOT NULL,
  final_amount      NUMERIC(10,2) NOT NULL,
  currency          TEXT NOT NULL,
  redeemed_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT coupon_redemptions_unique_per_appointment UNIQUE (coupon_id, appointment_id)
);

CREATE INDEX IF NOT EXISTS coupon_redemptions_coupon_idx       ON public.coupon_redemptions (coupon_id);
CREATE INDEX IF NOT EXISTS coupon_redemptions_user_idx         ON public.coupon_redemptions (user_id);
CREATE INDEX IF NOT EXISTS coupon_redemptions_appointment_idx  ON public.coupon_redemptions (appointment_id);

-- ---------------------------------------------------------------------
-- Appointments columns to remember which coupon was applied at checkout.
-- ---------------------------------------------------------------------
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS coupon_code     TEXT,
  ADD COLUMN IF NOT EXISTS coupon_discount NUMERIC(10,2);

-- =====================================================================
-- RLS
-- =====================================================================
ALTER TABLE public.coupons              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coupon_redemptions   ENABLE ROW LEVEL SECURITY;

-- Public can SELECT active in-window coupons (so the booking UI can
-- preview a discount). Sensitive admin metadata stays in the row but
-- the schema is non-secret.
DROP POLICY IF EXISTS coupons_public_select ON public.coupons;
CREATE POLICY coupons_public_select
  ON public.coupons
  FOR SELECT
  TO public
  USING (
    is_active = TRUE
    AND (valid_from   IS NULL OR valid_from   <= NOW())
    AND (valid_until  IS NULL OR valid_until  >= NOW())
  );

DROP POLICY IF EXISTS coupons_admin_all ON public.coupons;
CREATE POLICY coupons_admin_all
  ON public.coupons
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid() AND ur.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid() AND ur.role = 'admin'
    )
  );

-- coupon_redemptions: users see their own redemptions, admin sees all.
-- INSERTs happen only via service role (server fn / webhook).
DROP POLICY IF EXISTS coupon_redemptions_self_select ON public.coupon_redemptions;
CREATE POLICY coupon_redemptions_self_select
  ON public.coupon_redemptions
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS coupon_redemptions_admin_select ON public.coupon_redemptions;
CREATE POLICY coupon_redemptions_admin_select
  ON public.coupon_redemptions
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid() AND ur.role = 'admin'
    )
  );

-- =====================================================================
-- record_coupon_redemption(): atomic helper invoked by the webhook
-- once a payment lands. Idempotent thanks to UNIQUE(coupon_id, appointment_id).
-- =====================================================================
CREATE OR REPLACE FUNCTION public.record_coupon_redemption(
  p_appointment_id UUID
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_appt          RECORD;
  v_coupon        RECORD;
  v_existing      UUID;
  v_redemption_id UUID;
  v_user_id       UUID;
BEGIN
  SELECT id, coupon_code, coupon_discount, fee, currency, patient_id
    INTO v_appt
    FROM public.appointments
   WHERE id = p_appointment_id;

  IF NOT FOUND OR v_appt.coupon_code IS NULL OR v_appt.coupon_discount IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT c.* INTO v_coupon
    FROM public.coupons c
   WHERE c.code = UPPER(v_appt.coupon_code)
   LIMIT 1;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- Resolve auth.users.id from patient profile id.
  SELECT p.user_id INTO v_user_id
    FROM public.profiles p
   WHERE p.id = v_appt.patient_id;

  IF v_user_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- Idempotency: bail out if already recorded.
  SELECT id INTO v_existing
    FROM public.coupon_redemptions
   WHERE coupon_id = v_coupon.id AND appointment_id = v_appt.id;
  IF v_existing IS NOT NULL THEN
    RETURN v_existing;
  END IF;

  INSERT INTO public.coupon_redemptions (
    coupon_id, user_id, appointment_id,
    discount_amount, original_amount, final_amount, currency
  ) VALUES (
    v_coupon.id, v_user_id, v_appt.id,
    v_appt.coupon_discount,
    v_appt.fee + v_appt.coupon_discount,
    v_appt.fee,
    UPPER(COALESCE(v_appt.currency, 'EGP'))
  ) RETURNING id INTO v_redemption_id;

  UPDATE public.coupons
     SET times_used = times_used + 1,
         updated_at = NOW()
   WHERE id = v_coupon.id;

  RETURN v_redemption_id;
END;
$$;

REVOKE ALL ON FUNCTION public.record_coupon_redemption(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_coupon_redemption(UUID) TO service_role;
