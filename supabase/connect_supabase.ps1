$Host.UI.RawUI.WindowTitle = "Tebana - Supabase token (write)"
Set-Location "C:\lovable\health-journey-global"
$ref = "wqrrwvaxovrjjiilqkmt"
Write-Host ""
Write-Host "=== Tebana: Supabase token with WRITE access ===" -ForegroundColor Cyan
Write-Host "The previous token could only READ the database. Create a new one:"
Write-Host "  - Resource access: Project -> your organization -> project $ref"
Write-Host "  - Permissions: Database = Read & write, Edge Functions = Read & write,"
Write-Host "    Secrets = Read & write, Project = Read   (or simply: Create legacy token)"
Write-Host "Then paste it below (starts with sbp_) and press Enter."
Write-Host ""
Start-Process "https://supabase.com/dashboard/account/tokens"
$probe = Join-Path $env:TEMP "tebana_write_probe.sql"
[IO.File]::WriteAllText($probe, "select 'write-ok' as probe;", (New-Object System.Text.UTF8Encoding($false)))
for ($try = 1; $try -le 5; $try++) {
  $sec = Read-Host "Paste token here (input is hidden)" -AsSecureString
  $tok = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec)).Trim()
  if ($tok -notmatch '^sbp_[A-Za-z0-9_]+$') { Write-Host "Must start with sbp_. Try again." -ForegroundColor Yellow; continue }
  & cmd /c "npx -y supabase@3.0.0 login --token $tok 2>&1" | Out-Null
  $out = & cmd /c "npx -y supabase@3.0.0 db query --remote=$ref -f `"$probe`" --yes 2>&1" | Out-String
  if ($out -match "write-ok") {
    Write-Host ""
    Write-Host "CONNECTED WITH WRITE ACCESS." -ForegroundColor Green
    Write-Host "Now run:" -ForegroundColor Green
    Write-Host "  powershell -ExecutionPolicy Bypass -File `"C:\lovable\health-journey-global\supabase\apply_2026-11-03.ps1`""
    Write-Host "  powershell -ExecutionPolicy Bypass -File `"C:\lovable\health-journey-global\deploy_web.ps1`""
    break
  } else {
    Write-Host "This token still cannot WRITE to the database (Supabase said: $(($out -split "`n" | Select-String 'message' | Select-Object -First 1)))" -ForegroundColor Yellow
    Write-Host "Generate another token with Database = Read & write (or a legacy token) and paste it." -ForegroundColor Yellow
  }
}
Remove-Item $probe -ErrorAction SilentlyContinue
