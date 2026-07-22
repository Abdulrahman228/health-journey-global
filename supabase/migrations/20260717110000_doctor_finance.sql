-- ============================================================================
-- Doctor finance tree (Points 8 + 9): expenses, other income, PIN lock, summary.
-- Additive & safe — new tables/column/function; the existing wallet keeps working
-- and is enriched by these.
-- ============================================================================

-- 1) Expenses (deducted from net profit)
CREATE TABLE IF NOT EXISTS public.doctor_expenses (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id  uuid NOT NULL REFERENCES public.doctor_details(id) ON DELETE CASCADE,
  category   text NOT NULL DEFAULT 'other',
  amount     numeric NOT NULL CHECK (amount >= 0),
  note       text,
  spent_at   date NOT NULL DEFAULT current_date,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_doctor_expenses ON public.doctor_expenses(doctor_id, spent_at DESC);

-- 2) Other income (rent, supplies sale, …)
CREATE TABLE IF NOT EXISTS public.doctor_other_income (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id   uuid NOT NULL REFERENCES public.doctor_details(id) ON DELETE CASCADE,
  source_type text NOT NULL DEFAULT 'other',
  amount      numeric NOT NULL CHECK (amount >= 0),
  note        text,
  received_at date NOT NULL DEFAULT current_date,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_doctor_other_income ON public.doctor_other_income(doctor_id, received_at DESC);

-- 3) Finance PIN lock (Point 8) — hash stored on doctor_details.
ALTER TABLE public.doctor_details
  ADD COLUMN IF NOT EXISTS finance_pin_hash text;

-- RLS: a doctor manages ONLY their own finance rows.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['doctor_expenses','doctor_other_income'] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY;', t);
    EXECUTE format('DROP POLICY IF EXISTS "doctor manages own finance %1$s" ON public.%1$I;', t);
    EXECUTE format($p$
      CREATE POLICY "doctor manages own finance %1$s" ON public.%1$I
        FOR ALL
        USING (auth.uid() IN (
          SELECT p.user_id FROM public.doctor_details dd
          JOIN public.profiles p ON p.id = dd.profile_id
          WHERE dd.id = %1$I.doctor_id))
        WITH CHECK (auth.uid() IN (
          SELECT p.user_id FROM public.doctor_details dd
          JOIN public.profiles p ON p.id = dd.profile_id
          WHERE dd.id = %1$I.doctor_id));
    $p$, t);
  END LOOP;
END $$;

-- 4) Financial summary (Point 9). Consult revenue comes from PAID appointments.
CREATE OR REPLACE FUNCTION public.doctor_financial_summary(
  p_doctor_id uuid,
  p_from date DEFAULT NULL,
  p_to   date DEFAULT NULL
)
RETURNS TABLE (
  total_patients   bigint,
  consult_revenue  numeric,
  other_income     numeric,
  total_expenses   numeric,
  net_profit       numeric
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  WITH appts AS (
    SELECT * FROM public.appointments a
    WHERE a.doctor_id = p_doctor_id
      AND (p_from IS NULL OR a.appointment_date >= p_from)
      AND (p_to   IS NULL OR a.appointment_date <= p_to)
  ),
  rev AS (
    SELECT COALESCE(SUM(fee), 0) AS consult, COUNT(DISTINCT patient_id) AS patients
    FROM appts WHERE payment_status = 'paid'
  ),
  oi AS (
    SELECT COALESCE(SUM(amount), 0) AS amt FROM public.doctor_other_income
    WHERE doctor_id = p_doctor_id
      AND (p_from IS NULL OR received_at >= p_from)
      AND (p_to   IS NULL OR received_at <= p_to)
  ),
  ex AS (
    SELECT COALESCE(SUM(amount), 0) AS amt FROM public.doctor_expenses
    WHERE doctor_id = p_doctor_id
      AND (p_from IS NULL OR spent_at >= p_from)
      AND (p_to   IS NULL OR spent_at <= p_to)
  )
  SELECT
    (SELECT patients FROM rev),
    (SELECT consult FROM rev),
    (SELECT amt FROM oi),
    (SELECT amt FROM ex),
    (SELECT consult FROM rev) + (SELECT amt FROM oi) - (SELECT amt FROM ex);
$$;

GRANT EXECUTE ON FUNCTION public.doctor_financial_summary(uuid, date, date) TO authenticated;

-- 5) Finance PIN: hashed server-side (bcrypt) so the app never handles crypto.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION public.set_finance_pin(p_doctor_id uuid, p_pin text)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF auth.uid() NOT IN (
    SELECT p.user_id FROM public.doctor_details dd
    JOIN public.profiles p ON p.id = dd.profile_id WHERE dd.id = p_doctor_id
  ) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  UPDATE public.doctor_details
  SET finance_pin_hash = crypt(p_pin, gen_salt('bf'))
  WHERE id = p_doctor_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.verify_finance_pin(p_doctor_id uuid, p_pin text)
RETURNS boolean
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$
  SELECT finance_pin_hash IS NOT NULL
     AND finance_pin_hash = crypt(p_pin, finance_pin_hash)
  FROM public.doctor_details WHERE id = p_doctor_id;
$$;

CREATE OR REPLACE FUNCTION public.has_finance_pin(p_doctor_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT finance_pin_hash IS NOT NULL FROM public.doctor_details WHERE id = p_doctor_id;
$$;

GRANT EXECUTE ON FUNCTION public.set_finance_pin(uuid, text)    TO authenticated;
GRANT EXECUTE ON FUNCTION public.verify_finance_pin(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_finance_pin(uuid)          TO authenticated;

-- 6) Shift close (Point 11 "تقفيل الشيت"): a dated cash-drawer reconciliation.
-- (Payout requests reuse the existing public.doctor_withdrawals table.)
CREATE TABLE IF NOT EXISTS public.doctor_shift_closures (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doctor_id     uuid NOT NULL REFERENCES public.doctor_details(id) ON DELETE CASCADE,
  closed_for    date NOT NULL DEFAULT current_date,
  expected_cash numeric NOT NULL DEFAULT 0,
  counted_cash  numeric NOT NULL DEFAULT 0,
  difference    numeric GENERATED ALWAYS AS (counted_cash - expected_cash) STORED,
  note          text,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_doctor_shift_closures ON public.doctor_shift_closures(doctor_id, closed_for DESC);

ALTER TABLE public.doctor_shift_closures ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "doctor manages own shift closures" ON public.doctor_shift_closures;
CREATE POLICY "doctor manages own shift closures" ON public.doctor_shift_closures
  FOR ALL
  USING (auth.uid() IN (
    SELECT p.user_id FROM public.doctor_details dd
    JOIN public.profiles p ON p.id = dd.profile_id
    WHERE dd.id = doctor_shift_closures.doctor_id))
  WITH CHECK (auth.uid() IN (
    SELECT p.user_id FROM public.doctor_details dd
    JOIN public.profiles p ON p.id = dd.profile_id
    WHERE dd.id = doctor_shift_closures.doctor_id));
