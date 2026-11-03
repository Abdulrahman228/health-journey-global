-- ============================================================================
-- RBAC Phase 2 — step B: lab / radiology 3-party link (patient · lab · doctor).
--
-- The lab is the SOURCE OF TRUTH for payment: the patient may pay in person at
-- the facility, and the platform has no access to that money. So the LAB (not a
-- platform payment gateway) sets payment_status = unpaid | partial | paid, and
-- result visibility follows the lab-set status. Patient consent controls
-- whether the treating doctor may read.
--
-- Authority is gated on OWNING a lab_facilities row (owner_user_id = auth.uid),
-- mirroring pharmacy_chains — so this migration never references the new 'lab'
-- enum value (safe to run right after 20260808200000). Controlled mutations go
-- through SECURITY DEFINER RPCs so each party can only touch its own columns.
-- ============================================================================

-- 1) The registered lab / radiology facility. --------------------------------
CREATE TABLE IF NOT EXISTS public.lab_facilities (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id  uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  profile_id     uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  name           text NOT NULL,
  facility_type  text NOT NULL DEFAULT 'lab' CHECK (facility_type IN ('lab','radiology','both')),
  city           text,
  phone          text,
  address        text,
  is_verified    boolean NOT NULL DEFAULT false,
  is_active      boolean NOT NULL DEFAULT true,
  created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_lab_facilities_owner ON public.lab_facilities(owner_user_id);
CREATE INDEX IF NOT EXISTS idx_lab_facilities_active ON public.lab_facilities(is_active, city);

ALTER TABLE public.lab_facilities ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "lab owner manages facility" ON public.lab_facilities;
CREATE POLICY "lab owner manages facility" ON public.lab_facilities
  FOR ALL USING (owner_user_id = auth.uid()) WITH CHECK (owner_user_id = auth.uid());

DROP POLICY IF EXISTS "active labs readable" ON public.lab_facilities;
CREATE POLICY "active labs readable" ON public.lab_facilities
  FOR SELECT USING (is_active = true OR owner_user_id = auth.uid());

DROP POLICY IF EXISTS "admin full labs" ON public.lab_facilities;
CREATE POLICY "admin full labs" ON public.lab_facilities
  FOR ALL USING (public.has_role(auth.uid(),'admin'))
  WITH CHECK (public.has_role(auth.uid(),'admin'));

-- 2) The order that binds patient · lab · treating doctor. --------------------
CREATE TABLE IF NOT EXISTS public.lab_orders (
  id                            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_profile_id            uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  lab_id                        uuid NOT NULL REFERENCES public.lab_facilities(id) ON DELETE RESTRICT,
  ordering_doctor_profile_id    uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  authorized_doctor_profile_id  uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  test_type       text NOT NULL DEFAULT 'lab_result'
                    CHECK (test_type IN ('lab_result','xray','mri','ct','ecg','other')),
  test_name       text,
  status          text NOT NULL DEFAULT 'requested'
                    CHECK (status IN ('requested','in_progress','delivered','cancelled')),
  -- LAB-controlled. The platform never sets this; the lab reflects reality
  -- (in-person or otherwise): unpaid | partial | paid.
  payment_status  text NOT NULL DEFAULT 'unpaid'
                    CHECK (payment_status IN ('unpaid','partial','paid')),
  patient_authorized boolean NOT NULL DEFAULT false,
  amount          numeric(10,2),
  amount_paid     numeric(10,2) NOT NULL DEFAULT 0,
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_lab_orders_patient ON public.lab_orders(patient_profile_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lab_orders_lab     ON public.lab_orders(lab_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lab_orders_doctor  ON public.lab_orders(authorized_doctor_profile_id) WHERE patient_authorized;

ALTER TABLE public.lab_orders ENABLE ROW LEVEL SECURITY;

-- Reads: patient (own), lab (its orders), authorized doctor (consented), admin.
-- Writes go through the RPCs below (RLS blocks direct INSERT/UPDATE).
DROP POLICY IF EXISTS "patient reads own lab orders" ON public.lab_orders;
CREATE POLICY "patient reads own lab orders" ON public.lab_orders
  FOR SELECT USING (auth.uid() IN (SELECT user_id FROM public.profiles WHERE id = patient_profile_id));

DROP POLICY IF EXISTS "lab reads its orders" ON public.lab_orders;
CREATE POLICY "lab reads its orders" ON public.lab_orders
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM public.lab_facilities lf WHERE lf.id = lab_id AND lf.owner_user_id = auth.uid()));

DROP POLICY IF EXISTS "authorized doctor reads lab order" ON public.lab_orders;
CREATE POLICY "authorized doctor reads lab order" ON public.lab_orders
  FOR SELECT USING (
    patient_authorized = true
    AND auth.uid() IN (SELECT user_id FROM public.profiles WHERE id = authorized_doctor_profile_id));

DROP POLICY IF EXISTS "admin reads lab orders" ON public.lab_orders;
CREATE POLICY "admin reads lab orders" ON public.lab_orders
  FOR SELECT USING (public.has_role(auth.uid(),'admin'));

-- 3) Link result files to the order (reuse medical_attachments). --------------
ALTER TABLE public.medical_attachments
  ADD COLUMN IF NOT EXISTS lab_order_id uuid REFERENCES public.lab_orders(id) ON DELETE SET NULL;

-- appointment_id may predate this migration (added by 20260717100000). If that
-- migration was never run, add it here so this file is self-sufficient and the
-- combined patient-read policy below is always valid.
ALTER TABLE public.medical_attachments
  ADD COLUMN IF NOT EXISTS appointment_id uuid REFERENCES public.appointments(id) ON DELETE SET NULL;

-- Lab delivers a result file to ITS order, for THAT order's patient.
DROP POLICY IF EXISTS "lab delivers result to its order" ON public.medical_attachments;
CREATE POLICY "lab delivers result to its order" ON public.medical_attachments
  FOR INSERT WITH CHECK (
    lab_order_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.lab_orders lo
      JOIN public.lab_facilities lf ON lf.id = lo.lab_id
      WHERE lo.id = medical_attachments.lab_order_id
        AND lf.owner_user_id = auth.uid()
        AND lo.patient_profile_id = medical_attachments.patient_profile_id
    )
  );

-- The lab can read back what it delivered.
DROP POLICY IF EXISTS "lab reads own delivered results" ON public.medical_attachments;
CREATE POLICY "lab reads own delivered results" ON public.medical_attachments
  FOR SELECT USING (
    lab_order_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.lab_orders lo
      JOIN public.lab_facilities lf ON lf.id = lo.lab_id
      WHERE lo.id = medical_attachments.lab_order_id AND lf.owner_user_id = auth.uid()
    )
  );

-- The authorized treating doctor reads the result: consent + lab marked paid.
DROP POLICY IF EXISTS "authorized doctor reads lab result" ON public.medical_attachments;
CREATE POLICY "authorized doctor reads lab result" ON public.medical_attachments
  FOR SELECT USING (
    lab_order_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.lab_orders lo
      WHERE lo.id = medical_attachments.lab_order_id
        AND lo.patient_authorized = true
        AND lo.payment_status = 'paid'
        AND auth.uid() IN (SELECT user_id FROM public.profiles WHERE id = lo.authorized_doctor_profile_id)
    )
  );

-- Patient read: extend the existing gate with a lab_order branch. A patient's
-- OWN uploads (both links NULL) stay visible; appointment- and lab-linked
-- results are hidden until PAID (lab-controlled for lab orders).
DROP POLICY IF EXISTS "patient reads own attachments" ON public.medical_attachments;
CREATE POLICY "patient reads own attachments" ON public.medical_attachments
  FOR SELECT USING (
    auth.uid() IN (SELECT user_id FROM public.profiles WHERE id = patient_profile_id)
    AND (
      (appointment_id IS NULL AND lab_order_id IS NULL)
      OR (appointment_id IS NOT NULL AND EXISTS (
            SELECT 1 FROM public.appointments a
            WHERE a.id = medical_attachments.appointment_id AND a.payment_status = 'paid'))
      OR (lab_order_id IS NOT NULL AND EXISTS (
            SELECT 1 FROM public.lab_orders lo
            WHERE lo.id = medical_attachments.lab_order_id AND lo.payment_status = 'paid'))
    )
  );

-- Storage: the lab may upload a result file INTO the order's patient folder
-- (path convention {patient_profile_id}/...). Reads are served by a server
-- function that signs URLs after enforcing the payment/consent gate, so no
-- extra storage READ policy is needed here.
DROP POLICY IF EXISTS "lab_upload_order_attachment" ON storage.objects;
CREATE POLICY "lab_upload_order_attachment" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'medical-attachments'
    AND EXISTS (
      SELECT 1 FROM public.lab_orders lo
      JOIN public.lab_facilities lf ON lf.id = lo.lab_id
      WHERE lf.owner_user_id = auth.uid()
        AND lo.patient_profile_id::text = (storage.foldername(name))[1]
    )
  );

-- 4) Controlled mutations (SECURITY DEFINER — each party, its own columns). ---

-- Patient creates a lab order (optionally authorizing a treating doctor).
CREATE OR REPLACE FUNCTION public.create_lab_order(
  p_lab_id uuid,
  p_test_type text DEFAULT 'lab_result',
  p_test_name text DEFAULT NULL,
  p_authorized_doctor_profile_id uuid DEFAULT NULL,
  p_amount numeric DEFAULT NULL,
  p_notes text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_patient uuid; v_order uuid;
BEGIN
  SELECT id INTO v_patient FROM public.profiles WHERE user_id = auth.uid() LIMIT 1;
  IF v_patient IS NULL THEN RAISE EXCEPTION 'No profile for current user'; END IF;
  INSERT INTO public.lab_orders(
    patient_profile_id, lab_id, test_type, test_name,
    authorized_doctor_profile_id, patient_authorized, amount, notes)
  VALUES (
    v_patient, p_lab_id, p_test_type, p_test_name,
    p_authorized_doctor_profile_id, p_authorized_doctor_profile_id IS NOT NULL, p_amount, p_notes)
  RETURNING id INTO v_order;
  RETURN v_order;
END; $$;

-- Patient grants/revokes the treating doctor's read consent.
CREATE OR REPLACE FUNCTION public.set_lab_order_authorization(
  p_order_id uuid,
  p_authorized_doctor_profile_id uuid,
  p_authorized boolean
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  UPDATE public.lab_orders lo
     SET authorized_doctor_profile_id =
           CASE WHEN p_authorized THEN p_authorized_doctor_profile_id ELSE NULL END,
         patient_authorized = p_authorized,
         updated_at = now()
   WHERE lo.id = p_order_id
     AND auth.uid() IN (SELECT user_id FROM public.profiles WHERE id = lo.patient_profile_id);
  IF NOT FOUND THEN RAISE EXCEPTION 'Order not found or not yours'; END IF;
END; $$;

-- LAB controls payment + status (the platform never touches lab money).
CREATE OR REPLACE FUNCTION public.lab_update_order(
  p_order_id uuid,
  p_status text DEFAULT NULL,
  p_payment_status text DEFAULT NULL,
  p_amount_paid numeric DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  IF p_status IS NOT NULL AND p_status NOT IN ('requested','in_progress','delivered','cancelled') THEN
    RAISE EXCEPTION 'Invalid status %', p_status;
  END IF;
  IF p_payment_status IS NOT NULL AND p_payment_status NOT IN ('unpaid','partial','paid') THEN
    RAISE EXCEPTION 'Invalid payment_status %', p_payment_status;
  END IF;
  UPDATE public.lab_orders lo
     SET status         = COALESCE(p_status, lo.status),
         payment_status = COALESCE(p_payment_status, lo.payment_status),
         amount_paid    = COALESCE(p_amount_paid, lo.amount_paid),
         updated_at     = now()
   WHERE lo.id = p_order_id
     AND EXISTS (SELECT 1 FROM public.lab_facilities lf
                 WHERE lf.id = lo.lab_id AND lf.owner_user_id = auth.uid());
  IF NOT FOUND THEN RAISE EXCEPTION 'You are not the lab for this order'; END IF;
END; $$;

GRANT EXECUTE ON FUNCTION public.create_lab_order(uuid,text,text,uuid,numeric,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_lab_order_authorization(uuid,uuid,boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.lab_update_order(uuid,text,text,numeric) TO authenticated;

-- keep updated_at fresh on direct/admin updates
DROP TRIGGER IF EXISTS lab_orders_updated_at ON public.lab_orders;
CREATE TRIGGER lab_orders_updated_at BEFORE UPDATE ON public.lab_orders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
