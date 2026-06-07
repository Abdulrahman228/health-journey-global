# Verifies the 3 Resend DNS records exist on mytabibi.com from a public
# resolver before clicking Verify in the Resend dashboard.
#
# Usage:  powershell -ExecutionPolicy Bypass -File scripts\verify-resend-dns.ps1

$ErrorActionPreference = 'Stop'

$expected = @(
  @{
    Label = 'DKIM'
    Name  = 'resend._domainkey.mytabibi.com'
    Type  = 'TXT'
    Match = 'p=MIGfMA0GCSqGSIb3DQEBAQUAA4GNADCBiQKBgQClk4A'
  },
  @{
    Label = 'MX  '
    Name  = 'send.mytabibi.com'
    Type  = 'MX'
    Match = 'feedback-smtp.eu-west-1.amazonses.com'
  },
  @{
    Label = 'SPF '
    Name  = 'send.mytabibi.com'
    Type  = 'TXT'
    Match = 'v=spf1 include:amazonses.com'
  }
)

# Use Google Public DNS over HTTPS. mytabibi.com is hosted on Hostinger's
# nameservers (ns1/ns2.dns-parking.com), so Google DNS reflects the public
# state of the records once Hostinger publishes them.
function Resolve-Dns {
  param([string]$Name, [string]$Type)
  $url = "https://dns.google/resolve?name=$Name&type=$Type"
  try {
    $r = Invoke-RestMethod -Uri $url -TimeoutSec 10
    if (-not $r.Answer) { return @() }
    return $r.Answer | ForEach-Object { $_.data }
  } catch {
    return @()
  }
}

Write-Host ""
Write-Host "Verifying Resend DNS records on mytabibi.com..." -ForegroundColor Cyan
Write-Host ""

$allOk = $true
foreach ($rec in $expected) {
  $answers = Resolve-Dns -Name $rec.Name -Type $rec.Type
  $hit = $answers | Where-Object { $_ -match [regex]::Escape($rec.Match) }
  if ($hit) {
    $first = ($hit | Select-Object -First 1).ToString()
    if ($first.Length -gt 80) { $first = $first.Substring(0, 77) + '...' }
    Write-Host ("  [OK]    {0} {1} -> {2}" -f $rec.Label, $rec.Type, $first) -ForegroundColor Green
  } else {
    Write-Host ("  [MISS]  {0} {1} on {2}" -f $rec.Label, $rec.Type, $rec.Name) -ForegroundColor Red
    if ($answers.Count -gt 0) {
      Write-Host ("           (got: {0})" -f ($answers -join ' | ')) -ForegroundColor DarkGray
    }
    $allOk = $false
  }
}

Write-Host ""
if ($allOk) {
  Write-Host "All 3 records present. You can now click Verify in the Resend dashboard." -ForegroundColor Green
  exit 0
} else {
  Write-Host "Some records are missing. Re-check the values in your DNS provider, then re-run." -ForegroundColor Yellow
  Write-Host "Tip: in Hostinger DNS, Name should be 'send' or 'resend._domainkey' (no domain suffix)." -ForegroundColor DarkGray
  exit 1
}
