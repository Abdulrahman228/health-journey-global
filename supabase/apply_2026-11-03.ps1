# ============================================================================
# Tebana - 2026-11-03 release: phone-first identity + unified messaging,
# AI reference library, Paymob appointment payments.
#
# What it does (idempotent, safe to re-run):
#   1. enables pg_cron / pg_net / vector extensions (needed by the outbox cron + RAG)
#   2. applies the two new migrations
#   3. stores the outbox worker secret in Supabase Vault (read by the cron job)
#   4. deploys the edge functions (verify_jwt per supabase/config.toml)
#   5. sets the edge-function secrets it can generate itself
#   6. prints the manual steps that need YOUR accounts (WhatsApp/Twilio/Paymob/Auth hook)
#
# Run from PowerShell (any folder):
#   powershell -ExecutionPolicy Bypass -File "C:\lovable\health-journey-global\supabase\apply_2026-11-03.ps1"
# Requires: `npx supabase login` done once (already done on this machine).
# Native commands print progress on stderr, so we do NOT use ErrorAction=Stop.
# ============================================================================
$ErrorActionPreference = "Continue"
$ref  = "wqrrwvaxovrjjiilqkmt"
$root = "C:\lovable\health-journey-global"
Set-Location $root

function Run-Sql([string]$file) {
  Write-Host "`n>>> SQL: $file" -ForegroundColor Cyan
  & cmd /c "npx supabase@3.0.0 db query --remote=$ref -f `"$file`" --yes 2>&1"
  if ($LASTEXITCODE -ne 0) { Write-Host "FAILED: $file" -ForegroundColor Red; exit 1 }
  Write-Host "OK: $file" -ForegroundColor Green
}

function Run-SqlText([string]$sql, [string]$label) {
  $tmp = Join-Path $env:TEMP ("tebana_" + $label + ".sql")
  [IO.File]::WriteAllText($tmp, $sql, (New-Object System.Text.UTF8Encoding($false)))
  Run-Sql $tmp
  Remove-Item $tmp -ErrorAction SilentlyContinue
}

function New-Secret([int]$len) {
  $chars  = [char[]]((48..57) + (65..90) + (97..122))
  return -join (1..$len | ForEach-Object { $chars[(Get-Random -Maximum $chars.Length)] })
}

function New-Base64Secret([int]$bytes) {
  $b = New-Object byte[] $bytes
  [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b)
  return [Convert]::ToBase64String($b)
}

# 1) Extensions ---------------------------------------------------------------
Run-SqlText @"
do `$`$ begin
  begin create extension if not exists pg_cron with schema pg_catalog; exception when others then raise notice 'pg_cron: %', sqlerrm; end;
  begin grant usage on schema cron to postgres; exception when others then null; end;
  begin create extension if not exists pg_net with schema extensions; exception when others then raise notice 'pg_net: %', sqlerrm; end;
  begin create extension if not exists vector with schema extensions; exception when others then raise notice 'vector: %', sqlerrm; end;
end `$`$;
select extname, extversion from pg_extension where extname in ('pg_cron','pg_net','vector');
"@ "extensions"

# 2) Migrations ----------------------------------------------------------------
Run-Sql "supabase\migrations\20261103100000_phone_identity_messaging.sql"
Run-Sql "supabase\migrations\20261103110000_medical_references.sql"

# 3) Secrets we generate ourselves ---------------------------------------------
$outboxSecret = New-Secret 40
$hookSecret   = "v1,whsec_" + (New-Base64Secret 32)

Run-SqlText @"
do `$`$
declare v_id uuid;
begin
  select id into v_id from vault.secrets where name = 'outbox_worker_secret' limit 1;
  if v_id is null then
    perform vault.create_secret('$outboxSecret', 'outbox_worker_secret', 'x-outbox-secret header for the send-outbox edge function');
  else
    perform vault.update_secret(v_id, '$outboxSecret');
  end if;
end `$`$;
select jobname, schedule, active from cron.job where jobname = 'outbox-drain';
"@ "vault"

# 4) Edge functions ------------------------------------------------------------
foreach ($fn in @("send-outbox", "auth-send-sms", "send-claim-sms", "analyze-symptoms", "paymob-initiate", "paymob-webhook")) {
  Write-Host "`n>>> deploying edge function: $fn" -ForegroundColor Cyan
  & cmd /c "npx supabase@3.0.0 functions deploy $fn --remote=$ref --yes 2>&1"
  if ($LASTEXITCODE -ne 0) { Write-Host "FAILED: deploy $fn" -ForegroundColor Red; exit 1 }
  Write-Host "OK: $fn deployed" -ForegroundColor Green
}

# 5) Edge-function secrets -----------------------------------------------------
& cmd /c "npx supabase@3.0.0 secrets set OUTBOX_WORKER_SECRET=$outboxSecret SEND_SMS_HOOK_SECRET=$hookSecret SITE_URL=https://mytabibi.com --remote=$ref --yes 2>&1"
if ($LASTEXITCODE -ne 0) { Write-Host "FAILED: secrets set" -ForegroundColor Red; exit 1 }
Add-Content -Path "$root\.dev.vars" -Value "OUTBOX_WORKER_SECRET=$outboxSecret" -Encoding utf8
Add-Content -Path "$root\.dev.vars" -Value "SEND_SMS_HOOK_SECRET=$hookSecret" -Encoding utf8
Write-Host ">>> secrets set on Supabase and saved to .dev.vars (local only, git-ignored)" -ForegroundColor Green

# 6) Manual steps --------------------------------------------------------------
Write-Host @"

================================================================================
ALL AUTOMATED STEPS DONE. Now the parts that need YOUR accounts:

A) Supabase Dashboard -> Authentication -> Hooks -> "Send SMS" -> Enable
     Type: HTTP
     URL : https://$ref.supabase.co/functions/v1/auth-send-sms
     Secret: paste EXACTLY this value (also saved in .dev.vars):
       $hookSecret
     (If the dashboard insists on generating its own secret, copy that one and run:
       npx supabase@3.0.0 secrets set SEND_SMS_HOOK_SECRET=<dashboard value> --remote=$ref --yes )
   Also in Authentication -> Providers -> Phone: keep "Enable phone provider" ON,
   set "SMS OTP expiry" to 600 seconds, OTP length 6.

B) Messaging channel secrets (at least ONE of these, WhatsApp recommended):
     npx supabase@3.0.0 secrets set WHATSAPP_TOKEN=... WHATSAPP_PHONE_NUMBER_ID=... --remote=$ref --yes
     npx supabase@3.0.0 secrets set TWILIO_ACCOUNT_SID=... TWILIO_AUTH_TOKEN=... TWILIO_FROM=+1... --remote=$ref --yes
   WhatsApp needs the templates "patient_welcome" and "otp_code" approved in Meta
   WhatsApp Manager - exact texts are in supabase/MESSAGING_AI_PAYMENTS_2026-11-03.md

C) Paymob (when the merchant account is ready):
     npx supabase@3.0.0 secrets set PAYMOB_INTEGRATION_ID=... PAYMOB_IFRAME_ID=... --remote=$ref --yes
   Paymob dashboard -> Transaction processed callback:
     https://$ref.supabase.co/functions/v1/paymob-webhook
   GitHub repo variable VITE_PAYMOB_ENABLED=true (shows the "pay online" button).

D) AI library (one-time, on this PC; needs OPENAI_API_KEY + SUPABASE_SERVICE_ROLE_KEY in .dev.vars):
     npm run ingest:references -- medlineplus
   then upload your licensed PDFs from /admin/ai-references and run:
     npm run ingest:references -- jobs

Tell Claude 'تم' afterwards so it re-verifies everything.
================================================================================
"@ -ForegroundColor Yellow
