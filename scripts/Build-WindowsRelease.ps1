[CmdletBinding()]
param(
  [string]$OutputDirectory = "",
  [string]$RuntimePath = ""
)

$ErrorActionPreference = "Stop"
$Root = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
if (-not $OutputDirectory) {
  $OutputDirectory = Join-Path $Root "dist"
}
$OutputDirectory = [IO.Path]::GetFullPath($OutputDirectory)

if (-not $RuntimePath) {
  $RuntimePath = (Get-Command node -ErrorAction Stop).Source
}
$RuntimePath = [IO.Path]::GetFullPath($RuntimePath)
if (-not (Test-Path -LiteralPath $RuntimePath -PathType Leaf)) {
  throw "Node runtime not found at $RuntimePath"
}

$architecture = (& $RuntimePath -p "process.arch").Trim()
if ($architecture -ne "x64") {
  throw "The Windows alpha package currently supports x64. Found runtime architecture: $architecture"
}

$package = Get-Content -Raw -LiteralPath (Join-Path $Root "package.json") | ConvertFrom-Json
$releaseName = "QuotaDeck-$($package.version)-win-x64"
$staging = Join-Path $OutputDirectory $releaseName
$zipPath = Join-Path $OutputDirectory "$releaseName.zip"

New-Item -ItemType Directory -Force -Path $OutputDirectory | Out-Null
$resolvedOutput = [IO.Path]::GetFullPath($OutputDirectory)
$resolvedStaging = [IO.Path]::GetFullPath($staging)
if (-not $resolvedStaging.StartsWith($resolvedOutput, [StringComparison]::OrdinalIgnoreCase)) {
  throw "Refusing to prepare a release outside the selected output directory."
}
if (Test-Path -LiteralPath $staging) {
  Remove-Item -LiteralPath $staging -Recurse -Force
}
if (Test-Path -LiteralPath $zipPath) {
  Remove-Item -LiteralPath $zipPath -Force
}

$appRoot = Join-Path $staging "app"
$runtimeRoot = Join-Path $staging "runtime"
$installerRoot = Join-Path $staging "installer"
New-Item -ItemType Directory -Force -Path $appRoot, $runtimeRoot, $installerRoot | Out-Null

foreach ($file in @("package.json", "server.mjs", "start.mjs")) {
  Copy-Item -LiteralPath (Join-Path $Root $file) -Destination (Join-Path $appRoot $file)
}
foreach ($folder in @("collector", "lib", "public")) {
  Copy-Item -LiteralPath (Join-Path $Root $folder) -Destination (Join-Path $appRoot $folder) -Recurse
}
foreach ($file in @("Install-QuotaDeck.ps1", "Uninstall-QuotaDeck.ps1")) {
  Copy-Item -LiteralPath (Join-Path $Root "installer\$file") -Destination (Join-Path $installerRoot $file)
}
foreach ($file in @("Install-QuotaDeck.cmd", "Uninstall-QuotaDeck.cmd", "README.md", "LICENSE.txt", "CHANGELOG.md")) {
  Copy-Item -LiteralPath (Join-Path $Root $file) -Destination (Join-Path $staging $file)
}
Copy-Item -LiteralPath $RuntimePath -Destination (Join-Path $runtimeRoot "node.exe")

$releaseInfo = [ordered]@{
  name = "Quota Deck"
  version = $package.version
  platform = "win32"
  architecture = "x64"
  node = (& $RuntimePath --version).Trim()
  builtAt = [DateTime]::UtcNow.ToString("o")
}
$releaseInfo | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $staging "release.json") -Encoding UTF8

Compress-Archive -LiteralPath $staging -DestinationPath $zipPath -CompressionLevel Optimal
$hash = (Get-FileHash -Algorithm SHA256 -LiteralPath $zipPath).Hash.ToLowerInvariant()
$hashLine = "$hash  $([IO.Path]::GetFileName($zipPath))" + [Environment]::NewLine
[IO.File]::WriteAllText("$zipPath.sha256", $hashLine, [Text.Encoding]::ASCII)

Write-Host ""
Write-Host "Release created:" -ForegroundColor Green
Write-Host "  $zipPath"
Write-Host "  SHA-256 $hash"
