-- Reconcile the two `doctor_expenses` schemas.
--
-- Two features independently created a table named `doctor_expenses`:
--   • Web (phase 5): doctor_details_id, expense_date, currency, vendor,
--     description, receipt_url, created_by  → read by doctor_monthly_pnl()
--   • Mobile (finance): doctor_id, spent_at, note                → read by
--     doctor_financial_summary() + the finance-PIN screens.
--
-- Because both used CREATE TABLE IF NOT EXISTS, only the first to run "won", and
-- after the finance table was rebuilt the table no longer had the columns the
-- web code writes — so adding an expense on the web silently failed.
--
-- Fix: make the table a SUPERSET of both, and keep the paired columns in sync
-- with a trigger (doctor_id↔doctor_details_id, spent_at↔expense_date,
-- note↔description). Both apps then work unchanged and share one expense ledger.

-- 1) Add the web (phase-5) columns the current table is missing. -------------
ALTER TABLE public.doctor_expenses
  ADD COLUMN IF NOT EXISTS doctor_details_id uuid REFERENCES public.doctor_details(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS expense_date      date,
  ADD COLUMN IF NOT EXISTS currency          text NOT NULL DEFAULT 'EGP',
  ADD COLUMN IF NOT EXISTS vendor            text,
  ADD COLUMN IF NOT EXISTS description        text,
  ADD COLUMN IF NOT EXISTS receipt_url       text,
  ADD COLUMN IF NOT EXISTS created_by        uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS updated_at        timestamptz NOT NULL DEFAULT now();

-- The date is now driven by the sync trigger (below), not a column default,
-- so a back-dated web expense keeps its date on the mobile side too.
ALTER TABLE public.doctor_expenses ALTER COLUMN spent_at DROP DEFAULT;

-- 2) Keep the paired columns in sync on every write. -------------------------
CREATE OR REPLACE FUNCTION public._sync_doctor_expense_cols()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Doctor id: two names for the same doctor_details.id.
  NEW.doctor_details_id := COALESCE(NEW.doctor_details_id, NEW.doctor_id);
  NEW.doctor_id         := COALESCE(NEW.doctor_id, NEW.doctor_details_id);

  -- Date: prefer whichever side supplied it, else today.
  IF NEW.expense_date IS NULL AND NEW.spent_at IS NULL THEN
    NEW.expense_date := current_date;
    NEW.spent_at     := current_date;
  ELSE
    NEW.expense_date := COALESCE(NEW.expense_date, NEW.spent_at);
    NEW.spent_at     := COALESCE(NEW.spent_at, NEW.expense_date);
  END IF;

  -- Free-text note is called `description` on the web, `note` on mobile.
  NEW.description := COALESCE(NEW.description, NEW.note);
  NEW.note        := COALESCE(NEW.note, NEW.description);

  NEW.updated_at  := now();
  RETURN NEW;
END$$;

DROP TRIGGER IF EXISTS trg_sync_doctor_expense_cols ON public.doctor_expenses;
CREATE TRIGGER trg_sync_doctor_expense_cols
  BEFORE INSERT OR UPDATE ON public.doctor_expenses
  FOR EACH ROW EXECUTE FUNCTION public._sync_doctor_expense_cols();

-- 3) Backfill existing (finance-entered) rows so the web sees them too. ------
UPDATE public.doctor_expenses SET
  doctor_details_id = COALESCE(doctor_details_id, doctor_id),
  expense_date      = COALESCE(expense_date, spent_at),
  description       = COALESCE(description, note)
WHERE doctor_details_id IS NULL OR expense_date IS NULL;

CREATE INDEX IF NOT EXISTS idx_doctor_expenses_details
  ON public.doctor_expenses(doctor_details_id, expense_date DESC);

-- 4) Harden doctor_monthly_pnl against either date column being the source. ---
-- (expense_date is now always populated by the trigger, but COALESCE keeps it
--  correct even for any legacy row the backfill missed.)
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
    WHERE COALESCE(doctor_details_id, doctor_id) = _doctor_details_id
      AND COALESCE(expense_date, spent_at) >= v_from
      AND COALESCE(expense_date, spent_at) <  v_to
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
