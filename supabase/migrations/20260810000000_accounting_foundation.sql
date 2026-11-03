-- ============================================================================
-- Integrated clinic accounting — Stage 1: unified ledger + correct rollups.
--
-- Problem (confirmed): income was FRAGMENTED across doctor_transactions
-- (consultations) and doctor_other_income (everything else), and
-- doctor_monthly_pnl only summed the first — so totals were wrong and the
-- different income types were never added together. There was also no single
-- "chart of accounts" any transaction posts to.
--
-- Fix: ONE ledger view that every financial event flows into, each tagged to an
-- account category; a consolidated report RPC that rolls income + expenses up
-- correctly (all types summed); a single corrected doctor_monthly_pnl; and a
-- clean, separate wallet-balance RPC (platform-held, withdrawable money — a
-- different concept from clinic profit). Additive & read-only over existing
-- tables — nothing a doctor already entered is changed.
-- ============================================================================

-- 1) Unified ledger — the chart-of-accounts view. security_invoker so each
--    underlying table's RLS still scopes a doctor to their own rows.
CREATE OR REPLACE VIEW public.v_doctor_ledger
WITH (security_invoker = true) AS
  -- Consultation income (doctor's NET share; in-person vs online split)
  SELECT dt.doctor_details_id,
         dt.created_at::date                                   AS entry_date,
         'income'::text                                        AS direction,
         CASE WHEN COALESCE(dt.metadata->>'appointment_type','in_person') = 'in_person'
              THEN 'consultation_clinic' ELSE 'consultation_online' END AS category,
         dt.net_amount                                         AS amount,
         COALESCE(dt.currency,'EGP')                           AS currency,
         COALESCE(dt.description,'')                           AS description,
         'doctor_transactions'::text                           AS source,
         dt.id                                                 AS source_id
  FROM public.doctor_transactions dt
  WHERE dt.status = 'completed' AND dt.type IN ('consultation','adjustment','bonus')

  UNION ALL
  -- Other income (rent from a colleague, procedures, etc.)
  SELECT oi.doctor_id, oi.received_at, 'income',
         'other_' || COALESCE(oi.source_type,'other'), oi.amount,
         'EGP', COALESCE(oi.note,''), 'doctor_other_income', oi.id
  FROM public.doctor_other_income oi

  UNION ALL
  -- Expenses (tolerates web/mobile column conventions)
  SELECT COALESCE(e.doctor_details_id, e.doctor_id),
         COALESCE(e.expense_date, e.spent_at),
         'expense', COALESCE(e.category,'other'), e.amount,
         COALESCE(e.currency,'EGP'), COALESCE(e.description, e.note, ''),
         'doctor_expenses', e.id
  FROM public.doctor_expenses e

  UNION ALL
  -- Withdrawals / drawings (not P&L; shown for the wallet + full ledger)
  SELECT w.doctor_details_id, w.created_at::date, 'withdrawal',
         'withdrawal', w.amount, COALESCE(w.currency,'EGP'),
         COALESCE(w.method,''), 'doctor_withdrawals', w.id
  FROM public.doctor_withdrawals w
  WHERE w.status NOT IN ('rejected','cancelled');

GRANT SELECT ON public.v_doctor_ledger TO authenticated;

-- 2) Consolidated monthly report — income & expenses broken down by category,
--    ALL income types summed. The UI groups rows and computes totals.
CREATE OR REPLACE FUNCTION public.doctor_financial_report(
  _doctor_details_id uuid, _year int, _month int
) RETURNS TABLE (direction text, category text, amount numeric)
LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public AS $$
DECLARE
  v_from date := make_date(_year, _month, 1);
  v_to   date := (make_date(_year, _month, 1) + INTERVAL '1 month')::date;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.doctor_details dd
    JOIN public.profiles p ON p.id = dd.profile_id
    WHERE dd.id = _doctor_details_id AND p.user_id = auth.uid()
  ) AND NOT public.has_role(auth.uid(),'admin') THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  RETURN QUERY
    SELECT l.direction, l.category, SUM(l.amount)::numeric
    FROM public.v_doctor_ledger l
    WHERE l.doctor_details_id = _doctor_details_id
      AND l.entry_date >= v_from AND l.entry_date < v_to
      AND l.direction IN ('income','expense')
    GROUP BY l.direction, l.category
    ORDER BY l.direction, l.category;
END; $$;

GRANT EXECUTE ON FUNCTION public.doctor_financial_report(uuid,int,int) TO authenticated;

-- 3) Single corrected P&L — now INCLUDES other income (was the bug).
CREATE OR REPLACE FUNCTION public.doctor_monthly_pnl(
  _doctor_details_id UUID, _year INT, _month INT
) RETURNS TABLE (
  gross_revenue NUMERIC, platform_fees NUMERIC, net_revenue NUMERIC,
  total_expenses NUMERIC, bookings_count INT, net_profit NUMERIC, currency TEXT
)
LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public AS $$
DECLARE
  v_from DATE := make_date(_year, _month, 1);
  v_to   DATE := (make_date(_year, _month, 1) + INTERVAL '1 month')::date;
  v_c_gross NUMERIC := 0; v_c_fees NUMERIC := 0; v_c_net NUMERIC := 0; v_bk INT := 0;
  v_other NUMERIC := 0; v_exp NUMERIC := 0; v_curr TEXT := 'EGP';
BEGIN
  -- Consultation revenue (guarded so a hiccup never zeroes expenses)
  BEGIN
    SELECT COALESCE(SUM(gross_amount),0), COALESCE(SUM(platform_fee),0),
           COALESCE(SUM(net_amount),0), COUNT(*) FILTER (WHERE type='consultation'),
           COALESCE(MAX(currency),'EGP')
      INTO v_c_gross, v_c_fees, v_c_net, v_bk, v_curr
      FROM public.doctor_transactions
     WHERE doctor_details_id = _doctor_details_id AND status = 'completed'
       AND type IN ('consultation','adjustment','bonus')
       AND created_at >= v_from AND created_at < v_to;
  EXCEPTION WHEN OTHERS THEN
    v_c_gross := 0; v_c_fees := 0; v_c_net := 0; v_bk := 0; v_curr := 'EGP';
  END;

  -- Other income — the piece that used to be dropped.
  BEGIN
    SELECT COALESCE(SUM(amount),0) INTO v_other
      FROM public.doctor_other_income
     WHERE doctor_id = _doctor_details_id
       AND received_at >= v_from AND received_at < v_to;
  EXCEPTION WHEN OTHERS THEN v_other := 0; END;

  -- Expenses — always computed; tolerates either column convention.
  SELECT COALESCE(SUM(amount),0) INTO v_exp
    FROM public.doctor_expenses
   WHERE COALESCE(doctor_details_id, doctor_id) = _doctor_details_id
     AND COALESCE(expense_date, spent_at) >= v_from
     AND COALESCE(expense_date, spent_at) <  v_to;

  RETURN QUERY SELECT
    (v_c_gross + v_other)::numeric,           -- gross revenue incl. other income
    v_c_fees::numeric,                        -- platform commission
    (v_c_net + v_other)::numeric,             -- net revenue incl. other income
    v_exp::numeric,                           -- total expenses
    v_bk,                                     -- bookings
    (v_c_net + v_other - v_exp)::numeric,     -- net profit
    v_curr;
END; $$;

GRANT EXECUTE ON FUNCTION public.doctor_monthly_pnl(UUID, INT, INT) TO authenticated;

-- 4) Wallet balance — platform-HELD, withdrawable money (only ONLINE net that
--    the platform collected), minus paid-out and reserved-pending withdrawals.
--    Distinct from clinic profit; this is what "طلب سحب" can draw against.
CREATE OR REPLACE FUNCTION public.doctor_wallet_balance(_doctor_details_id uuid)
RETURNS TABLE (
  withdrawable numeric, online_net_earned numeric,
  total_paid_out numeric, pending_out numeric, currency text
)
LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public AS $$
DECLARE v_online numeric := 0; v_paid numeric := 0; v_pending numeric := 0;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.doctor_details dd
    JOIN public.profiles p ON p.id = dd.profile_id
    WHERE dd.id = _doctor_details_id AND p.user_id = auth.uid()
  ) AND NOT public.has_role(auth.uid(),'admin') THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  SELECT COALESCE(SUM(net_amount),0) INTO v_online
    FROM public.doctor_transactions
   WHERE doctor_details_id = _doctor_details_id AND status = 'completed'
     AND type IN ('consultation','adjustment','bonus')
     AND COALESCE(metadata->>'appointment_type','in_person') <> 'in_person';

  SELECT COALESCE(SUM(amount),0) INTO v_paid
    FROM public.doctor_withdrawals
   WHERE doctor_details_id = _doctor_details_id AND status = 'paid';

  SELECT COALESCE(SUM(amount),0) INTO v_pending
    FROM public.doctor_withdrawals
   WHERE doctor_details_id = _doctor_details_id
     AND status IN ('requested','approved','processing');

  RETURN QUERY SELECT
    GREATEST(v_online - v_paid - v_pending, 0)::numeric,
    v_online::numeric, v_paid::numeric, v_pending::numeric, 'EGP'::text;
END; $$;

GRANT EXECUTE ON FUNCTION public.doctor_wallet_balance(uuid) TO authenticated;
