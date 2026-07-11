[CmdletBinding()]
param(
  [switch]$RemoveData
)

$ErrorActionPreference = "Stop"
$InstallBase = Join-Path $env:LOCALAPPDATA "Programs"
$InstallRoot = Join-Path $InstallBase "QuotaDeck"
$DataRoot = Join-Path $env:LOCALAPPDATA "QuotaDeck"
$resolvedBase = [IO.Path]::GetFullPath($InstallBase)
$resolvedInstall = [IO.Path]::GetFullPath($InstallRoot)

if (-not $resolvedInstall.StartsWith($resolvedBase, [StringComparison]::OrdinalIgnoreCase)) {
  throw "Refusing to remove an unexpected installation path."
}

$pidFile = Join-Path $DataRoot "quota-deck.pid"
if (Test-Path -LiteralPath $pidFile) {
  $runningPid = 0
  [void][int]::TryParse((Get-Content -Raw -LiteralPath $pidFile).Trim(), [ref]$runningPid)
  if ($runningPid -gt 0) {
    $process = Get-CimInstance Win32_Process -Filter "ProcessId = $runningPid" -ErrorAction SilentlyContinue
    if ($process -and $process.CommandLine -match "QuotaDeck" -and $process.CommandLine -match "start\.mjs") {
      & taskkill.exe /PID $runningPid /T /F | Out-Null
    }
  }
}

Remove-Item -LiteralPath (Join-Path ([Environment]::GetFolderPath("Startup")) "Quota Deck.lnk") -Force -ErrorAction SilentlyContinue
Remove-Item -LiteralPath (Join-Path ([Environment]::GetFolderPath("Desktop")) "Quota Deck.url") -Force -ErrorAction SilentlyContinue
Remove-Item -LiteralPath (Join-Path ([Environment]::GetFolderPath("Programs")) "Quota Deck") -Recurse -Force -ErrorAction SilentlyContinue
Remove-Item -LiteralPath $InstallRoot -Recurse -Force -ErrorAction SilentlyContinue

if ($RemoveData) {
  $resolvedData = [IO.Path]::GetFullPath($DataRoot)
  $resolvedLocal = [IO.Path]::GetFullPath($env:LOCALAPPDATA)
  if ($resolvedData.StartsWith($resolvedLocal, [StringComparison]::OrdinalIgnoreCase)) {
    Remove-Item -LiteralPath $DataRoot -Recurse -Force -ErrorAction SilentlyContinue
  }
}

Write-Host "Quota Deck has been uninstalled." -ForegroundColor Green
if (-not $RemoveData) {
  Write-Host "Pairing data was kept in $DataRoot. Run with -RemoveData to delete it."
}
