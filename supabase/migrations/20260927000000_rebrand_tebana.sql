-- ============================================================================
-- Rebrand: طبيبي / Tabibi  →  طبانا / Tebana
--
-- The company is registered as "طبانا للخدمات الإلكترونية" (Tebana for
-- Electronic Services). This migration only rewrites USER-VISIBLE text that
-- lives in the database. Nothing structural changes: no table / column / RPC /
-- bucket / enum names, and the domain (mytabibi.com, dr-{name}.mytabibi.com)
-- stays as it is.
--
-- Idempotent: the function is CREATE OR REPLACE; every UPDATE only matches
-- rows that still carry the old token, so re-running is a no-op.
-- ============================================================================


-- ----------------------------------------------------------------------------
-- 1) Auto-invoice trigger function (from 20260808300000_auto_invoice.sql).
--
--    Body is byte-for-byte the same except the two receipt literals:
--      seller_name : 'طبيبي Tabibi'            → 'طبانا للخدمات الإلكترونية'
--      description : 'كشف طبي عبر منصة طبيبي'  → 'كشف طبي عبر منصة طبانا'
--
--    CREATE OR REPLACE keeps the function OID, so the existing trigger
--    trg_invoice_on_appointment_paid keeps firing it and is not re-created.
--    Historical public.invoices rows are intentionally NOT rewritten: a receipt
--    is a financial record and must keep the seller name it was issued under.
--    (The one-time backfill in the original migration is not repeated either.)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._invoice_on_appointment_paid()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE
  v_patient_user  uuid;
  v_patient_name  text;
  v_doctor_profile uuid;
BEGIN
  -- Only when transitioning INTO 'paid' (INSERT-as-paid or UPDATE to paid).
  IF NEW.payment_status <> 'paid' OR COALESCE(OLD.payment_status, '') = 'paid' THEN
    RETURN NEW;
  END IF;

  -- No receipt for zero-fee (free) consultations.
  IF COALESCE(NEW.fee, 0) <= 0 THEN
    RETURN NEW;
  END IF;

  -- Idempotent: never issue two invoices for the same appointment.
  IF EXISTS (SELECT 1 FROM public.invoices WHERE appointment_id = NEW.id) THEN
    RETURN NEW;
  END IF;

  SELECT p.user_id, p.full_name
    INTO v_patient_user, v_patient_name
    FROM public.profiles p WHERE p.id = NEW.patient_id;

  SELECT dd.profile_id
    INTO v_doctor_profile
    FROM public.doctor_details dd WHERE dd.id = NEW.doctor_id;

  -- Managed patient (no auth account) → attribute the receipt to the doctor's
  -- user so the row is valid (user_id is NOT NULL) and the doctor still sees it.
  IF v_patient_user IS NULL THEN
    SELECT p.user_id INTO v_patient_user
      FROM public.profiles p WHERE p.id = v_doctor_profile;
  END IF;
  IF v_patient_user IS NULL THEN
    RETURN NEW; -- cannot attribute an owner; skip rather than fail the payment
  END IF;

  INSERT INTO public.invoices (
    user_id, appointment_id, doctor_profile_id,
    amount_cents, net_cents, currency, status, environment,
    description, customer_name, seller_name,
    issued_at, paid_at
  ) VALUES (
    v_patient_user, NEW.id, v_doctor_profile,
    ROUND(COALESCE(NEW.fee, 0) * 100)::int,
    ROUND(COALESCE(NEW.fee, 0) * 100)::int,
    'EGP', 'paid', 'live',
    'كشف طبي عبر منصة طبانا', v_patient_name, 'طبانا للخدمات الإلكترونية',
    now(), now()
  );

  RETURN NEW;
END; $$;


-- ----------------------------------------------------------------------------
-- 2) Articles — public.articles (20260528000000_articles.sql).
--    Text columns are title / excerpt / body_md / author_name; the table has
--    no separate meta columns.
-- ----------------------------------------------------------------------------

-- 2a) Editorial author name, seeded by 20260528000100_demo_seed.sql and
--     20260604020000_more_articles.sql (15 rows).
UPDATE public.articles
   SET author_name = 'فريق طبانا الطبي'
 WHERE author_name = 'فريق طبيبي الطبي';

-- 2b) Grammatical agreement where the brand is the sentence subject
--     (demo_seed article "baby-fever-when-to-worry"):
--       "طبيبي يوفّر استشارات فيديو…"  →  "منصة طبانا توفّر استشارات فيديو…"
--     Runs before the generic pass so the verb is fixed together with the name.
--     (Both the shadda and the plain spelling of يوفّر are covered.)
UPDATE public.articles
   SET body_md = replace(replace(body_md,
                   'طبيبي يوفّر', 'منصة طبانا توفّر'),
                   'طبيبي يوفر',  'منصة طبانا توفر')
 WHERE body_md LIKE '%طبيبي يوف%';

-- 2c) Generic whole-word pass over the remaining brand mentions
--     (e.g. "كل الاستشارات عبر طبيبي مشفّرة" → "… عبر طبانا مشفّرة").
--
--     Arabic pattern (ARE):
--       (^|[^ء-ي])   the char before the word is start-of-text or NOT an
--                    Arabic letter (U+0621..U+064A) — space, punctuation,
--                    newline, digit, Latin …
--       ([بلوف]?)    an optional one-letter clitic prefix ب / ل / و / ف
--                    (بطبيبي → بطبانا, لطبيبي → لطبانا, وطبيبي → وطبانا)
--       طبيبي        the brand token
--       (?![ء-ْ])    not followed by an Arabic letter or tashkeel
--                    (U+0621..U+0652)
--     Because the char before the optional prefix must itself be a boundary,
--     طبيب / الطبيب / طبيبك / طبيبة / طبيبنا / أطباء / الطبيبي are never touched.
--
--     English patterns are case-sensitive whole words (\m … \M), so
--     mytabibi.com and dr-{name}.mytabibi.com are untouched.
--
--     Strings are E'…' literals so the doubled backslashes (\\1 \\2 \\m \\M)
--     reach the regex engine as \1 \2 \m \M. The character classes are written
--     with literal Arabic letters: ء = U+0621, ي = U+064A, ْ (sukun) = U+0652.
DO $rebrand$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      (E'(^|[^ء-ي])([بلوف]?)طبيبي(?![ء-ْ])', E'\\1\\2طبانا'),
      (E'\\mTabibi Health\\M', 'Tebana'),
      (E'\\mTabibi\\M',        'Tebana'),
      (E'\\mTABIBI\\M',        'TEBANA')
    ) AS t(pat, rep)
  LOOP
    UPDATE public.articles
       SET title       = regexp_replace(title,       r.pat, r.rep, 'g'),
           excerpt     = regexp_replace(excerpt,     r.pat, r.rep, 'g'),
           body_md     = regexp_replace(body_md,     r.pat, r.rep, 'g'),
           author_name = regexp_replace(author_name, r.pat, r.rep, 'g')
     WHERE title       ~ r.pat
        OR excerpt     ~ r.pat
        OR body_md     ~ r.pat
        OR author_name ~ r.pat;
  END LOOP;
END
$rebrand$;


-- ----------------------------------------------------------------------------
-- 3) Other seeded text — checked, nothing to change.
--    * public.subscription_plans.features (20260602800000_pricing_update.sql,
--      20260602200000_phase2_tiers_sponsored.sql): the only "tabibi" text is
--      the domain feature "موقع بروفايل خاص dr-{name}.mytabibi.com", which
--      stays (domain unchanged).
--    * public.posts seed (20260604030000_seed_feed_posts.sql): no brand token.
--    * public.specialties catalog: no brand token.
--    * Notification templates — public._notify_on_appointment()
--      (20260717050000_notifications_arabic.sql): no brand token ("طبيب" there
--      means doctor).
--    * public.notifications rows are runtime data with NOT NULL titles; the
--      old default title "طبيبي" only lived in the send-push edge function
--      (fixed there) and existing rows are left as history.
--    Verification notice so the operator can see what remains after apply.
-- ----------------------------------------------------------------------------
DO $verify$
DECLARE
  n_articles int;
  n_plans    int;
BEGIN
  SELECT count(*) INTO n_articles
    FROM public.articles
   WHERE author_name = 'فريق طبيبي الطبي'
      OR title       ~ E'(^|[^ء-ي])[بلوف]?طبيبي(?![ء-ْ])'
      OR excerpt     ~ E'(^|[^ء-ي])[بلوف]?طبيبي(?![ء-ْ])'
      OR body_md     ~ E'(^|[^ء-ي])[بلوف]?طبيبي(?![ء-ْ])'
      OR title       ~ E'\\mTabibi\\M'
      OR body_md     ~ E'\\mTabibi\\M';

  SELECT count(*) INTO n_plans
    FROM public.subscription_plans
   WHERE features::text ~ E'(^|[^ء-ي])[بلوف]?طبيبي(?![ء-ْ])'
      OR features::text ~ E'\\mTabibi\\M';

  RAISE NOTICE 'rebrand_tebana: articles still carrying the old brand token = %', n_articles;
  RAISE NOTICE 'rebrand_tebana: subscription_plans.features still carrying the old brand token = %', n_plans;
END
$verify$;


-- ============================================================================
-- Summary of what this migration touched
--
--   FUNCTION public._invoice_on_appointment_paid()
--     seller_name  'طبيبي Tabibi'           → 'طبانا للخدمات الإلكترونية'
--     description  'كشف طبي عبر منصة طبيبي' → 'كشف طبي عبر منصة طبانا'
--     (trigger trg_invoice_on_appointment_paid unchanged; historical invoices
--      rows unchanged)
--
--   TABLE public.articles (rows matching the old token only)
--     author_name  'فريق طبيبي الطبي' → 'فريق طبانا الطبي'
--     body_md      'طبيبي يوفّر …'     → 'منصة طبانا توفّر …'
--     title / excerpt / body_md / author_name
--                  whole-word طبيبي (+ ب/ل/و/ف prefix) → طبانا
--                  whole-word Tabibi / TABIBI / "Tabibi Health" → Tebana / TEBANA
--
--   Checked and left unchanged
--     subscription_plans.features, posts seed, specialties, notification
--     template function, notifications rows, every domain string
--     (mytabibi.com, dr-{name}.mytabibi.com), all identifiers.
-- ============================================================================
