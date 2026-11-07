$Host.UI.RawUI.WindowTitle = "Tebana - apply DB updates"
# ============================================================================
# Tebana - apply pending database updates in ONE step.
# The token is used only inside this window (env var), never stored on disk.
# Each migration is first DRY-RUN inside BEGIN..ROLLBACK; it is applied only
# if the dry run succeeds.
#
#   powershell -ExecutionPolicy Bypass -File "C:\lovable\health-journey-global\supabase\apply_with_token.ps1"
# ============================================================================
$ErrorActionPreference = "Continue"
$ref = "wqrrwvaxovrjjiilqkmt"
Set-Location "C:\lovable\health-journey-global"
# Already applied: 20261104120000_booking_timezone, 20261104130000_identity_fixes,
# 20261104140000_visit_status_rules. Order matters: 100000 -> 110000 -> 120000
# -> 20261107100000 (appointment notifications + push trigger), then the one-off
# data fix (commission back-fill + QA account cleanup).
$migrations = @(
  "supabase\migrations\20261106100000_wiring_audit_fixes.sql",
  "supabase\migrations\20261106110000_doctor_search_nearby.sql",
  "supabase\migrations\20261106120000_app_audit_db_fixes.sql",
  "supabase\migrations\20261107100000_notifications_push_wiring.sql",
  "supabase\data_fixes\20261106_commission_backfill_qa_cleanup.sql"
)
# Edge functions changed on 2026-11-06 (auth-send-sms, send-claim-sms and
# send-outbox share _shared/messaging.ts); send-push re-deployed 2026-11-07 with
# verify_jwt=false (config.toml) so the DB trigger can call it with its shared
# secret. Deployed only if all migrations succeed.
$functions = @("places-search", "paymob-initiate", "paymob-webhook", "auth-send-sms", "send-claim-sms", "send-outbox", "send-push")
# Secrets every edge function needs (names only are printed at the end).
$requiredSecrets = [ordered]@{
  "Google Maps (clinic search)"   = @("PLACES_API_KEY")
  "Paymob payments"               = @("PAYMOB_API_KEY", "PAYMOB_INTEGRATION_ID", "PAYMOB_IFRAME_ID", "PAYMOB_HMAC")
  "Video consultations (LiveKit)" = @("LIVEKIT_API_KEY", "LIVEKIT_API_SECRET", "LIVEKIT_WS_URL")
  "AI assistant"                  = @("OPENAI_API_KEY")
  "Mobile push notifications"     = @("FCM_SERVICE_ACCOUNT", "PUSH_WEBHOOK_SECRET")
  "SMS / phone OTP (Twilio)"      = @("SEND_SMS_HOOK_SECRET", "TWILIO_ACCOUNT_SID", "TWILIO_AUTH_TOKEN")
  "Automatic patient messages"    = @("OUTBOX_WORKER_SECRET", "SITE_URL")
}

Write-Host ""
Write-Host "=== Tebana: apply database updates ===" -ForegroundColor Cyan
Write-Host "1) Supabase -> Account -> Access Tokens -> 'Create legacy token'."
Write-Host "2) Copy the token shown once (starts with sbp_, about 44 characters)."
Write-Host "3) Paste it below (right-click pastes). Keep the token until this finishes."
Write-Host ""
Start-Process "https://supabase.com/dashboard/account/tokens"

function Run-Query([string]$file) {
  $out = & cmd /c "npx -y supabase@3.0.0 db query --remote=$ref -f `"$file`" --yes 2>&1" | Out-String
  return @{ ok = ($LASTEXITCODE -eq 0 -and $out -notmatch '"_tag":"Error"'); out = $out }
}

for ($try = 1; $try -le 5; $try++) {
  $sec = Read-Host "Paste token here (input is hidden)" -AsSecureString
  $tok = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec))
  # Keep only visible ASCII: an RTL (Arabic) browser page adds invisible
  # direction marks (U+200E/U+200F) around copied text.
  $tok = ($tok -replace '[^!-~]', '')
  if ($tok -notmatch '^sbp_\S+$') {
    $head = if ($tok.Length -ge 4) { $tok.Substring(0, 4) } else { $tok }
    Write-Host ("Not an access token (length {0}, starts with '{1}'). It must start with sbp_." -f $tok.Length, $head) -ForegroundColor Yellow
    continue
  }
  $env:SUPABASE_ACCESS_TOKEN = $tok

  $probe = Join-Path $env:TEMP "tebana_write_probe.sql"
  [IO.File]::WriteAllText($probe, "select 'write-ok' as probe;", (New-Object System.Text.UTF8Encoding($false)))
  $r = Run-Query $probe
  Remove-Item $probe -ErrorAction SilentlyContinue
  if ($r.out -notmatch "write-ok") {
    $msg = ($r.out -split "`n" | Select-String 'message' | Select-Object -First 1)
    Write-Host "This token cannot write to the database: $msg" -ForegroundColor Yellow
    Write-Host "Use 'Create legacy token' and paste the new sbp_ value." -ForegroundColor Yellow
    continue
  }
  Write-Host "Token OK (write access)." -ForegroundColor Green

  $failed = $false
  foreach ($file in $migrations) {
    Write-Host "`n>>> DRY RUN (rolled back): $file" -ForegroundColor Cyan
    $body = (Get-Content $file -Raw -Encoding UTF8) -replace "(?m)^NOTIFY pgrst.*$", ""
    $dry = Join-Path $env:TEMP "tebana_dryrun.sql"
    [IO.File]::WriteAllText($dry, "BEGIN;`n" + $body + "`nROLLBACK;`n", (New-Object System.Text.UTF8Encoding($false)))
    $d = Run-Query $dry
    Remove-Item $dry -ErrorAction SilentlyContinue
    if (-not $d.ok) {
      Write-Host $d.out
      Write-Host "DRY RUN FAILED - nothing was changed: $file" -ForegroundColor Red
      $failed = $true; break
    }
    Write-Host "Dry run OK. Applying for real..." -ForegroundColor Cyan
    $a = Run-Query $file
    if (-not $a.ok) { Write-Host $a.out; Write-Host "FAILED: $file" -ForegroundColor Red; $failed = $true; break }
    Write-Host "OK: $file" -ForegroundColor Green
  }
  if (-not $failed) {
    foreach ($fn in $functions) {
      Write-Host "`n>>> Deploying function: $fn" -ForegroundColor Cyan
      $out = & cmd /c "npx -y supabase@3.0.0 functions deploy $fn --remote=$ref --yes 2>&1" | Out-String
      if ($LASTEXITCODE -ne 0) { Write-Host $out; Write-Host "FAILED to deploy: $fn" -ForegroundColor Red; $failed = $true; break }
      Write-Host "OK: $fn" -ForegroundColor Green
    }
  }

  if (-not $failed) {
    # --- Push notifications: ONE shared secret, on the function (PUSH_WEBHOOK_SECRET)
    #     and in the database Vault (push_webhook_secret, read by the notifications
    #     trigger). A fresh value is generated on every run (the 11-02 value was
    #     never saved locally); the Vault entry is updated in place.
    Write-Host "`n>>> Push: linking the notifications trigger to send-push" -ForegroundColor Cyan
    $rng = New-Object System.Security.Cryptography.RNGCryptoServiceProvider
    $bytes = New-Object byte[] 24; $rng.GetBytes($bytes)
    $pushSecret = ([BitConverter]::ToString($bytes)).Replace("-", "").ToLower()
    $out = & cmd /c "npx -y supabase@3.0.0 secrets set PUSH_WEBHOOK_SECRET=$pushSecret --remote=$ref --yes 2>&1" | Out-String
    if ($LASTEXITCODE -ne 0) { Write-Host $out; Write-Host "FAILED: secrets set PUSH_WEBHOOK_SECRET" -ForegroundColor Red; $failed = $true }
    else {
      $vaultSql = Join-Path $env:TEMP "tebana_push_vault.sql"
      [IO.File]::WriteAllText($vaultSql,
        "DO `$`$ DECLARE v_id uuid; BEGIN`n" +
        "  SELECT id INTO v_id FROM vault.secrets WHERE name = 'push_webhook_secret' LIMIT 1;`n" +
        "  IF v_id IS NULL THEN PERFORM vault.create_secret('$pushSecret', 'push_webhook_secret', 'x-webhook-secret for send-push (notifications trigger)');`n" +
        "  ELSE PERFORM vault.update_secret(v_id, '$pushSecret'); END IF;`n" +
        "END `$`$;`n" +
        "SELECT 'vault-ok' AS probe;", (New-Object System.Text.UTF8Encoding($false)))
      $v = Run-Query $vaultSql
      Remove-Item $vaultSql -ErrorAction SilentlyContinue
      if ($v.out -notmatch "vault-ok") { Write-Host $v.out; Write-Host "FAILED: storing push secret in Vault" -ForegroundColor Red; $failed = $true }
      else {
        $devVars = ".dev.vars"
        $keep = @(); if (Test-Path $devVars) { $keep = Get-Content $devVars | Where-Object { $_ -notmatch '^PUSH_WEBHOOK_SECRET=' } }
        Set-Content -Path $devVars -Value ($keep + "PUSH_WEBHOOK_SECRET=$pushSecret") -Encoding utf8
        Write-Host "OK: push secret set on send-push + Vault (copy kept in .dev.vars, git-ignored)" -ForegroundColor Green
      }
    }
    $pushSecret = $null

    # --- Firebase service account (needed once; Enter to skip if already set) --
    Write-Host ""
    Write-Host "Firebase Console -> Project settings -> Service accounts -> 'Generate new private key'"
    Write-Host "downloads a .json file. Paste its full path to store it as FCM_SERVICE_ACCOUNT,"
    Write-Host "or press Enter to skip (keeps whatever is set now)."
    $saPath = Read-Host "Service-account .json path"
    $saPath = $saPath.Trim().Trim('"')
    if ($saPath -and (Test-Path $saPath)) {
      try {
        $sa = Get-Content $saPath -Raw -Encoding UTF8 | ConvertFrom-Json
        if (-not ($sa.client_email -and $sa.private_key -and $sa.project_id)) { throw "not a Firebase service-account file (client_email / private_key / project_id missing)" }
        $saJson = $sa | ConvertTo-Json -Compress -Depth 10
        $envFile = Join-Path $env:TEMP "tebana_fcm.env"
        # Single quotes: the CLI keeps the \n escapes inside private_key literal.
        [IO.File]::WriteAllText($envFile, "FCM_SERVICE_ACCOUNT='$saJson'`n", (New-Object System.Text.UTF8Encoding($false)))
        $out = & cmd /c "npx -y supabase@3.0.0 secrets set --env-file `"$envFile`" --remote=$ref --yes 2>&1" | Out-String
        Remove-Item $envFile -ErrorAction SilentlyContinue
        if ($LASTEXITCODE -ne 0) { Write-Host $out; Write-Host "FAILED: secrets set FCM_SERVICE_ACCOUNT" -ForegroundColor Red }
        else { Write-Host "OK: FCM_SERVICE_ACCOUNT set (project $($sa.project_id))" -ForegroundColor Green }
      } catch { Write-Host "Skipped FCM_SERVICE_ACCOUNT: $($_.Exception.Message)" -ForegroundColor Yellow }
    } elseif ($saPath) { Write-Host "File not found, skipped: $saPath" -ForegroundColor Yellow }

    # --- Which secrets are still missing (names only; values are never shown) --
    Write-Host "`n>>> Edge-function secrets check" -ForegroundColor Cyan
    $out = & cmd /c "npx -y supabase@3.0.0 secrets list --remote=$ref 2>&1" | Out-String
    $present = @([regex]::Matches($out, '(?m)^\s*([A-Z][A-Z0-9_]+)\s*\|') | ForEach-Object { $_.Groups[1].Value })
    if ($present.Count -eq 0) { Write-Host "Could not read the secrets list: $($out.Trim())" -ForegroundColor Yellow }
    else {
      $anyMissing = $false
      foreach ($feature in $requiredSecrets.Keys) {
        $missing = @($requiredSecrets[$feature] | Where-Object { $present -notcontains $_ })
        if ($feature -like "SMS*" -and ($present -notcontains "TWILIO_FROM") -and ($present -notcontains "TWILIO_MESSAGING_SERVICE_SID")) { $missing += "TWILIO_FROM (or TWILIO_MESSAGING_SERVICE_SID)" }
        if ($missing.Count -gt 0) { $anyMissing = $true; Write-Host ("  {0}: missing {1}" -f $feature, ($missing -join ", ")) -ForegroundColor Yellow }
        else { Write-Host ("  {0}: OK" -f $feature) -ForegroundColor Green }
      }
      if ($anyMissing) { Write-Host "  Set a missing one with:  npx -y supabase@3.0.0 secrets set NAME=value --remote=$ref --yes" -ForegroundColor Yellow }
    }
    Write-Host "`nManual (dashboard -> Edge Functions): remove the orphan 'quick-responder' - it is a July copy of paymob-initiate." -ForegroundColor Yellow
  }
  Remove-Item Env:SUPABASE_ACCESS_TOKEN -ErrorAction SilentlyContinue
  if ($failed) { Write-Host "`nSend Claude a screenshot of the red line." -ForegroundColor Red }
  else { Write-Host "`nDONE - all updates applied. Tell Claude 'تم'." -ForegroundColor Green }
  break
}
