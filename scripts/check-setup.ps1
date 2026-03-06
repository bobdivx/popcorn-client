# Script de vérification de la configuration
# Usage: .\scripts\check-setup.ps1

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Vérification de la Configuration" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

$errors = 0

# Vérifier Node.js
Write-Host "Vérification Node.js..." -ForegroundColor Yellow
$nodeVersion = node --version 2>$null
if ($nodeVersion) {
    Write-Host "  ✓ Node.js $nodeVersion" -ForegroundColor Green
} else {
    Write-Host "  ✗ Node.js non installé" -ForegroundColor Red
    $errors++
}

# Vérifier Rust
Write-Host "Vérification Rust..." -ForegroundColor Yellow
$rustVersion = rustc --version 2>$null
if ($rustVersion) {
    Write-Host "  ✓ Rust installé" -ForegroundColor Green
} else {
    Write-Host "  ✗ Rust non installé" -ForegroundColor Red
    $errors++
}

# Vérifier les fichiers essentiels
Write-Host "Vérification des fichiers..." -ForegroundColor Yellow
$files = @(
    "package.json",
    "src-tauri/Cargo.toml",
    "src-tauri/tauri.conf.json",
    "src-tauri/src/main.rs",
    "src-tauri/build.rs",
    "src/lib/client/server-api.ts",
    "src/lib/encryption/e2e.ts",
    "astro.config.mjs"
)

foreach ($file in $files) {
    if (Test-Path $file) {
        Write-Host "  ✓ $file" -ForegroundColor Green
    } else {
        Write-Host "  ✗ $file manquant" -ForegroundColor Red
        $errors++
    }
}

# Vérifier les dépendances npm
Write-Host "Vérification des dépendances npm..." -ForegroundColor Yellow
if (Test-Path "node_modules") {
    Write-Host "  ✓ node_modules existe" -ForegroundColor Green
    
    $requiredPackages = @(
        "@tauri-apps/cli",
        "@tauri-apps/api",
        "preact",
        "astro"
    )
    
    foreach ($pkg in $requiredPackages) {
        $pkgPath = "node_modules/$pkg"
        if (Test-Path $pkgPath) {
            Write-Host "    ✓ $pkg" -ForegroundColor Green
        } else {
            Write-Host "    ✗ $pkg manquant" -ForegroundColor Yellow
        }
    }
} else {
    Write-Host "  ✗ node_modules non trouvé - exécutez 'npm install'" -ForegroundColor Red
    $errors++
}

# Vérifier Tauri CLI
Write-Host "Vérification Tauri CLI..." -ForegroundColor Yellow
$tauriVersion = npx @tauri-apps/cli --version 2>$null
if ($tauriVersion) {
    Write-Host "  ✓ Tauri CLI disponible" -ForegroundColor Green
} else {
    Write-Host "  ✗ Tauri CLI non disponible" -ForegroundColor Red
    $errors++
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan

if ($errors -eq 0) {
    Write-Host "✓ Configuration OK - Prêt pour le build !" -ForegroundColor Green
    Write-Host ""
    Write-Host "Commandes disponibles:" -ForegroundColor Cyan
    Write-Host "  npm run tauri:dev              - Mode développement" -ForegroundColor White
    Write-Host "  npm run tauri:build:windows    - Build Windows" -ForegroundColor White
    Write-Host "  .\scripts\dev-desktop.ps1      - Script dev" -ForegroundColor White
    Write-Host "  .\scripts\build-desktop.ps1    - Script build" -ForegroundColor White
    exit 0
} else {
    Write-Host "✗ $errors erreur(s) détectée(s)" -ForegroundColor Red
    Write-Host ""
    Write-Host "Actions recommandées:" -ForegroundColor Yellow
    Write-Host "  1. Exécutez 'npm install' pour installer les dépendances" -ForegroundColor White
    Write-Host "  2. Installez Rust depuis https://rustup.rs/" -ForegroundColor White
    Write-Host "  3. Verifiez que tous les fichiers sont presents" -ForegroundColor White
    exit 1
}
