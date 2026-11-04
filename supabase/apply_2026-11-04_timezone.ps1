# ============================================================================
# Tebana - booking times in the clinic's timezone + honest doctor defaults.
# Applies TWO migrations: 20261104120000_booking_timezone_and_doctor_defaults.sql + 20261104130000_identity_fixes_private_feedback_calls.sql
# (dry-run on production inside BEGIN..ROLLBACK passed on 2026-11-04).
#
# Run from PowerShell (any folder):
#   powershell -ExecutionPolicy Bypass -File "C:\lovable\health-journey-global\supabase\apply_2026-11-04_timezone.ps1"
# ============================================================================
$ErrorActionPreference = "Continue"
$ref  = "wqrrwvaxovrjjiilqkmt"
Set-Location "C:\lovable\health-journey-global"
foreach ($file in @(
    "supabase\migrations\20261104120000_booking_timezone_and_doctor_defaults.sql",
    "supabase\migrations\20261104130000_identity_fixes_private_feedback_calls.sql"
)) {
  Write-Host "`n>>> SQL: $file" -ForegroundColor Cyan
  & cmd /c "npx supabase@3.0.0 db query --remote=$ref -f `"$file`" --yes 2>&1"
  if ($LASTEXITCODE -ne 0) { Write-Host "FAILED: $file" -ForegroundColor Red; exit 1 }
  Write-Host "OK: $file" -ForegroundColor Green
}
Write-Host "`nDONE: booking times use the clinic timezone; private notes and call sessions fixed." -ForegroundColor Green
Write-Host "Tell Claude 'تم' so it re-tests booking on the emulator." -ForegroundColor Green
