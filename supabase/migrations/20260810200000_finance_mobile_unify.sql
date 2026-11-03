-- ============================================================================
-- Integrated accounting — Stage 4: unify mobile numbers + safe withdrawal RPC.
--
-- 1) doctor_financial_summary (used by BOTH mobile apps' finance/wallet screens)
--    used to compute consultation revenue from SUM(fee) of PAID appointments —
--    gross, and by a different rule than the web. Rewrite it to read the SAME
--    unified ledger (v_doctor_ledger) so mobile totals match the web exactly.
--    Also add an authorization guard (was missing).
--
-- 2) request_withdrawal — the mobile apps inserted into doctor_withdrawals
--    directly, which RLS blocks (no doctor INSERT policy) → every payout request
--    failed. This SECURITY DEFINER RPC validates against the withdrawable
--    balance + minimum payout, then inserts. Web can use it too.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.doctor_financial_summary(
  p_doctor_id uuid, p_from date DEFAULT NULL, p_to date DEFAULT NULL
) RETURNS TABLE (
  total_patients  bigint,
  consult_revenue numeric,
  other_income    numeric,
  total_expenses  numeric,
  net_profit      numeric
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_consult numeric := 0; v_other numeric := 0; v_exp numeric := 0; v_pat bigint := 0;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.doctor_details dd
    JOIN public.profiles p ON p.id = dd.profile_id
    WHERE dd.id = p_doctor_id AND p.user_id = auth.uid()
  ) AND NOT public.has_role(auth.uid(),'admin') THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  SELECT
    COALESCE(SUM(amount) FILTER (WHERE direction='income' AND category LIKE 'consultation%'), 0),
    COALESCE(SUM(amount) FILTER (WHERE direction='income' AND category LIKE 'other%'), 0),
    COALESCE(SUM(amount) FILTER (WHERE direction='expense'), 0)
  INTO v_consult, v_other, v_exp
  FROM public.v_doctor_ledger
  WHERE doctor_details_id = p_doctor_id
    AND (p_from IS NULL OR entry_date >= p_from)
    AND (p_to   IS NULL OR entry_date <= p_to);

  SELECT COUNT(DISTINCT a.patient_id) INTO v_pat
  FROM public.appointments a
  WHERE a.doctor_id = p_doctor_id AND a.status = 'completed'
    AND (p_from IS NULL OR a.scheduled_at::date >= p_from)
    AND (p_to   IS NULL OR a.scheduled_at::date <= p_to);

  RETURN QUERY SELECT v_pat, v_consult, v_other, v_exp,
                      (v_consult + v_other - v_exp)::numeric;
END; $$;

GRANT EXECUTE ON FUNCTION public.doctor_financial_summary(uuid, date, date) TO authenticated;

-- Safe payout request — validates balance + minimum, then inserts.
CREATE OR REPLACE FUNCTION public.request_withdrawal(
  p_amount numeric, p_method text DEFAULT 'manual', p_note text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_doctor uuid; v_withdrawable numeric; v_min numeric; v_id uuid;
BEGIN
  SELECT dd.id INTO v_doctor
    FROM public.doctor_details dd
    JOIN public.profiles p ON p.id = dd.profile_id
   WHERE p.user_id = auth.uid();
  IF v_doctor IS NULL THEN RAISE EXCEPTION 'not_a_doctor'; END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN RAISE EXCEPTION 'invalid_amount'; END IF;

  SELECT withdrawable INTO v_withdrawable FROM public.doctor_wallet_balance(v_doctor);
  IF p_amount > COALESCE(v_withdrawable, 0) THEN
    RAISE EXCEPTION 'amount_exceeds_balance';
  END IF;

  SELECT COALESCE(minimum_payout, 500) INTO v_min
    FROM public.doctor_billing_settings WHERE doctor_details_id = v_doctor;
  IF p_amount < COALESCE(v_min, 500) THEN
    RAISE EXCEPTION 'below_minimum';
  END IF;

  INSERT INTO public.doctor_withdrawals (doctor_details_id, amount, method, status, doctor_note)
  VALUES (v_doctor, p_amount, COALESCE(NULLIF(p_method,''),'manual'), 'requested', p_note)
  RETURNING id INTO v_id;
  RETURN v_id;
END; $$;

GRANT EXECUTE ON FUNCTION public.request_withdrawal(numeric, text, text) TO authenticated;
