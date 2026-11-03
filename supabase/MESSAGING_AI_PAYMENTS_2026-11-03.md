# Tebana — 2026-11-03 release: phone-first identity, automatic patient messaging, AI references, Paymob

Everything below is in the repo and applied to production with `supabase/apply_2026-11-03.ps1`.
Sections marked **YOU** need an account or a key that only the owner can create.

## 1. Phone number = primary identity

| Piece | Where | Status |
|---|---|---|
| Canonical phone (`+20…`) on every profile/contact, kept in sync by trigger | `normalize_phone()`, `profiles.phone_e164`, `user_contacts.phone_e164` | applied by script |
| Sign-in / sign-up with mobile number + one-time code (WhatsApp or SMS) | `/login`, `/signup` (phone tab is the default; e-mail and Google remain) | in code |
| New phone account → profile, role, details created server-side | `bootstrapPhoneUser` in `src/lib/auth.functions.ts` | in code |
| **Auto-claim**: a patient who verifies the SAME number a doctor registered inherits that file (visits, prescriptions, results) with no link needed | `adopt_managed_profile_by_phone()` | applied by script |
| Doctor gets an in-app notification when the patient completes registration | trigger `notify_doctors_patient_claimed` | applied by script |
| E-mail sign-up now requires confirming the address (closes the Google-linking takeover from the audit). Falls back to the old auto-confirm only when `RESEND_API_KEY` is absent on Cloudflare | `signUpUser`, template `confirm-email.ts` | in code |

OTP delivery goes through the **Send SMS auth hook** (`auth-send-sms` edge function) so the code can be sent by WhatsApp first and SMS second, using the same providers as every other message.

**YOU — one time, Supabase Dashboard → Authentication → Hooks → Send SMS**: enable, type HTTP, URL `https://wqrrwvaxovrjjiilqkmt.supabase.co/functions/v1/auth-send-sms`, secret = the `SEND_SMS_HOOK_SECRET` the script printed (also in `.dev.vars`). Providers → Phone: OTP expiry 600 s.

## 2. Automatic message to patients a doctor registers

Flow: doctor adds/imports a patient → DB link `doctor_patients` → trigger queues ONE `patient_welcome` message in `outbox_messages` with the patient's personal claim link → `send-outbox` sends it (immediately from the web server, and every minute by `pg_cron` as a sweeper) → patient taps the link / installs the app → signs up with the same number → file linked automatically.

Built-in protections: one welcome per doctor+patient (dedupe key), max 300 messages/doctor/day, opt-out list honoured (`إلغاء` / STOP replies on WhatsApp are processed by the existing webhook), consent attestation checkbox on add/import, full delivery log per message (status, provider, provider id, errors, retries with back-off).

Manual "send again" button on the patient page uses the same queue (`send-claim-sms` → `request_patient_invite`), limited to once per patient per day.

**YOU — choose the channel (WhatsApp recommended; both can be configured, WhatsApp is tried first):**

### WhatsApp Business Cloud API (Meta)
1. Meta Business Suite → WhatsApp → add a phone number for "طبانا" (business verification with the commercial register).
2. Create a permanent system-user token with `whatsapp_business_messaging` + `whatsapp_business_management`.
3. `npx supabase@3.0.0 secrets set WHATSAPP_TOKEN=… WHATSAPP_PHONE_NUMBER_ID=… --remote=wqrrwvaxovrjjiilqkmt --yes`
4. Create and submit these templates in WhatsApp Manager (language **ar**):
   * `patient_welcome` (category UTILITY)
     Body: `تم تسجيلك لدى د. {{1}} على طبانا. حمّل التطبيق وسجّل بنفس رقمك لاستلام ملفك الطبي ومتابعة مواعيدك: {{2}}` 
     Footer: `للإلغاء أرسل: إلغاء`
   * `otp_code` (category AUTHENTICATION, "copy code" button, code expires in 10 minutes). Meta generates the body for authentication templates.
   * optional `appointment_reminder` (UTILITY): `تذكير بموعدك مع د. {{1}} {{2}}. لإدارة الموعد افتح تطبيق طبانا.`
   Names can be changed with `WHATSAPP_TEMPLATE_WELCOME` / `WHATSAPP_TEMPLATE_OTP` / `WHATSAPP_TEMPLATE_REMINDER` secrets.
5. Webhook (already implemented at `https://mytabibi.com/api/public/whatsapp/webhook`): set `WHATSAPP_APP_SECRET` and `WHATSAPP_VERIFY_TOKEN` on Cloudflare (`wrangler secret put …`) and subscribe to `messages`.

### Twilio SMS (fallback or SMS-only)
`npx supabase@3.0.0 secrets set TWILIO_ACCOUNT_SID=AC… TWILIO_AUTH_TOKEN=… TWILIO_FROM=+1… --remote=wqrrwvaxovrjjiilqkmt --yes` (or `TWILIO_MESSAGING_SERVICE_SID=MG…`). Egypt requires a pre-registered alphanumeric sender ID for reliable delivery — ask Twilio support for "Egypt sender ID registration".

### Egyptian SMS gateway (Cequens / SMS Misr) — optional later
Add a third provider in `supabase/functions/_shared/messaging.ts` (`sendMessage` routing); nothing else changes.

## 3. AI assistant with references (no more "خرافات")

* Library: `medical_sources` + `medical_chunks` (pgvector, hybrid vector+keyword search with reciprocal-rank fusion).
* `analyze-symptoms` v2: rewrites the Arabic symptoms into an English retrieval query, pulls the 8 best passages, and the main model (`gpt-4.1`, temperature 0) must cite passage numbers per diagnosis/test/treatment, may not invent doses, and labels the answer **مستند إلى مراجع** or **إجابة عامة**. Every answer is logged in `ai_consultations`; doctors rate it 👍/👎 in the visit screen.
* Admin page `/admin/ai-references`: library status, on/off per source, upload licensed PDFs/text (queued), MedlinePlus refresh.
* Ingestion runs on the owner's machine (needs the service-role and OpenAI keys): `npm run ingest:references -- medlineplus` (≈1,000 public-domain NLM health topics, English, 5–10 minutes, ≈ $0.10 of embeddings) and `npm run ingest:references -- jobs` for uploads, or `-- pdf --file … --title … --license owned-license`.

**Licensing — what may go in:** public domain (MedlinePlus, CDC, NIH, openFDA labels), CC-BY, Egyptian MoH/EDA protocols, content you bought a licence for (BMJ Best Practice / ClinicalKey / UpToDate APIs — contact sales), your own protocols. **Not** scanned copyrighted textbooks (Harrison, Nelson, …) without a licence — the upload form makes the admin attest to this and the licence is stored on every source and shown with every citation. StatPearls and WHO publications are non-commercial licences; ask for permission before using them.

Cost per analysis ≈ $0.01–0.03 (small model + embedding + main model); budget alerts belong in the OpenAI dashboard.

## 4. Paymob appointment payments

* `paymob-initiate` now accepts `{ kind: "appointment", appointmentId }` (amount taken server-side from the appointment; RLS-checked).
* `paymob-webhook` verifies the HMAC, records the payment in `payments` and marks the appointment paid/confirmed exactly like Stripe did. Deployed with `verify_jwt = false` so Paymob can reach it (it could not before).
* `/pay?ref=<appointment>` shows **ادفع أونلاين (بطاقة / محفظة)** when the GitHub repo variable `VITE_PAYMOB_ENABLED=true`.

**YOU:** Paymob merchant account (commercial register + bank account) → copy API key (already set), **integration id** (card; optionally wallet), **iframe id**, HMAC (already set) → `npx supabase@3.0.0 secrets set PAYMOB_INTEGRATION_ID=… PAYMOB_IFRAME_ID=… --remote=wqrrwvaxovrjjiilqkmt --yes` → Paymob dashboard "Transaction processed callback" = `https://wqrrwvaxovrjjiilqkmt.supabase.co/functions/v1/paymob-webhook` → set `VITE_PAYMOB_ENABLED=true` and redeploy the web app.

## 5. Other variables

| Variable | Where | Purpose |
|---|---|---|
| `VITE_APP_STORE_URL`, `VITE_PLAY_STORE_URL` | GitHub repo variables | show store badges on the claim page once the apps are published |
| `RESEND_API_KEY`, `EMAIL_FROM` | Cloudflare secrets | e-mail confirmation / receipts / reminders |
| `OPENAI_SMALL_MODEL`, `OPENAI_EMBED_MODEL` | Supabase secrets | override `gpt-4.1-mini` / `text-embedding-3-small` |

## 6. Verification checklist (after the script)

1. `select count(*) from outbox_messages;` exists; `select jobname from cron.job;` shows `outbox-drain`.
2. `/signup` → phone tab → enter a number → a code arrives (after step 1 "YOU").
3. Doctor → مرضائي → إضافة مريض with a phone → `outbox_messages` row `queued` → `sent` once a provider is configured.
4. Patient signs up with that number → row in `doctor_patients` points at a profile with `user_id` set; doctor gets the "أكمل مريضك تسجيله" notification.
5. Visit screen → اقترح بالذكاء الاصطناعي → answer shows the evidence badge; after `medlineplus` ingestion it cites references.
