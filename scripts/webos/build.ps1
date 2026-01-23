# Script de build WebOS
# Usage: .\scripts\webos\build.ps1 [--package]
# Build le frontend Astro et prépare l'application WebOS
# Optionnellement package l'IPK si ares-package est disponible

param(
    [switch]$Package = $false
)

$ErrorActionPreference = "Stop"

$ProjectRoot = $PSScriptRoot | Split-Path | Split-Path
$WebOSDir = Join-Path $ProjectRoot "webos"
$FrontendDir = Join-Path $WebOSDir "frontend"
$DistDir = Join-Path $ProjectRoot "dist"
$VersionFile = Join-Path $ProjectRoot "VERSION.json"
$AppInfoFile = Join-Path $WebOSDir "appinfo.json"

function Write-Info {
    param([string]$Message)
    Write-Host "ℹ️  $Message" -ForegroundColor Cyan
}

function Write-Success {
    param([string]$Message)
    Write-Host "✅ $Message" -ForegroundColor Green
}

function Write-Error {
    param([string]$Message)
    Write-Host "❌ $Message" -ForegroundColor Red
}

function Write-Section {
    param([string]$Message)
    Write-Host ""
    Write-Host "═══════════════════════════════════════════════════════════" -ForegroundColor Yellow
    Write-Host "  $Message" -ForegroundColor Yellow
    Write-Host "═══════════════════════════════════════════════════════════" -ForegroundColor Yellow
    Write-Host ""
}

Write-Section "Build WebOS Application"

# Étape 1: Vérifier que VERSION.json existe
if (-not (Test-Path $VersionFile)) {
    Write-Error "VERSION.json introuvable à la racine du projet"
    exit 1
}

# Étape 2: Lire la version depuis VERSION.json
Write-Info "Lecture de la version depuis VERSION.json"
$versionContent = Get-Content $VersionFile -Raw | ConvertFrom-Json
$version = $versionContent.client.version
Write-Success "Version détectée: $version"

# Étape 3: Build le frontend Astro
Write-Info "Build du frontend Astro..."
Set-Location $ProjectRoot
npm run build
if ($LASTEXITCODE -ne 0) {
    Write-Error "Échec du build Astro"
    exit 1
}
Write-Success "Frontend Astro buildé avec succès"

# Étape 4: Vérifier que dist/ existe
if (-not (Test-Path $DistDir)) {
    Write-Error "Le dossier dist/ n'existe pas après le build"
    exit 1
}

# Étape 5: Nettoyer et copier dist/ vers webos/frontend/
Write-Info "Copie du frontend buildé vers webos/frontend/..."
if (Test-Path $FrontendDir) {
    Remove-Item $FrontendDir -Recurse -Force
}
New-Item -ItemType Directory -Path $FrontendDir -Force | Out-Null
Copy-Item "$DistDir\*" -Destination $FrontendDir -Recurse -Force
Write-Success "Frontend copié vers webos/frontend/"

# Étape 6: Mettre à jour appinfo.json avec la version
Write-Info "Mise à jour de appinfo.json avec la version $version"
$appInfo = Get-Content $AppInfoFile -Raw | ConvertFrom-Json
$appInfo.version = $version
$appInfo | ConvertTo-Json -Depth 10 | Set-Content $AppInfoFile -Encoding UTF8
Write-Success "appinfo.json mis à jour"

# Étape 7: Copier les icônes si elles n'existent pas déjà
$iconPath = Join-Path $WebOSDir "icon.png"
$iconLargePath = Join-Path $WebOSDir "icon-large.png"
$sourceIcon = Join-Path $ProjectRoot "src-tauri\icons\icon.png"

if (-not (Test-Path $iconPath) -and (Test-Path $sourceIcon)) {
    Write-Info "Copie des icônes..."
    Copy-Item $sourceIcon -Destination $iconPath -Force
    Copy-Item $sourceIcon -Destination $iconLargePath -Force
    Write-Success "Icônes copiées"
}

# Étape 8: Package l'IPK si demandé
if ($Package) {
    Write-Info "Packaging de l'application WebOS en IPK..."
    
    # Vérifier si ares-package est disponible
    $aresPackage = Get-Command ares-package -ErrorAction SilentlyContinue
    if (-not $aresPackage) {
        Write-Error "ares-package n'est pas disponible"
        Write-Info "Installez WebOS SDK ou utilisez Docker pour builder l'IPK"
        Write-Info "Pour installer via npm: npm install -g ares-cli"
        Write-Info "Ou utilisez Docker: docker run --rm -v ${ProjectRoot}:/workspace -w /workspace/webos webos/tools ares-package ."
        exit 1
    }
    
    Set-Location $WebOSDir
    ares-package .
    if ($LASTEXITCODE -ne 0) {
        Write-Error "Échec du packaging IPK"
        exit 1
    }
    
    $ipkFile = Get-ChildItem -Path $WebOSDir -Filter "*.ipk" | Select-Object -First 1
    if ($ipkFile) {
        Write-Success "IPK créé: $($ipkFile.Name)"
        Write-Info "Taille: $([math]::Round($ipkFile.Length / 1MB, 2)) MB"
    } else {
        Write-Error "Fichier IPK introuvable après le packaging"
        exit 1
    }
} else {
    Write-Info "Packaging IPK ignoré (utilisez --Package pour créer l'IPK)"
    Write-Info "Pour créer l'IPK manuellement:"
    Write-Info "  cd webos"
    Write-Info "  ares-package ."
}

Write-Section "Build WebOS terminé avec succès"
Write-Success "L'application WebOS est prête dans le dossier webos/"
if (-not $Package) {
    Write-Info "Pour créer l'IPK, exécutez: .\scripts\webos\build.ps1 -Package"
}
