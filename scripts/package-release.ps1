# Empacota o N2 para Windows x64 em release/n2-windows-x64.zip
#
# Uso:
#   powershell -ExecutionPolicy Bypass -File scripts/package-release.ps1
#   powershell -ExecutionPolicy Bypass -File scripts/package-release.ps1 -SkipBuild -NodeExe C:\node\node.exe
#
# O zip final contem:
#   node.exe, dist/, server/dist/server.cjs, start.bat, README.txt, LICENSE.txt

param(
  [string]$NodeExe = "",
  [switch]$SkipBuild,
  [string]$OutDir = "release",
  [string]$Version = ""
)

$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$Root = Split-Path -Parent $ScriptDir
$ReleaseDir = Join-Path $Root $OutDir
$StageName = "n2-windows-x64"
$Stage = Join-Path $ReleaseDir $StageName
$ZipPath = Join-Path $ReleaseDir "$StageName.zip"
$HashPath = "$ZipPath.sha256"

function Write-Step([string]$Message) {
  Write-Host "==> $Message" -ForegroundColor Magenta
}

function Fail([string]$Message) {
  Write-Host "[erro] $Message" -ForegroundColor Red
  exit 1
}

if (-not $Version) {
  $pkg = Get-Content (Join-Path $Root "package.json") -Raw | ConvertFrom-Json
  $Version = $pkg.version
}

Push-Location $Root
try {
  if (-not $SkipBuild) {
    Write-Step "Compilando frontend e bridge (npm run build:all)"
    & npm.cmd run build:all
    if ($LASTEXITCODE -ne 0) { Fail "npm run build:all falhou." }
  }

  $distIndex = Join-Path $Root "dist\index.html"
  $serverCjs = Join-Path $Root "server\dist\server.cjs"
  if (-not (Test-Path $distIndex)) { Fail "dist/index.html nao encontrado. Rode npm run build." }
  if (-not (Test-Path $serverCjs)) { Fail "server/dist/server.cjs nao encontrado. Rode npm run build:server." }

  if (-not $NodeExe) {
    $candidates = @(
      (Join-Path $Root ".tools\node\node.exe"),
      (Join-Path $Root "node.exe")
    )
    foreach ($candidate in $candidates) {
      if (Test-Path $candidate) { $NodeExe = $candidate; break }
    }
  }
  if (-not $NodeExe) {
    $cmd = Get-Command node -ErrorAction SilentlyContinue
    if ($cmd) { $NodeExe = $cmd.Source }
  }
  if (-not $NodeExe -or -not (Test-Path $NodeExe)) {
    Fail "node.exe nao encontrado. Informe -NodeExe caminho\para\node.exe."
  }
  Write-Step "Runtime Node: $NodeExe"

  Write-Step "Preparando $StageName (v$Version)"
  if (Test-Path $Stage) { Remove-Item $Stage -Recurse -Force }
  New-Item -ItemType Directory -Path $Stage -Force | Out-Null

  Copy-Item (Join-Path $Root "dist") (Join-Path $Stage "dist") -Recurse
  New-Item -ItemType Directory -Path (Join-Path $Stage "server\dist") -Force | Out-Null
  Copy-Item $serverCjs (Join-Path $Stage "server\dist\server.cjs")
  Copy-Item $NodeExe (Join-Path $Stage "node.exe")
  Copy-Item (Join-Path $Root "scripts\start-release.bat") (Join-Path $Stage "start.bat")
  Copy-Item (Join-Path $Root "scripts\RELEASE-README.txt") (Join-Path $Stage "README.txt")
  Copy-Item (Join-Path $Root "LICENSE") (Join-Path $Stage "LICENSE.txt")

  Write-Step "Compactando $ZipPath"
  if (Test-Path $ZipPath) { Remove-Item $ZipPath -Force }
  Compress-Archive -Path (Join-Path $Stage "*") -DestinationPath $ZipPath -CompressionLevel Optimal

  $hash = (Get-FileHash $ZipPath -Algorithm SHA256).Hash.ToLower()
  "$hash  $StageName.zip" | Set-Content $HashPath -Encoding ASCII

  $sizeMb = [math]::Round((Get-Item $ZipPath).Length / 1MB, 2)
  Write-Host ""
  Write-Host "Pacote gerado:" -ForegroundColor Green
  Write-Host "  $ZipPath ($sizeMb MB)"
  Write-Host "  SHA256: $hash"
  Write-Host ""
} finally {
  Pop-Location
}
