$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$python = Join-Path $root "venv\Scripts\python.exe"
$mobile = Join-Path $root "servista-mobile"
$ipAddress = (
  Get-NetIPAddress -AddressFamily IPv4 |
    Where-Object {
      $_.IPAddress -notlike "127.*" -and
      $_.IPAddress -notlike "169.254.*" -and
      $_.AddressState -eq "Preferred"
    } |
    Sort-Object @{ Expression = { if ($_.InterfaceAlias -eq "Wi-Fi") { 0 } else { 1 } } }, InterfaceAlias |
    Select-Object -First 1 -ExpandProperty IPAddress
)

if (-not $ipAddress) {
  throw "Could not detect your computer IPv4 address. Connect to WiFi/hotspot and try again."
}

$env:EXPO_PUBLIC_API_BASE_URL = "http://$ipAddress`:8000"

Write-Host "Starting SERVISTA backend on 0.0.0.0:8000..."
Start-Process `
  -FilePath $python `
  -ArgumentList "manage.py", "runserver", "0.0.0.0:8000" `
  -WorkingDirectory $root `
  -WindowStyle Hidden

Write-Host "Starting Expo with cache cleared..."
Write-Host "Mobile API URL: $env:EXPO_PUBLIC_API_BASE_URL"
Set-Location $mobile
npx expo start --host lan -c
