-- ============================================================================
-- Phase 5 — Doctor expenses & monthly P&L (Premium/Gold accounting)
--
-- Adds:
--   • doctor_expenses table (clinic rent, equipment, marketing, staff, ...)
--   • doctor_monthly_pnl(uuid, int, int) RPC → revenue, fees, expenses, net
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.doctor_expenses (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_details_id UUID NOT NULL REFERENCES public.doctor_details(id) ON DELETE CASCADE,
  expense_date      DATE NOT NULL DEFAULT CURRENT_DATE,
  category          TEXT NOT NULL CHECK (category IN (
    'rent','utilities','staff','equipment','supplies','marketing','tax','software','training','other'
  )),
  amount            NUMERIC(12,2) NOT NULL CHECK (amount >= 0),
  currency          TEXT NOT NULL DEFAULT 'EGP',
  vendor            TEXT,
  description       TEXT,
  receipt_url       TEXT,
  created_by        UUID REFERENCES auth.users(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_doctor_expenses_doctor_date
  ON public.doctor_expenses(doctor_details_id, expense_date DESC);

ALTER TABLE public.doctor_expenses ENABLE ROW LEVEL SECURITY;

-- Doctor sees & manages own expenses; admin sees all.
DROP POLICY IF EXISTS "expenses_doctor_read" ON public.doctor_expenses;
CREATE POLICY "expenses_doctor_read" ON public.doctor_expenses
  FOR SELECT TO authenticated
  USING (
    doctor_details_id IN (
      SELECT dd.id FROM public.doctor_details dd
      JOIN public.profiles p ON p.id = dd.profile_id
      WHERE p.user_id = auth.uid()
    )
    OR public.is_admin()
  );

DROP POLICY IF EXISTS "expenses_doctor_write" ON public.doctor_expenses;
CREATE POLICY "expenses_doctor_write" ON public.doctor_expenses
  FOR INSERT TO authenticated
  WITH CHECK (
    doctor_details_id IN (
      SELECT dd.id FROM public.doctor_details dd
      JOIN public.profiles p ON p.id = dd.profile_id
      WHERE p.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "expenses_doctor_update" ON public.doctor_expenses;
CREATE POLICY "expenses_doctor_update" ON public.doctor_expenses
  FOR UPDATE TO authenticated
  USING (
    doctor_details_id IN (
      SELECT dd.id FROM public.doctor_details dd
      JOIN public.profiles p ON p.id = dd.profile_id
      WHERE p.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "expenses_doctor_delete" ON public.doctor_expenses;
CREATE POLICY "expenses_doctor_delete" ON public.doctor_expenses
  FOR DELETE TO authenticated
  USING (
    doctor_details_id IN (
      SELECT dd.id FROM public.doctor_details dd
      JOIN public.profiles p ON p.id = dd.profile_id
      WHERE p.user_id = auth.uid()
    )
  );

-- Trigger: bump updated_at
CREATE OR REPLACE FUNCTION public._touch_doctor_expenses_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_doctor_expenses_touch ON public.doctor_expenses;
CREATE TRIGGER trg_doctor_expenses_touch
  BEFORE UPDATE ON public.doctor_expenses
  FOR EACH ROW EXECUTE FUNCTION public._touch_doctor_expenses_updated_at();

-- Monthly P&L RPC
CREATE OR REPLACE FUNCTION public.doctor_monthly_pnl(
  _doctor_details_id UUID,
  _year INT,
  _month INT
)
RETURNS TABLE (
  gross_revenue   NUMERIC,
  platform_fees   NUMERIC,
  net_revenue     NUMERIC,
  total_expenses  NUMERIC,
  bookings_count  INT,
  net_profit      NUMERIC,
  currency        TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
  v_from DATE := make_date(_year, _month, 1);
  v_to   DATE := (make_date(_year, _month, 1) + INTERVAL '1 month')::date;
BEGIN
  RETURN QUERY
  WITH revenue AS (
    SELECT
      COALESCE(SUM(gross_amount),0) AS gross,
      COALESCE(SUM(platform_fee),0) AS fees,
      COALESCE(SUM(net_amount),0)   AS net,
      COUNT(*) FILTER (WHERE type='consultation') AS bookings,
      COALESCE(MAX(currency), 'EGP') AS curr
    FROM public.doctor_transactions
    WHERE doctor_details_id = _doctor_details_id
      AND status = 'completed'
      AND type IN ('consultation','adjustment','bonus')
      AND created_at >= v_from
      AND created_at <  v_to
  ),
  expenses AS (
    SELECT COALESCE(SUM(amount),0) AS total
    FROM public.doctor_expenses
    WHERE doctor_details_id = _doctor_details_id
      AND expense_date >= v_from
      AND expense_date <  v_to
  )
  SELECT
    r.gross::numeric,
    r.fees::numeric,
    r.net::numeric,
    e.total::numeric,
    r.bookings::int,
    (r.net - e.total)::numeric,
    r.curr
  FROM revenue r CROSS JOIN expenses e;
END;
$$;

GRANT EXECUTE ON FUNCTION public.doctor_monthly_pnl(UUID, INT, INT) TO authenticated;
