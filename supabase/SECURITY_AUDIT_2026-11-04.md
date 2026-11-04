# Tebana / طبانا — Full review of 2026-11-04: database pen-test + every page/screen on web, Android and iOS

Project: Supabase `wqrrwvaxovrjjiilqkmt` (live). Companion of `SECURITY_AUDIT_2026-11-02.md`.

Method
- Database: read-only catalog review of the live project (`pg_policies`, `pg_proc`, grants,
  triggers, buckets) plus unauthenticated PostgREST probes with the anon key (row counts,
  column lists and RPC reachability only; nothing was written and no data was copied).
- Web: every route under `src/routes` and every server function under `src/lib` was walked
  feature by feature against the live schema (`src/integrations/supabase/types.ts`, generated
  2026-11-03) and the RLS policies. Three parallel review passes: doctor dashboard,
  public + patient pages, admin + lab pages (with a script that cross-checked 2,402 column
  references, 57 RPCs and 36 embeds).
- Android (`C:\lovable\tabibi-android`) and iOS (`C:\lovable\tabibi-ios`): every screen,
  view-model and repository against the same schema and edge-function contracts.

Everything below is fixed in code unless it is listed under "Open".

---

## 1. Database — what was wrong on the live project and the fix

All fixes are in **`supabase/migrations/20261104100000_security_hardening_2.sql`**
(idempotent, one transaction). It is applied by `supabase\apply_2026-11-03.ps1`.

| # | Severity | Finding (live project) | Fix |
|---|---|---|---|
| 1 | **Blocker** | Trigger `on_doctor_created → handle_new_doctor_trial()` updates columns that do not exist (`doctor_active_tier`, `trial_ends_at`). Every INSERT into `doctor_details` fails, so **no new doctor could register** (web, Android, iOS). | §1 trigger + function dropped; the real Gold-trial trigger `trg_new_doctor_gold_trial` stays. |
| 2 | **High** | `preview_visit_pricing()` and `get_due_followup_reminders()` reference `doctor_followup_settings.doctor_id` / `followup_period_days` that do not exist → follow-up pricing always failed (every visit charged as first visit) and the reminder cron errored. | §2 rewritten with the real columns; returns `first_visit` / `follow_up`, checks the caller owns the patient profile (or is a server role). `classify_appointment_visit_type` and `doctor_monthly_pnl` got authorization checks. |
| 3 | **High** | 10 `SECURITY DEFINER` functions were executable by **anonymous** callers with no check inside: `get_outreach_candidates` (phones + claim tokens of seeded doctors), `opt_out_scraped_by_phone`, `_notify` (push a notification with any link to any user), `_user_id_from_profile`, `doctor_monthly_pnl` (any doctor's revenue), `grant_doctor_trial_if_absent`, `record_coupon_redemption`, `classify_appointment_visit_type`, `has_active_subscription`, `has_plan`. | §3 `REVOKE … FROM PUBLIC, anon, authenticated` + `GRANT … TO service_role` for internal/server RPCs; ~37 user-facing RPCs restricted to `authenticated`. |
| 4 | **High** | Policy `imp_insert_authenticated` let any logged-in user insert `sponsored_impressions` rows with any cost (billing bypass of the server rate limit). `coupons_public_select` exposed every active coupon code. | §4 both policies dropped (server functions use the service role). |
| 5 | **Medium** | Anonymous visitors could read `profiles.fcm_token/phone/medical_card`, `doctor_details.license_document_url/verification_notes/national_id_last4` and `scraped_doctors.claim_token` (the key to taking over a seeded listing). | §5 column-level grants: table SELECT revoked from `anon` and re-granted on an explicit allow-list (`src/lib/public-columns.ts` mirrors it on the web). |
| 6 | **High** | Storage bucket `receipts` (bank-transfer screenshots with names/amounts) was **public and listable**. | §6 bucket private; `receipts_owner_read` (owner folder or admin); the web now stores the storage path and serves signed URLs (`ReceiptUploadWidget`, `admin.subscription-requests`). |
| 7 | **Blocker** | `subscriptions` and `payments` had no admin SELECT policy → `/admin/subscriptions`, `/admin/subscription-requests` (manual Gold approvals), `/admin/billing` and the dashboard counters were always empty for admins. | §7c `admin reads subscriptions` / `admin reads payments` (`is_admin(auth.uid())`). |
| 8 | **High** | Zero-arg `is_admin()` (used by every "admin full access" policy) still had the 2026-06 body (`role = 'admin'` only); a super_admin-only account was locked out of every admin table. | §7b `is_admin()` delegates to the uuid overload (admin OR super_admin) and super_admins are mirrored into the `admin` role. Web server functions now accept both roles (`_authz.ts`, `credentials`, `support`, `error-logs`, `reviews`, `accounting`, `labs`). |
| 9 | **High** | `scraped_doctors.opted_out_reason` missing (migration 20260722 never applied) → the seeded-directory admin list 400'd and a doctor's opt-out from `/claim` was silently **not persisted** (listing stayed public while the UI said "declined"). | §7a column added; `claim.functions.ts` now throws on update error. |
| 10 | **Medium** | `user_roles_insert_own` only allowed `patient`/`doctor`, so lab and pharmacy registration never assigned their role (error ignored) and the facility menus never appeared. | §7d policy allows self-assignment of `lab`/`pharmacy` (these roles grant nothing by RLS; facility access is ownership-based). Client upserts check the error and use `ignoreDuplicates`. |
| 11 | **Medium** | Appointment notification triggers were disabled on live; `quick-responder` edge function is stale. | Open — see §5. |

Verification after apply: `supabase\apply_2026-11-03.ps1` prints each step; then
`npx supabase gen types` (or MCP) to refresh `types.ts` and drop the two `as never` casts
(`claim.functions.ts`, `seed.functions.ts` typing).

---

## 2. Web — findings and fixes by area

### 2.1 Doctor dashboard (`/dashboard/*`)
- Identity bug across 6 server-function modules: they filtered `doctor_details.profile_id = auth user id`, but `profiles.id` is a random uuid, so telemedicine, solo page, feedback, consultations, masked calls and attachments never matched a real doctor. New `src/lib/_identity.ts` (`getProfileIdForUser`, `getDoctorForUser`, `userOwnsDoctorDetails`, `isDoctorLinkedToPatient`) is used everywhere.
- `createMedicalRecord` had no check that the doctor is linked to the patient; `getPatientMedicalProfile` same. Now one EMR rule: appointment, managed link, prior record or shared-care consent.
- Wallet balance used the wrong rollup; now `doctor_wallet_balance` RPC. Appointments page: patient name shown, upcoming/history sections, `complete_visit` RPC, link to the waiting room. Visit form: `appointmentId` param completes the queue entry; prescription failures surfaced instead of swallowed. Emergency shift used the wrong day window and statuses.
- Analytics city join, receipt upload (storage path, not public URL), invite errors mapped to Arabic.

### 2.2 Public + patient pages
- Footer linked to pages that do not exist (`/online`, `/records`, `/doctor-dashboard`).
- Feed author link used `profiles.id` for `/doctor/$id` (expects `doctor_details.id`) → 404 on every author; now the feed exposes `author_doctor_id`.
- Receipt page labelled every payment "Stripe"; now Paymob / manual transfer by `payment_method`.
- `/appointments`: raw English status codes → Arabic labels; **Pay** button for unpaid bookings (`/pay?amount&ref`), **My turn** link to the live queue, cancel goes through `cancel_appointment` with a confirmation, complete through `complete_visit`.
- Booking card: online consultations now use `online_consultation_fee`; a validated coupon was never applied to the booking → new `applyCoupon` server function stamps it (ownership-checked) and `/pay` gets the discounted amount; login button keeps the booking page as redirect; the "pay manually" link without a reference (money with nothing to match) removed.
- Consultation acceptance created a Stripe checkout (dormant gateway) → now creates the appointment (`unpaid`, online) and sends the patient to `/pay` with the reference; `checkout/return` accepts `cr`.
- `/feed/post/$id` rendered a blank page when the post is gone; `/nearby` passed a specialty slug to an RPC that compares names; `/doctors` specialty filter is Arabic-normalized; patients can post questions / missing-drug reports (RLS already allowed it, the page blocked them).
- Lab results page linked to raw storage paths in a private bucket → signed URLs via `listAttachments`.
- `/contact` was a "coming soon" stub → support e-mail + in-app ticket form (`fileSupportTicket`).
- OAuth callback always landed on `/dashboard` (patients hit the doctor guard) → lands by role; `/signup?role=doctor` pre-selects the role.
- `doctor.$id` tolerated a NULL `profile_id`.

### 2.3 Admin + lab
- `/admin/documents` always failed: the query embedded `profiles.email`, a column that does not exist.
- `/admin/articles` could never unpublish ("save as draft" kept `is_published = true`).
- `/admin/doctors` inline verify bypassed the audited `adminVerifyDoctor` (no audit row, no reviewer, no telemedicine sync) → now calls it.
- `/admin/billing` refund modal claimed money would be refunded via Paymob while only the row was marked → wording fixed (Stripe refunds still real).
- Support tickets sorted `urgent > normal > high` (text sort) → ranked in code.
- `/admin/patients`, `/admin/subscriptions`, `/admin/subscription-requests` showed an infinite spinner to non-admins.
- `/admin/onboarding` added to the admin nav.
- `lab.register`, `lab.dashboard`, `lab-orders`, `doctor.lab-results`, `pharmacy.register`, `pharmacy.dashboard` threw `redirect()` during render (TanStack only honours it in loaders) → the root error page instead of `/login`; now an effect-based navigation.

---

## 3. Android (`tabibi-android`) — see `C:\lovable\tabibi-release-artifacts\ANDROID-FIXES-2026-11-04.md`
Headline findings: saved addresses and emergency contact queried a non-existent `user_id` column (feature dead); doctor documents used `doc_type`/`created_at` instead of `document_type`/`uploaded_at`; every single-row RPC (`book_slot_appointment`, `start_visit`, `complete_visit`, `check_in_appointment`, `advance_queue`) was decoded as a list → "failed" after the DB had already committed; `preview_visit_pricing` called with the wrong signature; non-nullable Kotlin fields over nullable columns crashed whole lists; mock/fabricated data shown to real users (doctors, fees 300/rating 4.5, appointments, dashboard, wallet 70/30 split, patient phones built from UUID digits, ages hashed from names, a fake patient card in telemedicine, hard-coded profile stats); UTC times shown as local; `tabibi://patient/{id}` QR had no route; feed actions were local-only; the prescription screen never saved.

## 4. iOS (`tabibi-ios`) — see `C:\lovable\tabibi-release-artifacts\IOS-FIXES-2026-11-04.md`
Headline findings: four classes of compile errors (`signUp` user non-optional, LiveKit `connect(url:token:)`, `.topBarTrailing` is iOS 17+, `.foregroundStyle(.tabibiPrimary)` needs a `ShapeStyle` extension); the same `patient_addresses`/`emergency_contacts`/`doctor_documents` column bugs as Android; `doctor_expenses` insert missing `spent_at` (NOT NULL) → adding an expense always failed; `livekit-token` called with snake_case keys; bookings inserted with `payment_status = "pending"` so pay/receipt buttons never appeared; the correct queue-based `BookingSection` existed but was never mounted; status spelled `canceled` vs DB `cancelled`; nullable-column decode failures. iOS cannot be compiled on this machine: validate with `.github/workflows/ios.yml` or Xcode.

---

## 5. Open items (need the owner)
1. Run `supabase\apply_2026-11-03.ps1` (migrations + edge functions + secrets) and `deploy_web.ps1`; then regenerate `types.ts`.
2. WhatsApp Cloud API / Twilio / Paymob accounts + the Send-SMS auth hook (documented in `MESSAGING_AI_PAYMENTS_2026-11-03.md`).
3. Appointment notification triggers are disabled on live; `quick-responder` edge function is stale — decide whether to re-enable/redeploy or delete.
4. Support e-mail in `src/lib/seo.ts` is still `support@tabibi.health` (rebrand decision pending).
5. Web `apple-app-site-association` is not served, so iOS universal links do not work yet (the `tabibi://` scheme does).
6. Android v1.1.1 AAB → Play Console; iOS → CI/TestFlight.
