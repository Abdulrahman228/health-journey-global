-- Make the monthly P&L resilient so an expense total always shows.
--
-- Symptom: an expense is saved and listed, but "إجمالي المصاريف" stays 0.
-- Cause: doctor_monthly_pnl reads BOTH doctor_transactions (revenue) and
-- doctor_expenses in one query. If the revenue side raises at runtime (e.g.
-- doctor_transactions missing a column / not present), the WHOLE function
-- errors and the server function falls back to all-zeros — hiding the expense
-- that is actually there.
--
-- Fix: compute revenue in its own guarded block (defaults to 0 on any error)
-- and compute expenses independently, so the expense total is never lost.

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
  v_gross    NUMERIC := 0;
  v_fees     NUMERIC := 0;
  v_net      NUMERIC := 0;
  v_bookings INT     := 0;
  v_curr     TEXT    := 'EGP';
  v_expenses NUMERIC := 0;
BEGIN
  -- Revenue — guarded so a missing/renamed doctor_transactions never zeroes
  -- out the (independent) expense total below.
  BEGIN
    SELECT
      COALESCE(SUM(gross_amount), 0),
      COALESCE(SUM(platform_fee), 0),
      COALESCE(SUM(net_amount), 0),
      COUNT(*) FILTER (WHERE type = 'consultation'),
      COALESCE(MAX(currency), 'EGP')
    INTO v_gross, v_fees, v_net, v_bookings, v_curr
    FROM public.doctor_transactions
    WHERE doctor_details_id = _doctor_details_id
      AND status = 'completed'
      AND type IN ('consultation', 'adjustment', 'bonus')
      AND created_at >= v_from
      AND created_at <  v_to;
  EXCEPTION WHEN OTHERS THEN
    v_gross := 0; v_fees := 0; v_net := 0; v_bookings := 0; v_curr := 'EGP';
  END;

  -- Expenses — always computed. Tolerates either column-naming convention.
  SELECT COALESCE(SUM(amount), 0)
    INTO v_expenses
    FROM public.doctor_expenses
   WHERE COALESCE(doctor_details_id, doctor_id) = _doctor_details_id
     AND COALESCE(expense_date, spent_at) >= v_from
     AND COALESCE(expense_date, spent_at) <  v_to;

  RETURN QUERY
    SELECT v_gross, v_fees, v_net, v_expenses, v_bookings,
           (v_net - v_expenses)::numeric, v_curr;
END;
$$;

GRANT EXECUTE ON FUNCTION public.doctor_monthly_pnl(UUID, INT, INT) TO authenticated;
