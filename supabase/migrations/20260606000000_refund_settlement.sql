-- =============================================================================
-- Refund settlement: when an appointment's payment_status flips to refunded /
-- partially_refunded, automatically offset the doctor's earnings by inserting
-- a counter-balancing 'refund' transaction.
--
-- Without this, refunds leak doctor balance: the patient gets their money back
-- via Stripe but the doctor's available balance still reflects the old
-- earnings.
-- =============================================================================

-- 1) Add refunded_amount column for tracking partial refunds (in same unit as
-- appointments.fee, i.e. currency major units, not cents).
ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS refunded_amount NUMERIC(10,2) DEFAULT 0 NOT NULL;

COMMENT ON COLUMN public.appointments.refunded_amount IS
  'Cumulative refunded amount in major currency units (e.g. EGP, not piastres). '
  'Set by the Stripe webhook on charge.refunded. 0 when no refund.';


-- 2) Trigger function: on payment_status change to refunded/partially_refunded,
-- insert an offsetting refund tx in doctor_transactions.
CREATE OR REPLACE FUNCTION public.create_transaction_on_appointment_refund()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_doctor_details_id UUID;
  v_consultation_tx   RECORD;
  v_refund_amount     NUMERIC(10,2);
  v_fee_pct           NUMERIC(5,2);
  v_refund_fee        NUMERIC(10,2);
  v_refund_net        NUMERIC(10,2);
  v_proportion        NUMERIC(10,6);
BEGIN
  -- Only act when payment_status transitions INTO a refunded state.
  IF NEW.payment_status NOT IN ('refunded', 'partially_refunded') THEN
    RETURN NEW;
  END IF;

  IF OLD.payment_status = NEW.payment_status THEN
    RETURN NEW;  -- no transition, nothing to do
  END IF;

  v_doctor_details_id := NEW.doctor_id;

  -- Find the original 'consultation' tx (created by the completion trigger).
  SELECT id, gross_amount, platform_fee, net_amount, currency, metadata
    INTO v_consultation_tx
    FROM public.doctor_transactions
    WHERE appointment_id = NEW.id
      AND type = 'consultation'
      AND status = 'completed'
    ORDER BY created_at DESC
    LIMIT 1;

  -- If there's no consultation tx yet, nothing to offset.
  -- (Refunds before completion don't affect balance — appointment never paid out.)
  IF v_consultation_tx.id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Idempotency guard.
  IF EXISTS (
    SELECT 1 FROM public.doctor_transactions
    WHERE appointment_id = NEW.id
      AND type = 'refund'
      AND status = 'completed'
  ) THEN
    RETURN NEW;
  END IF;

  -- Determine refund amount.
  --   Full refund: refund the entire fee.
  --   Partial refund: use refunded_amount column (set by webhook).
  IF NEW.payment_status = 'refunded' THEN
    v_refund_amount := COALESCE(NEW.fee, v_consultation_tx.gross_amount, 0);
  ELSE
    v_refund_amount := GREATEST(COALESCE(NEW.refunded_amount, 0), 0);
  END IF;

  IF v_refund_amount <= 0 THEN
    RETURN NEW;
  END IF;

  -- Cap at original gross.
  v_refund_amount := LEAST(v_refund_amount, v_consultation_tx.gross_amount);

  -- Apply same fee % as original tx so the doctor refunds back exactly the
  -- same proportion of net they originally received.
  IF v_consultation_tx.gross_amount > 0 THEN
    v_proportion := v_refund_amount / v_consultation_tx.gross_amount;
  ELSE
    v_proportion := 0;
  END IF;

  v_refund_fee := ROUND((v_consultation_tx.platform_fee * v_proportion)::numeric, 2);
  v_refund_net := ROUND((v_consultation_tx.net_amount   * v_proportion)::numeric, 2);

  INSERT INTO public.doctor_transactions(
    doctor_details_id, appointment_id, type,
    gross_amount, platform_fee, net_amount, currency, status, description, metadata
  ) VALUES (
    v_doctor_details_id, NEW.id, 'refund',
    -v_refund_amount, -v_refund_fee, -v_refund_net,
    COALESCE(v_consultation_tx.currency, 'EGP'), 'completed',
    format(
      'Auto: %s refund (%s of %s)',
      CASE NEW.payment_status WHEN 'refunded' THEN 'full' ELSE 'partial' END,
      v_refund_amount,
      v_consultation_tx.gross_amount
    ),
    jsonb_build_object(
      'original_tx_id', v_consultation_tx.id,
      'refund_amount', v_refund_amount,
      'proportion', v_proportion,
      'payment_status', NEW.payment_status
    )
  );

  RETURN NEW;
END;
$function$;


-- 3) Wire trigger.
DROP TRIGGER IF EXISTS trg_appt_refund_tx ON public.appointments;

CREATE TRIGGER trg_appt_refund_tx
  AFTER UPDATE OF payment_status, refunded_amount ON public.appointments
  FOR EACH ROW
  EXECUTE FUNCTION public.create_transaction_on_appointment_refund();
