[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
$Root = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
$Dist = [IO.Path]::GetFullPath((Join-Path $Root "dist"))
$Package = Get-Content -Raw -LiteralPath (Join-Path $Root "package.json") | ConvertFrom-Json
$Version = $Package.version
$ReleaseDirectory = Join-Path $Dist "GitHub-Release-v$Version"
$SourceDirectory = Join-Path $Dist "QuotaDeck-$Version-source"
$SourceZip = Join-Path $Dist "QuotaDeck-$Version-source.zip"
$ReleaseKit = Join-Path $Dist "QuotaDeck-$Version-GitHub-Release-Kit.zip"
$WindowsZip = Join-Path $Dist "QuotaDeck-$Version-win-x64.zip"

New-Item -ItemType Directory -Force -Path $Dist | Out-Null
foreach ($target in @($ReleaseDirectory, $SourceDirectory)) {
  $resolved = [IO.Path]::GetFullPath($target)
  if (-not $resolved.StartsWith($Dist, [StringComparison]::OrdinalIgnoreCase)) {
    throw "Refusing to prepare release content outside dist."
  }
  if (Test-Path -LiteralPath $resolved) {
    Remove-Item -LiteralPath $resolved -Recurse -Force
  }
}
foreach ($target in @($SourceZip, $ReleaseKit)) {
  if (Test-Path -LiteralPath $target) {
    Remove-Item -LiteralPath $target -Force
  }
}

if (-not (Test-Path -LiteralPath $WindowsZip)) {
  throw "Build the Windows release first with npm.cmd run build:windows."
}

New-Item -ItemType Directory -Force -Path $SourceDirectory, $ReleaseDirectory | Out-Null

$RootFiles = @(
  ".dockerignore",
  ".env.example",
  ".gitignore",
  "CHANGELOG.md",
  "compose.yaml",
  "Dockerfile",
  "GITHUB_RELEASE.md",
  "GITHUB_UPLOAD_INSTRUCTIONS.md",
  "Install-QuotaDeck.cmd",
  "LICENSE.txt",
  "LINKEDIN_LAUNCH_POST.md",
  "package.json",
  "README.md",
  "server.mjs",
  "start.mjs",
  "Uninstall-QuotaDeck.cmd"
)
foreach ($file in $RootFiles) {
  Copy-Item -LiteralPath (Join-Path $Root $file) -Destination (Join-Path $SourceDirectory $file)
}
foreach ($folder in @(".github", "collector", "examples", "installer", "lib", "public", "scripts", "test")) {
  Copy-Item -LiteralPath (Join-Path $Root $folder) -Destination (Join-Path $SourceDirectory $folder) -Recurse
}

Compress-Archive -LiteralPath $SourceDirectory -DestinationPath $SourceZip -CompressionLevel Optimal
Copy-Item -LiteralPath $WindowsZip -Destination $ReleaseDirectory
Copy-Item -LiteralPath $SourceZip -Destination $ReleaseDirectory
foreach ($file in @("GITHUB_RELEASE.md", "GITHUB_UPLOAD_INSTRUCTIONS.md", "LINKEDIN_LAUNCH_POST.md")) {
  Copy-Item -LiteralPath (Join-Path $Root $file) -Destination $ReleaseDirectory
}

$Artifacts = @(
  (Join-Path $ReleaseDirectory (Split-Path -Leaf $WindowsZip))
  (Join-Path $ReleaseDirectory (Split-Path -Leaf $SourceZip))
)
$HashLines = foreach ($artifact in $Artifacts) {
  $hash = (Get-FileHash -Algorithm SHA256 -LiteralPath $artifact).Hash.ToLowerInvariant()
  "$hash  $(Split-Path -Leaf $artifact)"
}
[IO.File]::WriteAllText(
  (Join-Path $ReleaseDirectory "SHA256SUMS.txt"),
  ($HashLines -join [Environment]::NewLine) + [Environment]::NewLine,
  [Text.Encoding]::ASCII
)

Compress-Archive -LiteralPath $ReleaseDirectory -DestinationPath $ReleaseKit -CompressionLevel Optimal
$KitHash = (Get-FileHash -Algorithm SHA256 -LiteralPath $ReleaseKit).Hash.ToLowerInvariant()
[IO.File]::WriteAllText(
  "$ReleaseKit.sha256",
  "$KitHash  $(Split-Path -Leaf $ReleaseKit)$([Environment]::NewLine)",
  [Text.Encoding]::ASCII
)

Remove-Item -LiteralPath $SourceDirectory -Recurse -Force

Write-Host "GitHub release kit created:" -ForegroundColor Green
Write-Host "  $ReleaseKit"
Write-Host "  SHA-256 $KitHash"
