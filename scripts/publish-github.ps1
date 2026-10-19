# Publica o N2 no GitHub: cria o repositorio, envia o codigo, ativa o Pages
# e dispara o release portatil.
#
# Pre-requisitos:
#   1. gh autenticado (gh auth login)
#   2. Repositorio git local ja inicializado e commitado
#
# Uso:
#   powershell -ExecutionPolicy Bypass -File scripts/publish-github.ps1
#   powershell -ExecutionPolicy Bypass -File scripts/publish-github.ps1 -RepoName meu-n2 -Visibility public -Tag v0.1.0

param(
  [string]$RepoName = "n2",
  [ValidateSet("public", "private")]
  [string]$Visibility = "public",
  [string]$Tag = "",
  [switch]$SkipRelease
)

$ErrorActionPreference = "Continue"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$Root = Split-Path -Parent $ScriptDir
$Git = Join-Path $Root ".tools\git\cmd\git.exe"
$GhLocal = Join-Path $Root ".tools\gh\bin\gh.exe"
$GhConfig = Join-Path $Root ".tools\gh-config"

if (-not (Test-Path $GhConfig)) { New-Item -ItemType Directory -Path $GhConfig -Force | Out-Null }
if (-not $env:GH_CONFIG_DIR) { $env:GH_CONFIG_DIR = $GhConfig }

function Write-Step([string]$Message) {
  Write-Host "==> $Message" -ForegroundColor Magenta
}

function Fail([string]$Message) {
  Write-Host "[erro] $Message" -ForegroundColor Red
  exit 1
}

if (-not (Test-Path $Git)) { $Git = "git" }
if (-not (Test-Path $GhLocal)) { $GhLocal = "gh" }

# gh chama o git pelo PATH; garante o git portatil quando disponivel.
$GitCmdDir = Split-Path $Git
if (Test-Path $GitCmdDir) { $env:Path = "$GitCmdDir;$env:Path" }

Push-Location $Root
try {
  Write-Step "Verificando autenticacao do GitHub CLI"
  & $GhLocal auth status 2>$null | Out-Null
  if ($LASTEXITCODE -ne 0) {
    Fail "gh nao esta autenticado. Rode: `"$GhLocal`" auth login"
  }

  $owner = (& $GhLocal api user --jq ".login" 2>$null | Select-Object -First 1).Trim()
  if (-not $owner) { Fail "Nao consegui obter o usuario do GitHub." }
  Write-Step "Usuario: $owner"

  $fullName = "$owner/$RepoName"
  & $GhLocal repo view $fullName 2>$null | Out-Null
  $exists = ($LASTEXITCODE -eq 0)

  Write-Step "Atualizando links do README/docs para $fullName"
  $files = @(
    (Join-Path $Root "README.md"),
    (Join-Path $Root "docs\RELEASE.md"),
    (Join-Path $Root "scripts\start-release.bat"),
    (Join-Path $Root "scripts\RELEASE-README.txt")
  )
  foreach ($file in $files) {
    if (Test-Path $file) {
      $content = Get-Content $file -Raw
      $content = $content -replace 'SEU-USUARIO', $owner
      Set-Content $file $content -NoNewline
    }
  }
  & $Git add -A
  & $Git diff --cached --quiet 2>$null
  if ($LASTEXITCODE -ne 0) {
    & $Git commit -m "docs: apontar links para $fullName" 2>$null | Out-Null
  }

  if (-not $exists) {
    Write-Step "Criando repositorio $fullName ($Visibility) e enviando main"
    & $GhLocal repo create $fullName --$Visibility --source . --remote origin --push
    if ($LASTEXITCODE -ne 0) {
      Write-Host "  gh repo create falhou; tentando criar e enviar manualmente..." -ForegroundColor Yellow
      & $GhLocal repo create $fullName --$Visibility 2>$null | Out-Null
      & $Git remote get-url origin 2>$null | Out-Null
      if ($LASTEXITCODE -ne 0) {
        & $Git remote add origin "https://github.com/$fullName.git"
      } else {
        & $Git remote set-url origin "https://github.com/$fullName.git"
      }
      & $Git push -u origin main
      if ($LASTEXITCODE -ne 0) { Fail "git push falhou." }
    }
  } else {
    Write-Step "Repositorio $fullName ja existe; enviando main"
    & $Git remote get-url origin 2>$null | Out-Null
    if ($LASTEXITCODE -ne 0) {
      & $Git remote add origin "https://github.com/$fullName.git"
    } else {
      & $Git remote set-url origin "https://github.com/$fullName.git"
    }
    & $Git push -u origin main
    if ($LASTEXITCODE -ne 0) { Fail "git push falhou." }
  }

  Write-Step "Ativando GitHub Pages (fonte: GitHub Actions)"
  & $GhLocal api --method POST "/repos/$fullName/pages" -f build_type=workflow 2>$null | Out-Null
  if ($LASTEXITCODE -ne 0) {
    Write-Host "  (Pages pode ja estar ativo ou exigir habilitacao manual em Settings > Pages)" -ForegroundColor Yellow
  }

  if (-not $SkipRelease) {
    if (-not $Tag) {
      $pkg = Get-Content (Join-Path $Root "package.json") -Raw | ConvertFrom-Json
      $Tag = "v$($pkg.version)"
    }
    Write-Step "Criando e enviando a tag $Tag (dispara o release portatil)"
    & $Git tag -f $Tag 2>$null | Out-Null
    & $Git push -f origin $Tag
    if ($LASTEXITCODE -ne 0) { Fail "git push da tag falhou." }
  }

  Write-Host ""
  Write-Host "Publicacao concluida." -ForegroundColor Green
  Write-Host "  Repositorio : https://github.com/$fullName"
  Write-Host "  Interface   : https://$owner.github.io/$RepoName/"
  if (-not $SkipRelease) {
    Write-Host "  Download    : https://github.com/$fullName/releases/latest"
  }
  Write-Host ""
  Write-Host "O workflow de release leva alguns minutos. Acompanhe em:" -ForegroundColor Yellow
  Write-Host "  https://github.com/$fullName/actions"
} finally {
  Pop-Location
}
