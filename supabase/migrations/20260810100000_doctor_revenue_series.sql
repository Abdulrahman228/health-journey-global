-- ============================================================================
-- Integrated accounting — Stage 3: monthly series for professional analytics.
-- Per-month bookings + net income + expenses + profit, read from the SAME
-- unified ledger (v_doctor_ledger) so the charts always agree with the report.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.doctor_revenue_series(
  _doctor_details_id uuid, _months int DEFAULT 12
) RETURNS TABLE (
  ym text, bookings int, net_income numeric, expenses numeric, profit numeric
)
LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.doctor_details dd
    JOIN public.profiles p ON p.id = dd.profile_id
    WHERE dd.id = _doctor_details_id AND p.user_id = auth.uid()
  ) AND NOT public.has_role(auth.uid(),'admin') THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  RETURN QUERY
  WITH months AS (
    SELECT to_char(d, 'YYYY-MM') AS ym
    FROM generate_series(
      date_trunc('month', now()) - ((GREATEST(_months,1) - 1) || ' months')::interval,
      date_trunc('month', now()),
      interval '1 month'
    ) d
  ),
  agg AS (
    SELECT to_char(l.entry_date, 'YYYY-MM') AS ym,
           SUM(l.amount) FILTER (WHERE l.direction = 'income')  AS income,
           SUM(l.amount) FILTER (WHERE l.direction = 'expense') AS expense,
           COUNT(*) FILTER (WHERE l.direction = 'income'
                              AND l.category LIKE 'consultation%') AS bk
    FROM public.v_doctor_ledger l
    WHERE l.doctor_details_id = _doctor_details_id
      AND l.direction IN ('income','expense')
    GROUP BY 1
  )
  SELECT m.ym,
         COALESCE(a.bk, 0)::int,
         COALESCE(a.income, 0)::numeric,
         COALESCE(a.expense, 0)::numeric,
         (COALESCE(a.income, 0) - COALESCE(a.expense, 0))::numeric
  FROM months m
  LEFT JOIN agg a ON a.ym = m.ym
  ORDER BY m.ym;
END; $$;

GRANT EXECUTE ON FUNCTION public.doctor_revenue_series(uuid, int) TO authenticated;
