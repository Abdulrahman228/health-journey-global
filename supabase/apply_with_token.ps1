$Host.UI.RawUI.WindowTitle = "Tebana - apply DB updates"
# ============================================================================
# Tebana - apply the pending database updates in ONE step.
# The token is used only inside this window (env var), never stored on disk,
# so it cannot be lost between "connect" and "apply".
#
#   powershell -ExecutionPolicy Bypass -File "C:\lovable\health-journey-global\supabase\apply_with_token.ps1"
# ============================================================================
$ErrorActionPreference = "Continue"
$ref = "wqrrwvaxovrjjiilqkmt"
Set-Location "C:\lovable\health-journey-global"
$migrations = @(
  "supabase\migrations\20261104120000_booking_timezone_and_doctor_defaults.sql",
  "supabase\migrations\20261104130000_identity_fixes_private_feedback_calls.sql"
)

Write-Host ""
Write-Host "=== Tebana: apply database updates ===" -ForegroundColor Cyan
Write-Host "1) Supabase -> Account -> Access Tokens -> 'Create legacy token'."
Write-Host "2) Copy the token shown once (starts with sbp_, about 44 characters)."
Write-Host "3) Paste it below (right-click pastes). Keep the token until this finishes."
Write-Host ""
Start-Process "https://supabase.com/dashboard/account/tokens"

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
  $out = & cmd /c "npx -y supabase@3.0.0 db query --remote=$ref -f `"$probe`" --yes 2>&1" | Out-String
  Remove-Item $probe -ErrorAction SilentlyContinue
  if ($out -notmatch "write-ok") {
    $msg = ($out -split "`n" | Select-String 'message' | Select-Object -First 1)
    Write-Host "This token cannot write to the database: $msg" -ForegroundColor Yellow
    Write-Host "Use 'Create legacy token' and paste the new sbp_ value." -ForegroundColor Yellow
    continue
  }
  Write-Host "Token OK (write access)." -ForegroundColor Green

  $failed = $false
  foreach ($file in $migrations) {
    Write-Host "`n>>> SQL: $file" -ForegroundColor Cyan
    & cmd /c "npx -y supabase@3.0.0 db query --remote=$ref -f `"$file`" --yes 2>&1"
    if ($LASTEXITCODE -ne 0) { Write-Host "FAILED: $file" -ForegroundColor Red; $failed = $true; break }
    Write-Host "OK: $file" -ForegroundColor Green
  }
  Remove-Item Env:SUPABASE_ACCESS_TOKEN -ErrorAction SilentlyContinue
  if ($failed) { Write-Host "`nSend Claude a screenshot of the red line." -ForegroundColor Red }
  else { Write-Host "`nDONE - all updates applied. Tell Claude 'تم'." -ForegroundColor Green }
  break
}
