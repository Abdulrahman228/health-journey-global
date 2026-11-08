$Host.UI.RawUI.WindowTitle = "Tebana - maps on OpenStreetMap"
# ============================================================================
# 2026-11-08: maps and clinic address search moved from Google to OpenStreetMap
# (no Google Cloud account, key or billing needed).
#   1) deploys the rewritten places-search edge function (used by web, Android, iOS)
#   2) publishes the website (Leaflet map, address picker)
#
#   powershell -ExecutionPolicy Bypass -File "C:\lovable\health-journey-global\supabase\apply_osm_maps.ps1"
# ============================================================================
$ErrorActionPreference = "Continue"
$ref = "wqrrwvaxovrjjiilqkmt"
Set-Location "C:\lovable\health-journey-global"

Write-Host ""
Write-Host "=== Tebana: maps on OpenStreetMap ===" -ForegroundColor Cyan
Write-Host "Paste a Supabase access token (sbp_...). Create one at the page that opens."
Start-Process "https://supabase.com/dashboard/account/tokens"

$deployed = $false
for ($try = 1; $try -le 5; $try++) {
  $sec = Read-Host "Paste token here (input is hidden)" -AsSecureString
  $tok = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec))
  $tok = ($tok -replace '[^!-~]', '')
  if ($tok -notmatch '^sbp_\S+$') { Write-Host "Not an access token (must start with sbp_)." -ForegroundColor Yellow; continue }
  $env:SUPABASE_ACCESS_TOKEN = $tok

  Write-Host "`n>>> Deploying function: places-search" -ForegroundColor Cyan
  $out = & cmd /c "npx -y supabase@3.0.0 functions deploy places-search --remote=$ref --yes 2>&1" | Out-String
  Remove-Item Env:SUPABASE_ACCESS_TOKEN -ErrorAction SilentlyContinue
  if ($LASTEXITCODE -ne 0) { Write-Host $out; Write-Host "FAILED to deploy places-search" -ForegroundColor Red; break }
  Write-Host "OK: places-search" -ForegroundColor Green
  $deployed = $true
  break
}

if ($deployed) {
  Write-Host "`n>>> Publishing the website" -ForegroundColor Cyan
  & powershell -ExecutionPolicy Bypass -File "C:\lovable\health-journey-global\deploy_web.ps1"
  if ($LASTEXITCODE -ne 0) { Write-Host "Website deploy reported an error - send Claude a screenshot." -ForegroundColor Red }
  else { Write-Host "`nDONE - maps are live on OpenStreetMap. Tell Claude 'تم'." -ForegroundColor Green }
}
