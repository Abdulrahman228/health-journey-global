# ============================================================================
# Tebana - deploy the web app to Cloudflare Workers WITHOUT GitHub.
#
# Uses the Cloudflare API token saved in C:\lovable\.cf_token (verified 2026-11-03:
# it authenticates as your Cloudflare account). Builds, deploys, purges nothing
# (Cloudflare serves the new Worker version immediately).
#
# Run from PowerShell (any folder):
#   powershell -ExecutionPolicy Bypass -File "C:\lovable\health-journey-global\deploy_web.ps1"
#
# Order on release day: 1) supabase\apply_2026-11-03.ps1  2) this script.
# ============================================================================
$ErrorActionPreference = "Continue"
$root = "C:\lovable\health-journey-global"
Set-Location $root

# Token: file is "CLOUDFLARE_API_TOKEN=<token>" (one line) - strip the key name.
$line = (Get-Content "C:\lovable\.cf_token" -Raw).Trim()
$env:CLOUDFLARE_API_TOKEN = ($line -replace '^CLOUDFLARE_API_TOKEN=', '').Trim()
if (-not $env:CLOUDFLARE_API_TOKEN) { Write-Host "No Cloudflare token found in C:\lovable\.cf_token" -ForegroundColor Red; exit 1 }

Write-Host "`n>>> who am I (Cloudflare)" -ForegroundColor Cyan
& cmd /c "npx wrangler whoami 2>&1" | Select-String -Pattern "logged in|Account" | ForEach-Object { $_.Line }

Write-Host "`n>>> npm run build" -ForegroundColor Cyan
& cmd /c "npm run build 2>&1" | Select-Object -Last 3
if ($LASTEXITCODE -ne 0) { Write-Host "BUILD FAILED" -ForegroundColor Red; exit 1 }

Write-Host "`n>>> npx wrangler deploy" -ForegroundColor Cyan
& cmd /c "npx wrangler deploy 2>&1"
if ($LASTEXITCODE -ne 0) { Write-Host "DEPLOY FAILED" -ForegroundColor Red; exit 1 }

Write-Host "`n>>> verifying https://mytabibi.com/login shows the phone sign-in" -ForegroundColor Cyan
Start-Sleep -Seconds 10
try {
  $html = (Invoke-WebRequest -Uri "https://mytabibi.com/login" -UseBasicParsing -TimeoutSec 30).Content
  if ($html -match "otp-phone") { Write-Host "LIVE: new login page is up." -ForegroundColor Green }
  else { Write-Host "Deployed, but the cached page may take a minute - open the site in a private window." -ForegroundColor Yellow }
} catch { Write-Host "Could not fetch the site for verification: $($_.Exception.Message)" -ForegroundColor Yellow }

Write-Host "`nDONE - tell Claude 'تم النشر' so it re-verifies." -ForegroundColor Green
