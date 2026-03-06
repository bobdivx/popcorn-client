# Script de réinstallation (désinstall + install) de l'application Android
# Usage: .\scripts\android\install\reinstall.ps1 [mobile|tv]

param(
    [Parameter(Position=0)]
    [ValidateSet("mobile", "tv", "")]
    [string]$Variant = "mobile"
)

$ErrorActionPreference = "Continue"

# Importer les fonctions et variables communes
. "$PSScriptRoot\..\..\_common\variables.ps1"
. "$PSScriptRoot\..\..\_common\functions.ps1"

Write-Section "Réinstallation Application Android ($Variant)"

# Désinstaller
& "$PSScriptRoot\uninstall.ps1" $Variant

# Installer
& "$PSScriptRoot\install.ps1" $Variant