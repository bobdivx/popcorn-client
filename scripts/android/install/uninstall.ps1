# Script de désinstallation de l'application Android
# Usage: .\scripts\android\install\uninstall.ps1 [mobile|tv]

param(
    [Parameter(Position=0)]
    [ValidateSet("mobile", "tv", "")]
    [string]$Variant = "mobile"
)

$ErrorActionPreference = "Continue"

# Importer les fonctions et variables communes
. "$PSScriptRoot\..\..\_common\variables.ps1"
. "$PSScriptRoot\..\..\_common\functions.ps1"

$packageId = Get-PackageId -Variant $Variant

Write-Section "Désinstallation Application Android ($Variant)"

# Vérifier qu'un appareil est connecté
if (-not (Test-AndroidDevice)) {
    exit 1
}

Write-Info "Désinstallation de $packageId..."

$uninstallOutput = & $script:AdbPath uninstall $packageId 2>&1

if ($LASTEXITCODE -eq 0) {
    Write-Ok "Application désinstallée: $packageId"
    exit 0
} else {
    # Vérifier si c'est juste parce que l'app n'était pas installée
    $outputStr = $uninstallOutput -join " "
    if ($outputStr -match "not found|does not exist") {
        Write-Info "Application non installée (normal si première installation)"
        exit 0
    } else {
        Write-Err "Échec de la désinstallation"
        $uninstallOutput | ForEach-Object { Write-Host "  $_" -ForegroundColor Red }
        exit 1
    }
}