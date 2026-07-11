[CmdletBinding()]
param(
  [switch]$NoLaunch
)

$ErrorActionPreference = "Stop"
$PackageRoot = Split-Path -Parent $PSScriptRoot
$InstallBase = Join-Path $env:LOCALAPPDATA "Programs"
$InstallRoot = Join-Path $InstallBase "QuotaDeck"
$DataRoot = Join-Path $env:LOCALAPPDATA "QuotaDeck"

if (-not (Test-Path -LiteralPath (Join-Path $PackageRoot "runtime\node.exe"))) {
  throw "The bundled Node runtime is missing. Download the complete Windows release ZIP."
}
if (-not (Test-Path -LiteralPath (Join-Path $PackageRoot "app\start.mjs"))) {
  throw "The Quota Deck application files are missing."
}

$resolvedBase = [IO.Path]::GetFullPath($InstallBase)
$resolvedInstall = [IO.Path]::GetFullPath($InstallRoot)
if (-not $resolvedInstall.StartsWith($resolvedBase, [StringComparison]::OrdinalIgnoreCase)) {
  throw "Refusing to install outside the per-user Programs directory."
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

New-Item -ItemType Directory -Force -Path $InstallRoot, $DataRoot | Out-Null
foreach ($folder in @("app", "runtime", "installer")) {
  $target = Join-Path $InstallRoot $folder
  if (Test-Path -LiteralPath $target) {
    Remove-Item -LiteralPath $target -Recurse -Force
  }
  Copy-Item -LiteralPath (Join-Path $PackageRoot $folder) -Destination $target -Recurse
}

$launcherCmd = @'
@echo off
cd /d "%~dp0app"
"%~dp0runtime\node.exe" start.mjs >> "%LOCALAPPDATA%\QuotaDeck\quota-deck.log" 2>&1
'@
[IO.File]::WriteAllText((Join-Path $InstallRoot "launcher.cmd"), $launcherCmd, [Text.Encoding]::ASCII)

$escapedLauncher = (Join-Path $InstallRoot "launcher.cmd").Replace('"', '""')
$escapedRoot = $InstallRoot.Replace('"', '""')
$launcherVbs = @"
Set shell = CreateObject("WScript.Shell")
shell.CurrentDirectory = "$escapedRoot"
shell.Run Chr(34) & "$escapedLauncher" & Chr(34), 0, False
"@
[IO.File]::WriteAllText((Join-Path $InstallRoot "launcher.vbs"), $launcherVbs, [Text.Encoding]::ASCII)

$shell = New-Object -ComObject WScript.Shell
$startup = [Environment]::GetFolderPath("Startup")
$startupShortcut = $shell.CreateShortcut((Join-Path $startup "Quota Deck.lnk"))
$startupShortcut.TargetPath = (Join-Path $env:WINDIR "System32\wscript.exe")
$startupShortcut.Arguments = '"' + (Join-Path $InstallRoot "launcher.vbs") + '"'
$startupShortcut.WorkingDirectory = $InstallRoot
$startupShortcut.Description = "Start Quota Deck in the background"
$startupShortcut.Save()

$desktop = [Environment]::GetFolderPath("Desktop")
$openUrl = @'
[InternetShortcut]
URL=http://localhost:4173/
IconIndex=0
'@
[IO.File]::WriteAllText((Join-Path $desktop "Quota Deck.url"), $openUrl, [Text.Encoding]::ASCII)

$startMenu = Join-Path ([Environment]::GetFolderPath("Programs")) "Quota Deck"
New-Item -ItemType Directory -Force -Path $startMenu | Out-Null
[IO.File]::WriteAllText((Join-Path $startMenu "Open Quota Deck.url"), $openUrl, [Text.Encoding]::ASCII)

$uninstallShortcut = $shell.CreateShortcut((Join-Path $startMenu "Uninstall Quota Deck.lnk"))
$uninstallShortcut.TargetPath = (Join-Path $PSHOME "powershell.exe")
$uninstallShortcut.Arguments = '-NoProfile -ExecutionPolicy Bypass -File "' + (Join-Path $InstallRoot "installer\Uninstall-QuotaDeck.ps1") + '"'
$uninstallShortcut.WorkingDirectory = $InstallRoot
$uninstallShortcut.Description = "Uninstall Quota Deck"
$uninstallShortcut.Save()

Start-Process -FilePath (Join-Path $env:WINDIR "System32\wscript.exe") -ArgumentList ('"' + (Join-Path $InstallRoot "launcher.vbs") + '"') -WindowStyle Hidden

$ready = $false
for ($attempt = 0; $attempt -lt 30; $attempt += 1) {
  Start-Sleep -Milliseconds 500
  try {
    $health = Invoke-RestMethod -Uri "http://localhost:4173/api/health" -TimeoutSec 1
    if ($health.ok) {
      $ready = $true
      break
    }
  } catch {}
}

if (-not $ready) {
  throw "Quota Deck was installed but did not start. Check $DataRoot\quota-deck.log."
}

if (-not $NoLaunch) {
  Start-Process "http://localhost:4173/"
}

Write-Host ""
Write-Host "Quota Deck is installed." -ForegroundColor Green
Write-Host "It will start automatically when you sign in."
Write-Host "Open it from the desktop or Start menu to pair a phone."
