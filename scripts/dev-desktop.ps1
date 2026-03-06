# Script de développement pour l'application desktop Popcorn Client
# Usage: .\scripts\dev-desktop.ps1

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Développement Application Desktop" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Vérifier que nous sommes dans le bon répertoire
if (-not (Test-Path "package.json")) {
    Write-Host "Erreur: Ce script doit être exécuté depuis la racine du projet" -ForegroundColor Red
    exit 1
}

# Vérifier les dépendances
if (-not (Test-Path "node_modules")) {
    Write-Host "Installation des dépendances npm..." -ForegroundColor Yellow
    npm install
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Erreur lors de l'installation des dépendances" -ForegroundColor Red
        exit 1
    }
}

Write-Host "Démarrage du mode développement..." -ForegroundColor Green
Write-Host "L'application s'ouvrira automatiquement avec hot reload" -ForegroundColor Cyan
Write-Host ""

npm run tauri:dev
