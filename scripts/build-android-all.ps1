# Build Android Mobile + Android TV et copie les APK dans popcorn-web/app
# Usage: .\scripts\build-android-all.ps1

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$buildScript = Join-Path $scriptDir "build-android.ps1"

if (-not (Test-Path $buildScript)) {
    Write-Host "[ERREUR] build-android.ps1 introuvable: $buildScript" -ForegroundColor Red
    exit 1
}

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Build Android (mobile + tv)" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

Write-Host "-> Build variante: mobile" -ForegroundColor Yellow
& $buildScript "mobile"
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host ""
Write-Host "-> Build variante: tv" -ForegroundColor Yellow
& $buildScript "tv"
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "[OK] Builds Android terminés (mobile + tv)" -ForegroundColor Green
Write-Host "Les APK sont dans popcorn-web/app" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan

