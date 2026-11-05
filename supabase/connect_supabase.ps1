$Host.UI.RawUI.WindowTitle = "Tebana - Supabase token (write)"
Set-Location "C:\lovable\health-journey-global"
$ref = "wqrrwvaxovrjjiilqkmt"
Write-Host ""
Write-Host "=== Tebana: Supabase ACCESS TOKEN with write access ===" -ForegroundColor Cyan
Write-Host "Page: supabase.com/dashboard/account/tokens  (Account -> Access Tokens)"
Write-Host "Easiest: click 'Create legacy token' (or 'Generate new token' with"
Write-Host "Database / Edge Functions / Secrets = Read & write, Project = Read)."
Write-Host "After Generate, a box shows the token ONCE: it starts with sbp_ and is"
Write-Host "about 44 characters. Copy THAT value."
Write-Host "NOT the keys under Project Settings -> API (eyJ... or sb_secret_...)." -ForegroundColor Yellow
Write-Host ""
Start-Process "https://supabase.com/dashboard/account/tokens"
$probe = Join-Path $env:TEMP "tebana_write_probe.sql"
[IO.File]::WriteAllText($probe, "select 'write-ok' as probe;", (New-Object System.Text.UTF8Encoding($false)))
for ($try = 1; $try -le 6; $try++) {
  $sec = Read-Host "Paste token here (input is hidden)" -AsSecureString
  $tok = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec))
  $tok = ($tok -replace '\s', '')
  if ($tok -notmatch '^sbp_\S+$') {
    $kind = "unknown"
    if ($tok.StartsWith("eyJ")) { $kind = "a JWT API key (anon / service_role) from Project Settings -> API" }
    elseif ($tok.StartsWith("sb_secret_")) { $kind = "a project SECRET key from Project Settings -> API" }
    elseif ($tok.StartsWith("sb_publishable_")) { $kind = "a project PUBLISHABLE key" }
    elseif ($tok.Length -eq 0) { $kind = "empty (nothing was pasted - try right-click to paste)" }
    Write-Host ("That is not an access token: it looks like {0} (length {1})." -f $kind, $tok.Length) -ForegroundColor Yellow
    Write-Host "Go to Account -> Access Tokens, generate a token, copy the sbp_... value." -ForegroundColor Yellow
    continue
  }
  & cmd /c "npx -y supabase@3.0.0 login --token $tok 2>&1" | Out-Null
  $out = & cmd /c "npx -y supabase@3.0.0 db query --remote=$ref -f `"$probe`" --yes 2>&1" | Out-String
  if ($out -match "write-ok") {
    Write-Host ""
    Write-Host "CONNECTED WITH WRITE ACCESS." -ForegroundColor Green
    Write-Host "Now run:" -ForegroundColor Green
    Write-Host "  powershell -ExecutionPolicy Bypass -File `"C:\lovable\health-journey-global\supabase\apply_2026-11-04_timezone.ps1`""
    break
  } else {
    $msg = ($out -split "`n" | Select-String 'message' | Select-Object -First 1)
    Write-Host "Token saved but it cannot WRITE to the database: $msg" -ForegroundColor Yellow
    Write-Host "Use 'Create legacy token', or give Database = Read & write, then paste again." -ForegroundColor Yellow
  }
}
Remove-Item $probe -ErrorAction SilentlyContinue
