# One-click deploy: mytabibi -> Cloudflare Workers
$ErrorActionPreference = "Stop"
$tokenLine = Get-Content c:\lovable\.cf_token | Select-String "TOKEN="
$env:CLOUDFLARE_API_TOKEN = $tokenLine.Line.Split("=", 2)[1].Trim()
$env:CLOUDFLARE_ACCOUNT_ID = "62c360ba860f029b8e20e20c0a933ced"

Push-Location $PSScriptRoot
try {
    Write-Host "=== BUILD ===" -ForegroundColor Cyan
    cmd /c "npm run build" | Out-Host
    if ($LASTEXITCODE -ne 0) { throw "Build failed" }

    Write-Host "=== DEPLOY ===" -ForegroundColor Cyan
    cmd /c "npx wrangler deploy" | Out-Host
    if ($LASTEXITCODE -ne 0) { throw "Deploy failed" }

    Write-Host "`nDONE. https://mytabibi.com" -ForegroundColor Green
}
finally {
    Pop-Location
}
