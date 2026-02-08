# Script de build pour l'application desktop Popcorn Client
# Usage: .\scripts\build-desktop.ps1 [windows|linux|macos]

param(
    [Parameter(Mandatory=$false)]
    [ValidateSet("windows", "linux", "macos", "all")]
    [string]$Platform = "windows"
)

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Build Application Desktop Popcorn Client" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Vérifier que nous sommes dans le bon répertoire
if (-not (Test-Path "package.json")) {
    Write-Host "Erreur: Ce script doit être exécuté depuis la racine du projet" -ForegroundColor Red
    exit 1
}

# Vérifier les dépendances
Write-Host "Vérification des dépendances..." -ForegroundColor Yellow
if (-not (Test-Path "node_modules")) {
    Write-Host "Installation des dépendances npm..." -ForegroundColor Yellow
    npm install
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Erreur lors de l'installation des dépendances" -ForegroundColor Red
        exit 1
    }
}

# Vérifier Rust
Write-Host "Vérification de Rust..." -ForegroundColor Yellow
$rustInstalled = Get-Command rustc -ErrorAction SilentlyContinue
if (-not $rustInstalled) {
    Write-Host "Rust n'est pas installé. Veuillez l'installer depuis https://rustup.rs/" -ForegroundColor Red
    exit 1
}

# Vérifier Tauri CLI
Write-Host "Vérification de Tauri CLI..." -ForegroundColor Yellow
$tauriInstalled = npm list @tauri-apps/cli 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Host "Installation de Tauri CLI..." -ForegroundColor Yellow
    npm install
}

Write-Host ""
Write-Host "Démarrage du build pour $Platform..." -ForegroundColor Green
Write-Host ""

switch ($Platform) {
    "windows" {
        Write-Host "Build Windows..." -ForegroundColor Cyan
        npm run tauri:build:windows
    }
    "linux" {
        Write-Host "Build Linux..." -ForegroundColor Cyan
        npm run tauri:build
    }
    "macos" {
        Write-Host "Build macOS..." -ForegroundColor Cyan
        npm run tauri:build
    }
    "all" {
        Write-Host "Build pour toutes les plateformes..." -ForegroundColor Cyan
        Write-Host "Windows..." -ForegroundColor Yellow
        npm run tauri:build:windows
        Write-Host "Linux..." -ForegroundColor Yellow
        npm run tauri:build
    }
}

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Green
    Write-Host "Build réussi !" -ForegroundColor Green
    Write-Host "========================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "L'application se trouve dans:" -ForegroundColor Cyan
    Write-Host "  src-tauri/target/*/release/bundle/" -ForegroundColor White
} else {
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Red
    Write-Host "Erreur lors du build" -ForegroundColor Red
    Write-Host "========================================" -ForegroundColor Red
    exit 1
}
