$Host.UI.RawUI.WindowTitle = "Tebana - admin panel phase 1"
# ============================================================================
# 2026-11-09: Admin control panel, phase 1.
#   1) applies supabase\migrations\20261109120000_admin_full_access.sql
#      (admin read/write on every table, storage, app_settings) — dry run first
#   2) publishes the website (new admin shell, global search, data engine)
#
#   powershell -ExecutionPolicy Bypass -File "C:\lovable\health-journey-global\supabase\apply_admin_phase1.ps1"
# ============================================================================
$ErrorActionPreference = "Continue"
$ref = "wqrrwvaxovrjjiilqkmt"
Set-Location "C:\lovable\health-journey-global"
$migration = "supabase\migrations\20261109120000_admin_full_access.sql"

function Run-Query([string]$file) {
  $out = & cmd /c "npx -y supabase@3.0.0 db query --remote=$ref -f `"$file`" --yes 2>&1" | Out-String
  return @{ ok = ($LASTEXITCODE -eq 0 -and $out -notmatch '"_tag":"Error"'); out = $out }
}

Write-Host ""
Write-Host "=== Tebana: admin panel phase 1 ===" -ForegroundColor Cyan
Write-Host "Paste a Supabase access token (sbp_...). Create one at the page that opens."
Start-Process "https://supabase.com/dashboard/account/tokens"

$done = $false
for ($try = 1; $try -le 5; $try++) {
  $sec = Read-Host "Paste token here (input is hidden)" -AsSecureString
  $tok = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec))
  $tok = ($tok -replace '[^!-~]', '')
  if ($tok -notmatch '^sbp_\S+$') { Write-Host "Not an access token (must start with sbp_)." -ForegroundColor Yellow; continue }
  $env:SUPABASE_ACCESS_TOKEN = $tok

  Write-Host "`n>>> DRY RUN (rolled back): $migration" -ForegroundColor Cyan
  $body = (Get-Content $migration -Raw -Encoding UTF8) -replace "(?m)^NOTIFY pgrst.*$", ""
  $dry = Join-Path $env:TEMP "tebana_dryrun.sql"
  [IO.File]::WriteAllText($dry, "BEGIN;`n" + $body + "`nROLLBACK;`n", (New-Object System.Text.UTF8Encoding($false)))
  $d = Run-Query $dry
  Remove-Item $dry -ErrorAction SilentlyContinue
  if (-not $d.ok) { Write-Host $d.out; Write-Host "DRY RUN FAILED - nothing was changed." -ForegroundColor Red; Remove-Item Env:SUPABASE_ACCESS_TOKEN -ErrorAction SilentlyContinue; break }
  Write-Host "Dry run OK. Applying for real..." -ForegroundColor Cyan
  $a = Run-Query $migration
  Remove-Item Env:SUPABASE_ACCESS_TOKEN -ErrorAction SilentlyContinue
  if (-not $a.ok) { Write-Host $a.out; Write-Host "FAILED: $migration" -ForegroundColor Red; break }
  Write-Host "OK: $migration" -ForegroundColor Green
  $done = $true
  break
}

if ($done) {
  Write-Host "`n>>> Publishing the website" -ForegroundColor Cyan
  & powershell -ExecutionPolicy Bypass -File "C:\lovable\health-journey-global\deploy_web.ps1"
  if ($LASTEXITCODE -ne 0) { Write-Host "Website deploy reported an error - send Claude a screenshot." -ForegroundColor Red }
  else { Write-Host "`nDONE - admin phase 1 live. Tell Claude 'تم'." -ForegroundColor Green }
}
