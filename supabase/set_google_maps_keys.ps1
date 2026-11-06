$Host.UI.RawUI.WindowTitle = "Tebana - Google Maps keys"
# ============================================================================
# Tebana - install the two Google Maps keys in one step.
#   1) Browser key -> .env VITE_GOOGLE_MAPS_BROWSER_KEY, then rebuild + deploy the website
#                     (maps, clinic search and "near me" on mytabibi.com).
#   2) Server key  -> Supabase secret PLACES_API_KEY (places-search function, used by the
#                     Android / iOS apps when a doctor looks up the clinic on Google Maps).
# Keys are read hidden and never printed. Press Enter on a prompt to skip that key.
#
#   powershell -ExecutionPolicy Bypass -File "C:\lovable\health-journey-global\supabase\set_google_maps_keys.ps1"
# ============================================================================
$ErrorActionPreference = "Continue"
$ref  = "wqrrwvaxovrjjiilqkmt"
$root = "C:\lovable\health-journey-global"
Set-Location $root

Write-Host ""
Write-Host "=== Tebana: Google Maps keys ===" -ForegroundColor Cyan
Write-Host "First, in Google Cloud Console (one project):"
Write-Host "  a) Billing -> link a billing account to the project."
Write-Host "  b) APIs -> enable: Maps JavaScript API, Places API (New), Geocoding API."
Write-Host "  c) Credentials -> create 2 API keys:"
Write-Host "     Browser key: Websites = https://mytabibi.com/*  and  https://*.mytabibi.com/*"
Write-Host "                  APIs     = Maps JavaScript API, Places API (New), Geocoding API"
Write-Host "     Server key:  Application restriction = None"
Write-Host "                  APIs     = Places API (New)"
Write-Host ""
Start-Process "https://console.cloud.google.com/google/maps-apis/credentials"

function Read-Hidden([string]$prompt) {
  $sec = Read-Host $prompt -AsSecureString
  $v = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($sec))
  # Keep visible ASCII only (copying from an Arabic page adds invisible RTL marks).
  return ($v -replace '[^!-~]', '')
}
function Test-GoogleKey([string]$k) {
  if ($k -notmatch '^AIza[0-9A-Za-z_\-]{35}$') {
    $head = if ($k.Length -ge 4) { $k.Substring(0, 4) } else { $k }
    Write-Host ("Not a Google API key (length {0}, starts with '{1}'). Keys start with AIza and are 39 characters." -f $k.Length, $head) -ForegroundColor Yellow
    return $false
  }
  return $true
}

# ---------------------------------------------------------------- server key
$deployWeb = $false
$server = Read-Hidden "SERVER key (Places API New) - paste, or Enter to skip"
if ($server) {
  if (Test-GoogleKey $server) {
    Write-Host "Testing the server key directly with Google..." -ForegroundColor Cyan
    try {
      $body = '{"input":"Tahrir Square Cairo","languageCode":"ar","regionCode":"EG"}'
      $r = Invoke-RestMethod -Method Post -Uri "https://places.googleapis.com/v1/places:autocomplete" `
        -Headers @{ "X-Goog-Api-Key" = $server } -ContentType "application/json; charset=utf-8" -Body $body
      Write-Host ("Google answered OK ({0} suggestions)." -f @($r.suggestions).Count) -ForegroundColor Green
      $tok = Read-Hidden "Supabase access token (sbp_...) to save it as PLACES_API_KEY"
      if ($tok -notmatch '^sbp_\S+$') {
        Write-Host "That is not an sbp_ token - server key NOT saved." -ForegroundColor Yellow
      } else {
        $env:SUPABASE_ACCESS_TOKEN = $tok
        $out = & cmd /c "npx -y supabase@3.0.0 secrets set PLACES_API_KEY=$server --project-ref $ref 2>&1" | Out-String
        Remove-Item Env:SUPABASE_ACCESS_TOKEN -ErrorAction SilentlyContinue
        if ($LASTEXITCODE -eq 0) { Write-Host "Saved: Supabase secret PLACES_API_KEY." -ForegroundColor Green }
        else { Write-Host ($out -replace [regex]::Escape($server), "AIza***") ; Write-Host "FAILED to save the server key." -ForegroundColor Red }
      }
    } catch {
      $msg = $_.ErrorDetails.Message
      if (-not $msg) { $msg = $_.Exception.Message }
      Write-Host "Google rejected the server key:" -ForegroundColor Red
      Write-Host $msg
      Write-Host "Check billing, that 'Places API (New)' is enabled, and the key's API restriction." -ForegroundColor Yellow
    }
  }
}

# --------------------------------------------------------------- browser key
$browser = Read-Hidden "BROWSER key (website) - paste, or Enter to skip"
if ($browser -and (Test-GoogleKey $browser)) {
  $envFile = Join-Path $root ".env"
  $lines = @()
  if (Test-Path $envFile) { $lines = Get-Content $envFile -Encoding UTF8 | Where-Object { $_ -notmatch '^VITE_GOOGLE_MAPS_BROWSER_KEY=' } }
  $lines += "VITE_GOOGLE_MAPS_BROWSER_KEY=$browser"
  [IO.File]::WriteAllText($envFile, (($lines -join "`n") + "`n"), (New-Object System.Text.UTF8Encoding($false)))
  Write-Host "Saved the browser key in .env (VITE_GOOGLE_MAPS_BROWSER_KEY)." -ForegroundColor Green
  $deployWeb = $true
}

if ($deployWeb) {
  Write-Host "`nRebuilding and deploying the website with the new key..." -ForegroundColor Cyan
  & powershell -ExecutionPolicy Bypass -File (Join-Path $root "deploy_web.ps1")
}
Write-Host "`nDONE - tell Claude 'تم' so it re-tests the maps." -ForegroundColor Green
