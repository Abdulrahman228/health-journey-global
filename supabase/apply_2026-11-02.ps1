# ============================================================================
# Tebana — apply the 4 unapplied migrations, deploy the two fixed edge
# functions and set the push secret. (The security hardening SQL is already
# applied; it is re-run first anyway because it is idempotent.)
#
# Run from PowerShell (any folder):
#   powershell -ExecutionPolicy Bypass -File "C:\lovable\health-journey-global\supabase\apply_2026-11-02.ps1"
#
# Requires: `npx supabase login` done once (already done on this machine).
# Native commands print progress on stderr, so we do NOT use ErrorAction=Stop;
# each step is checked through its exit code instead.
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

function Object-Exists([string]$sql) {
  $out = & cmd /c "npx supabase@3.0.0 db query --remote=$ref --read-only --output-format json `"$sql`" 2>&1"
  return (($out -join "`n") -match '"exists"\s*:\s*true')
}

# 1) Security hardening (idempotent, already applied — harmless to re-run) ----
Run-Sql "supabase\migrations\20261102100000_security_hardening.sql"

# 2) Feature migrations that were never applied to the live project ----------
$pending = @(
  @{ file = "supabase\migrations\20260717070000_emergency_queue.sql";
     check = "select to_regprocedure('public.flag_emergency_appointment(uuid)') is not null as exists" },
  @{ file = "supabase\migrations\20260717090000_missing_drugs.sql";
     check = "select to_regclass('public.missing_drugs') is not null as exists" },
  @{ file = "supabase\migrations\20260720010000_waiting_room_and_doctor_followup.sql";
     check = "select to_regprocedure('public.doctor_today_queue_stats()') is not null as exists" },
  @{ file = "supabase\migrations\20260721000000_doctor_referrals.sql";
     check = "select to_regclass('public.doctor_referrals') is not null as exists" }
)
foreach ($m in $pending) {
  if (Object-Exists $m.check) {
    Write-Host ">>> already applied, skipping: $($m.file)" -ForegroundColor DarkGray
  } else {
    Run-Sql $m.file
  }
}

# 3) Edge functions ------------------------------------------------------------
foreach ($fn in @("livekit-token", "send-push")) {
  Write-Host "`n>>> deploying edge function: $fn" -ForegroundColor Cyan
  & cmd /c "npx supabase@3.0.0 functions deploy $fn --remote=$ref --yes 2>&1"
  if ($LASTEXITCODE -ne 0) { Write-Host "FAILED: deploy $fn" -ForegroundColor Red; exit 1 }
  Write-Host "OK: $fn deployed" -ForegroundColor Green
}

# 4) Push webhook secret (random, stored locally in .dev.vars which is git-ignored)
$chars  = [char[]]((48..57) + (65..90) + (97..122))
$secret = -join (1..40 | ForEach-Object { $chars[(Get-Random -Maximum $chars.Length)] })
& cmd /c "npx supabase@3.0.0 secrets set PUSH_WEBHOOK_SECRET=$secret --remote=$ref --yes 2>&1"
if ($LASTEXITCODE -ne 0) { Write-Host "FAILED: secrets set" -ForegroundColor Red; exit 1 }
Add-Content -Path "$root\.dev.vars" -Value "PUSH_WEBHOOK_SECRET=$secret" -Encoding utf8
Write-Host ">>> PUSH_WEBHOOK_SECRET set on Supabase and saved to .dev.vars (local only)" -ForegroundColor Green

Write-Host "`nALL DONE - tell Claude 'تم' so it can re-run the verification." -ForegroundColor Green
