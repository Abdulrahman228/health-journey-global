# Apply migration via Supabase Management API (one-shot script).
$ErrorActionPreference = "Stop"
if (-not $env:SUPABASE_MANAGEMENT_TOKEN) {
  Write-Error "Set SUPABASE_MANAGEMENT_TOKEN env var."
  exit 1
}
$h = @{
  Authorization  = "Bearer $($env:SUPABASE_MANAGEMENT_TOKEN)"
  "Content-Type" = "application/json; charset=utf-8"
}
$sql = Get-Content -Raw -Path "supabase\migrations\20260606000000_refund_settlement.sql"
$payload = @{ query = $sql }
$body = ConvertTo-Json -InputObject $payload -Depth 10 -Compress
$bodyBytes = [System.Text.Encoding]::UTF8.GetBytes($body)
try {
  $r = Invoke-RestMethod -Method Post `
    -Uri 'https://api.supabase.com/v1/projects/wqrrwvaxovrjjiilqkmt/database/query' `
    -Headers $h -Body $bodyBytes
  Write-Host "MIGRATION_OK"
  $r | ConvertTo-Json -Depth 5
} catch {
  Write-Host "MIGRATION_FAIL"
  Write-Host $_.Exception.Message
  if ($_.Exception.Response) {
    $reader = New-Object IO.StreamReader($_.Exception.Response.GetResponseStream())
    Write-Host $reader.ReadToEnd()
  }
}
