# Script de build WebOS
# Usage: .\scripts\webos\build.ps1 [-Demo] [-Simple] [-Native] [-Package]
# -Simple : app minimaliste avec lanceur (client cloud ou client local), pas de build Astro
# -Native : app complète embarquée (build Astro), pas de page de choix client = expérience fluide
# -Demo   : utilise le backend de validation (popcorn-vercel) pour les builds stores (build complet)
# -Package: crée l'IPK avec ares-package

param(
    [switch]$Demo = $false,
    [switch]$Simple = $false,
    [switch]$Native = $false,
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
    Write-Host "[INFO] $Message" -ForegroundColor Cyan
}

function Write-Success {
    param([string]$Message)
    Write-Host "[OK]   $Message" -ForegroundColor Green
}

function Write-Err {
    param([string]$Message)
    Write-Host "[ERR]  $Message" -ForegroundColor Red
}

function Write-Section {
    param([string]$Message)
    Write-Host ""
    Write-Host "===========================================================" -ForegroundColor Yellow
    Write-Host "  $Message" -ForegroundColor Yellow
    Write-Host "===========================================================" -ForegroundColor Yellow
    Write-Host ""
}

Write-Section "Build WebOS Application"

# Étape 1: Vérifier que VERSION.json existe
if (-not (Test-Path $VersionFile)) {
    Write-Err "VERSION.json introuvable à la racine du projet"
    exit 1
}

# Étape 2: Lire la version depuis VERSION.json
Write-Info "Lecture de la version depuis VERSION.json"
$versionContent = Get-Content $VersionFile -Raw | ConvertFrom-Json
$version = $versionContent.client.version
Write-Success "Version détectée: $version"

Set-Location $ProjectRoot

if ($Simple) {
    # Mode simple : pas de build Astro, l'app affiche le lanceur (cloud / client local)
    Write-Info "Mode simple : app = lanceur (client cloud / client local)"
    if (Test-Path $FrontendDir) {
        Remove-Item $FrontendDir -Recurse -Force
        Write-Info "Suppression de webos/frontend/ (inutile en mode simple)"
    }
    $appInfo = Get-Content $AppInfoFile -Raw | ConvertFrom-Json
    $appInfo.version = $version
    $appInfo.main = "index.html"
    $appInfo | ConvertTo-Json -Depth 10 | Set-Content $AppInfoFile -Encoding UTF8
    Write-Success "appinfo.json mis à jour (main = index.html)"
} else {
    # Build complet : frontend Astro dans webos/frontend/
    # Étape 3: Build le frontend Astro avec config webOS (chemins relatifs)
    if ($Demo) {
        $env:PUBLIC_DEMO_BACKEND_URL = "https://popcorn-vercel.vercel.app"
        Write-Info "Mode démo activé : backend de validation (PUBLIC_DEMO_BACKEND_URL)"
    }
    $env:SITE = $null
    $env:ASTRO_SITE = $null
    Write-Info "Build du frontend Astro avec config webOS (chemins relatifs)..."

    $configFile = Join-Path $ProjectRoot "astro.config.webos.mjs"
    if (Test-Path $configFile) {
        Write-Info "Utilisation de astro.config.webos.mjs"
        npx astro build --config astro.config.webos.mjs
    } else {
        Write-Info "Config webOS non trouvée, utilisation de la config par défaut"
        npm run build
    }

    if ($LASTEXITCODE -ne 0) {
        Write-Err "Échec du build Astro"
        exit 1
    }
    Write-Success "Frontend Astro buildé avec succès"

    if (-not (Test-Path $DistDir)) {
        Write-Err "Le dossier dist/ n'existe pas après le build"
        exit 1
    }

    Write-Info "Correction des chemins pour compatibilité webOS (file://)..."
    $htmlFiles = Get-ChildItem -Path $DistDir -Filter "*.html" -Recurse
    foreach ($htmlFile in $htmlFiles) {
        $content = Get-Content $htmlFile.FullName -Raw
        $newContent = $content -replace '="/_assets/', '="./_assets/'
        $newContent = $newContent -replace '="https?://[^"]+/_assets/', '="./_assets/'
        $newContent = $newContent -replace '="/popcorn_logo.png"', '="./popcorn_logo.png"'
        $newContent = $newContent -replace '="/favicon.svg"', '="./favicon.svg"'
        if ($content -ne $newContent) {
            Set-Content $htmlFile.FullName -Value $newContent -Encoding UTF8
            Write-Host "  Corrigé: $($htmlFile.Name)" -ForegroundColor Gray
        }
    }
    $jsFiles = Get-ChildItem -Path $DistDir -Filter "*.js" -Recurse -ErrorAction SilentlyContinue
    foreach ($jsFile in $jsFiles) {
        $content = Get-Content $jsFile.FullName -Raw -ErrorAction SilentlyContinue
        if (-not $content) { continue }
        $newContent = $content -replace 'https?://[^"'']+/_assets/', './_assets/'
        if ($content -ne $newContent) {
            Set-Content $jsFile.FullName -Value $newContent -Encoding UTF8 -NoNewline
            Write-Host "  Corrigé (JS): $($jsFile.Name)" -ForegroundColor Gray
        }
    }
    Write-Success "Chemins corrigés pour webOS"

    Write-Info "Copie du frontend buildé vers webos/frontend/..."
    if (Test-Path $FrontendDir) {
        Remove-Item $FrontendDir -Recurse -Force
    }
    New-Item -ItemType Directory -Path $FrontendDir -Force | Out-Null
    Copy-Item "$DistDir\*" -Destination $FrontendDir -Recurse -Force
    Write-Success "Frontend copié vers webos/frontend/"

    Write-Info "Mise à jour de appinfo.json avec la version $version"
    $appInfo = Get-Content $AppInfoFile -Raw | ConvertFrom-Json
    $appInfo.version = $version
    if ($Demo) {
        $appInfo.main = "frontend/index.html"
        Write-Info "Mode démo : main = frontend/index.html"
    } elseif ($Native) {
        $appInfo.main = "frontend/index.html"
        Write-Info "Mode natif : main = frontend/index.html (app complète, pas de lanceur)"
    } else {
        $appInfo.main = "index.html"
        Write-Info "Main = index.html (lanceur cloud / client local)"
    }
    $appInfo | ConvertTo-Json -Depth 10 | Set-Content $AppInfoFile -Encoding UTF8
    Write-Success "appinfo.json mis à jour"
}

# Étape 7: Générer les icônes webOS (fond plein - exigence LG Content Store QA)
$iconPath = Join-Path $WebOSDir "icon.png"
$iconLargePath = Join-Path $WebOSDir "icon-large.png"
$sourceIcon = Join-Path $ProjectRoot "src-tauri\icons\icon.png"
$iconScript = Join-Path $ProjectRoot "scripts\webos\create-icons-solid-bg.mjs"
if (Test-Path $iconScript) {
    Write-Info "Génération des icônes (fond plein, couleur design violet)..."
    & node $iconScript
    if ($LASTEXITCODE -eq 0) {
        Write-Success "Icônes webOS générées (0% transparence)"
    } elseif (Test-Path $sourceIcon) {
        Write-Info "Fallback: copie des icônes source..."
        Copy-Item $sourceIcon -Destination $iconPath -Force
        Copy-Item $sourceIcon -Destination $iconLargePath -Force
    }
} elseif (-not (Test-Path $iconPath) -and (Test-Path $sourceIcon)) {
    Write-Info "Copie des icônes..."
    Copy-Item $sourceIcon -Destination $iconPath -Force
    Copy-Item $sourceIcon -Destination $iconLargePath -Force
    Write-Success "Icônes copiées (exécutez node scripts/webos/create-icons-solid-bg.mjs pour fond plein LG QA)"
}

# Étape 8: Package l'IPK si demandé
if ($Package) {
    Write-Info "Packaging de l'application WebOS en IPK..."
    
    # Vérifier si ares-package est disponible
    $aresPackage = Get-Command ares-package -ErrorAction SilentlyContinue
    if (-not $aresPackage) {
        Write-Err "ares-package n'est pas disponible"
        Write-Info "Installez WebOS SDK ou utilisez Docker pour builder l'IPK"
        Write-Info "Pour installer via npm: npm install -g ares-cli"
        Write-Info "Ou utilisez Docker: docker run --rm -v ${ProjectRoot}:/workspace -w /workspace/webos webos/tools ares-package ."
        exit 1
    }
    
    Set-Location $WebOSDir
    # --no-minify car ares-package a des problèmes avec certains fichiers JS (sw.js)
    ares-package . -o $ProjectRoot --no-minify
    if ($LASTEXITCODE -ne 0) {
        Write-Err "Échec du packaging IPK"
        exit 1
    }
    
    # Récupérer l'IPK le plus récent (et de préférence celui de la version courante)
    $ipkCandidates = @()
    $ipkCandidates += Get-ChildItem -Path $ProjectRoot -Filter "*.ipk" -File -ErrorAction SilentlyContinue
    $ipkCandidates += Get-ChildItem -Path $WebOSDir -Filter "*.ipk" -File -ErrorAction SilentlyContinue

    $versionPattern = [regex]::Escape("_$version" + "_")
    $ipkFile =
        ($ipkCandidates | Where-Object { $_.Name -match $versionPattern } | Sort-Object LastWriteTime -Descending | Select-Object -First 1)
    if (-not $ipkFile) {
        $ipkFile = ($ipkCandidates | Sort-Object LastWriteTime -Descending | Select-Object -First 1)
    }
    if ($ipkFile) {
        Write-Success "IPK créé: $($ipkFile.Name)"
        Write-Info "Taille: $([math]::Round($ipkFile.Length / 1MB, 2)) MB"
    } else {
        Write-Err "Fichier IPK introuvable après le packaging"
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
if ($Simple) {
    Write-Info "L'app lance index.html (choix client cloud ou client local)"
} elseif ($Native) {
    Write-Info "L'app lance frontend/index.html (app complète embarquée, pas de page de choix)"
}
if (-not $Package) {
    Write-Info "Pour créer l'IPK, exécutez: .\scripts\webos\build.ps1 -Package"
    if ($Simple) { Write-Info "  ou: .\scripts\webos\build.ps1 -Simple -Package (IPK minimal)" }
    if ($Native) { Write-Info "  ou: .\scripts\webos\build.ps1 -Native -Package (IPK natif, app fluide)" }
}
