# Tebana / طبيبي — Security audit of the live Supabase project (2026-11-02)

Project: `wqrrwvaxovrjjiilqkmt` (live). Method: static review of all 115 migrations,
7 edge functions and 37 server-function modules, plus **read-only probes against the
live API as an unauthenticated client** (row counts and column names only — no data
was copied). No test accounts were created and nothing was written to production.

## 1. What an anonymous visitor could read on the live project (before the fix)

| Table / view | Rows readable | Why it matters |
|---|---|---|
| `profiles` | all public/unlisted rows (8 today, **every patient** because the default visibility is `unlisted`) | exposes `phone`, `fcm_token`, `push_platform`, `medical_card`, `managed_by_doctor` of patients |
| `doctor_details` | all | exposes `finance_pin_hash` (offline PIN brute force), `license_document_url`, `verification_notes`, `national_id_last4` |
| `v_clinic_queue` | all | exposes `patient_id` of everyone sitting in every clinic queue |
| `reviews` | approved + published only ✔ | columns `moderation_notes`, `moderated_by`, `patient_id` are still visible (low) |
| `clinics`, `clinic_schedules`, `specialties`, `regions`, `exchange_rates`, `subscription_plans`, `web_vitals_summary`, `profile_short_links`, `doctor_followup_settings` | all | intended public data ✔ |
| everything else (appointments, medical records, prescriptions, invoices, payments, …) | 0 rows ✔ | RLS works |

Zero-argument RPCs callable **without login**: `ensure_doctor_trial`, `next_prescription_number`,
`get_managed_patients`, `list_my_care_doctors`, `list_appointment_payment_reviews`,
`doctor_subscription_status`, `unread_notifications_count` (they returned nothing useful
for an anonymous caller, but they should not be reachable at all).

## 2. Findings and fixes

| # | Severity | Finding | Fix |
|---|---|---|---|
| 1 | **Critical** | `livekit-token` edge function minted a publish/subscribe video token for ANY room name with **no authentication**. Appointment ids were public (queue view) → anyone could join a live consultation. | Rewritten: requires the user JWT, the room must be an appointment the caller is the patient or doctor of (checked through RLS), identity derived from the user id. `supabase/functions/livekit-token/index.ts` |
| 2 | **Critical** | Patient profile rows (phone, push token, medical card) readable without login (policy `profiles_public_readable` + default visibility `unlisted`). | New policy `profiles_read_v2` + `can_read_profile()`: doctors stay public; a patient row is readable only by the patient, the doctors/labs treating them, and admins. Feed author names now come from `public_profile_cards()` (name/avatar/city only). Migration §1 + `src/lib/feed.ts` |
| 3 | **High** | A patient could insert/update `appointments.payment_status='paid'`, `paid_at`, or set `status='completed'` directly (the completion trigger then posts revenue to the doctor ledger; the auto-invoice trigger issues an invoice). | `guard_appointment_writes` trigger: doctor keeps control, patient inserts start `unpaid`/pending-confirmed-waiting, patient updates cannot touch money/queue/parties and may only cancel. Migration §4 |
| 4 | **High** | A doctor could self-set `is_verified`, `verification_status`, `is_pro`, `pro_plus_active`, `telemedicine_enabled`, `subscription_plan`, `rating`, `reviews_count`, `is_claimed` with one direct update (no column guard). | `guard_doctor_details_writes` trigger resets those columns to defaults on insert and to their previous values on update unless the writer is the service role / an admin / an internal trigger. Migration §5 |
| 5 | **High** | `doctor_details.finance_pin_hash` publicly readable; `verify_finance_pin(any_doctor_id, pin)` callable by any logged-in user → PIN brute force. | Hash moved to locked table `doctor_finance_pins`; verification is owner-only with lockout (5 failures → 15 min). Same function signatures, column dropped. Migration §3 |
| 6 | **Medium** | `send-push` edge function: the shared secret was *optional* — if unset, anyone could push notifications to any user. | Secret is now mandatory (503 until `PUSH_WEBHOOK_SECRET` is set). `supabase/functions/send-push/index.ts` |
| 7 | **Medium** | `v_clinic_queue` leaked `patient_id` to the public queue board. | View recreated without `patient_id` (the two consumers never used it). Migration §2 |
| 8 | **Medium** | WhatsApp webhook skipped signature verification when `WHATSAPP_APP_SECRET` was unset (fail-open) → forged opt-outs / status rewrites. | Fail-closed. `src/lib/whatsapp.server.ts` |
| 9 | **Medium** | `trackSponsoredEvent` is public and billed every click → a script could drain a sponsor's budget and mark the slot exhausted. | Per-IP rate limit + one billable click per visitor session per slot per day; everything else recorded at zero cost. `src/lib/sponsorship.functions.ts`, `src/lib/_rate-limit.ts` |
| 10 | **Medium** | `profiles.status` (ban flag), `user_id`, `profile_views_count` were writable by the row owner. | `guard_profile_writes` trigger. Migration §6 |
| 11 | **Low** | Zero-argument RPCs executable by `anon`. | `REVOKE … FROM PUBLIC, anon`. Migration §7 |
| 12 | **Low** | `supabase/config.toml` still pointed at the OLD project `xezgyeddcdarmtywncdt`. | Set to the live ref. |

### Decisions for you (not changed — product impact)

* **Sign-up auto-confirms e-mail** (`signUpUser` → `auth.admin.createUser({ email_confirm: true })`) while Google login is enabled. Someone can register with a doctor's e-mail they do not own; when the real owner later signs in with Google, Supabase links the identities to the attacker-created account. Recommended: stop auto-confirming (send the confirmation e-mail / OTP) **or** disable Google sign-in. One-line change once you decide.
* `doctor-assets` bucket (signature + stamp images) is public-read. Prescription forgery risk is mitigated by `verify_prescription`, but signed URLs would be safer. Later phase.
* `license_document_url`, `verification_notes`, `national_id_last4`, `syndicate_number` are still readable on `doctor_details` (public directory table). Moving them to a private `doctor_private_details` table is the clean fix; needs the mobile app to follow.
* Google Maps browser key in `.env` — make sure it is HTTP-referrer-restricted in Google Cloud Console.

## 3. "Work done on Supabase that is NOT on the live project"

The live schema and the repo diverge. Probed as an anonymous client:

* Tables missing on live: **`missing_drugs`**, **`doctor_referrals`**.
* Functions missing on live: `doctor_today_queue_stats`, `doctor_book_followup` (migration
  `20260720010000_waiting_room_and_doctor_followup.sql`), `emergency_shift_queue`,
  `flag_emergency_appointment` (`20260717070000_emergency_queue.sql`), `ensure_referral_code`,
  `attribute_referral`, `my_referral_stats` (`20260721000000_doctor_referrals.sql`),
  plus whatever `20260717090000_missing_drugs.sql` creates.
* Consequences today: the **waiting-room stats** card (`dashboard.waiting-room.tsx`) fails,
  the dashboard's referral attribution call fails silently, admin onboarding's referral
  query fails, `/missing-drugs` cannot work.
* The live DB also contains objects that are not in the repo (e.g. `handle_emergency_booking`),
  so the migrations folder is not the single source of truth any more. Recommended: after
  applying, run `npx supabase db pull` to snapshot the real schema, then `npx supabase gen types`
  (the generated `types.ts` is already stale — two RPCs are missing from it).

## 4. Status — APPLIED to production on 2026-11-02 (evening)

Applied through `supabase/apply_2026-11-02.ps1` (Supabase CLI, logged in as the project owner):
hardening migration ✔, the four missing feature migrations ✔ (`missing_drugs`, `doctor_referrals`,
waiting-room stats, emergency queue), `livekit-token` + `send-push` redeployed ✔, `PUSH_WEBHOOK_SECRET`
set ✔ (value kept locally in the git-ignored `.dev.vars`).

Verified afterwards with read-only queries and anonymous API probes:
* `profiles` readable anonymously: **1 row (the doctor's public profile) instead of 8**; no patient rows.
* `doctor_details.finance_pin_hash` dropped; `v_clinic_queue` has no `patient_id`.
* The seven zero-argument RPCs return **401** to anonymous callers.
* `livekit-token` anonymous → `401 not_authenticated`; `send-push` without the header → `401 unauthorized`.
* Guard triggers and `profiles_read_v2` policy present; `doctor_today_queue_stats` etc. now exist.

Still open: `WHATSAPP_APP_SECRET` on Cloudflare (only if WhatsApp outreach is used), pushing the code to `main`.
The e-mail auto-confirm decision (§2) was resolved on 2026-11-03: phone OTP is now the primary sign-in and
e-mail sign-up requires confirmation when `RESEND_API_KEY` is configured — see `MESSAGING_AI_PAYMENTS_2026-11-03.md`.

### Original apply instructions (kept for reference)

I could not reach the database from this machine (no DB password, no access token, MCP not
connected in this session). Two options:

**A. Supabase Dashboard → SQL Editor** (fastest)
1. Paste and run `supabase/migrations/20261102100000_security_hardening.sql` (one batch — it is transactional and idempotent).
2. Then run, one by one, the four migrations listed in §3 (they are `IF NOT EXISTS` / `OR REPLACE`; if one fails on an object that already exists, skip that statement).
3. Edge functions: `npx supabase functions deploy livekit-token send-push` (needs `npx supabase login` once), then set secrets: `PUSH_WEBHOOK_SECRET` (random 32+ chars) and add the same value as the `x-webhook-secret` header on the Database Webhook that calls `send-push`.
4. Cloudflare: set `WHATSAPP_APP_SECRET` (`wrangler secret put WHATSAPP_APP_SECRET`) — otherwise the WhatsApp webhook now rejects everything (by design).
5. Deploy the web app (push to `main` → GitHub Action builds + deploys).

**B. Give me a Supabase personal access token** (Dashboard → Account → Access Tokens) set as
`SUPABASE_ACCESS_TOKEN` in the terminal and I apply + verify everything myself, including
re-running the anonymous probes to prove the leaks are closed.

## 5. Verification done so far

* `npx tsc --noEmit`: no new errors (43 pre-existing ones remain in untouched files; two were fixed in `signup.tsx` and `dashboard.waiting-room.tsx`). `npx vite build` succeeds.
* The migration got a second, independent line-by-line review (syntax, trigger semantics, JWT-claim handling, dependencies, batch behaviour): **no syntax errors, applies as one transaction**. Its findings were applied: `referral_code` is no longer locked (ensure_referral_code writes it with the doctor's JWT), doctors can still (re)submit verification from the browser (status → `pending` only), the vanity `profile_views_count` is not guarded, the appointment guard uses the STORED doctor on update, `anon` is no longer treated as a privileged writer, patients can cancel from `called`, and the PIN lockout counter resets after an expired lock.
* Still cannot be executed from here (no DB access) — see §4.
* Re-run `scratch probe` after applying: `profiles` must return **0 rows** for an anonymous caller except doctor profiles; `doctor_details` must no longer list `finance_pin_hash`; `v_clinic_queue` must not list `patient_id`.
