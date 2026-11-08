$Host.UI.RawUI.WindowTitle = "Tebana - push notifications secret"
# ============================================================================
# Stores the Firebase service-account key (created 2026-11-08 by gcloud in
# project tabibi-tebana) as the FCM_SERVICE_ACCOUNT secret of the send-push
# edge function. Run once; re-run only if the key file is regenerated.
#
#   powershell -ExecutionPolicy Bypass -File "C:\lovable\health-journey-global\supabase\set_push_secret.ps1"
# ============================================================================
$ErrorActionPreference = "Continue"
$ref = "wqrrwvaxovrjjiilqkmt"
$keyFile = "C:\lovable\tabibi-fcm-service-account.json"
Set-Location "C:\lovable\health-journey-global"

if (-not (Test-Path $keyFile)) { Write-Host "Key file not found: $keyFile" -ForegroundColor Red; exit 1 }
$sa = Get-Content $keyFile -Raw -Encoding UTF8 | ConvertFrom-Json
if (-not ($sa.client_email -and $sa.private_key -and $sa.project_id)) { Write-Host "Not a service-account key file." -ForegroundColor Red; exit 1 }

Write-Host ""
Write-Host "=== Tebana: set FCM_SERVICE_ACCOUNT (project $($sa.project_id)) ===" -ForegroundColor Cyan
Write-Host "Paste a Supabase access token (sbp_...). Create one at the page that opens."
Start-Process "https://supabase.com/dashboard/account/tokens"

for ($try = 1; $try -le 5; $try++) {
  $sec = Read-Host "Paste token here (input is hidden)" -AsSecureString
  $tok = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec))
  $tok = ($tok -replace '[^!-~]', '')
  if ($tok -notmatch '^sbp_\S+$') { Write-Host "Not an access token (must start with sbp_)." -ForegroundColor Yellow; continue }
  $env:SUPABASE_ACCESS_TOKEN = $tok

  $saJson = $sa | ConvertTo-Json -Compress -Depth 10
  $envFile = Join-Path $env:TEMP "tebana_fcm.env"
  # Single quotes keep the \n escapes inside private_key literal (the function JSON-parses it).
  [IO.File]::WriteAllText($envFile, "FCM_SERVICE_ACCOUNT='$saJson'`n", (New-Object System.Text.UTF8Encoding($false)))
  $out = & cmd /c "npx -y supabase@3.0.0 secrets set --env-file `"$envFile`" --remote=$ref --yes 2>&1" | Out-String
  Remove-Item $envFile -ErrorAction SilentlyContinue
  Remove-Item Env:SUPABASE_ACCESS_TOKEN -ErrorAction SilentlyContinue
  if ($LASTEXITCODE -ne 0) { Write-Host $out; Write-Host "FAILED: secrets set FCM_SERVICE_ACCOUNT" -ForegroundColor Red; break }
  Write-Host "DONE - FCM_SERVICE_ACCOUNT set on send-push. Tell Claude 'تم'." -ForegroundColor Green
  break
}
