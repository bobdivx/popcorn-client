# Script de test de communication Android <-> Backend
# Usage: .\scripts\android\test\communication.ps1 [mobile|tv]

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

Write-Section "Test Communication Android <-> Backend ($Variant)"

# Vérification rapide
if (-not (Test-AndroidDevice)) {
    exit 1
}

# Installation si APK récent disponible
$apk = Get-LatestApk -Variant $Variant

if ($apk -and ((Get-Date) - $apk.LastWriteTime).TotalMinutes -lt 30) {
    Write-Info "Installation de l'APK récent: $($apk.Name)"
    & "$PSScriptRoot\..\install\reinstall.ps1" $Variant
    if ($LASTEXITCODE -ne 0) {
        Write-Err "Échec installation"
        exit 1
    }
} else {
    Write-Info "Utilisation de l'APK déjà installé"
}

# Lancement de l'application
Write-Info "Lancement de l'application..."
& $script:AdbPath shell am force-stop $packageId 2>&1 | Out-Null
Start-Sleep -Seconds 1
& $script:AdbPath shell monkey -p $packageId -c android.intent.category.LAUNCHER 1 2>&1 | Out-Null
Write-Ok "Application lancée"
Start-Sleep -Seconds $script:Timeouts.appLaunch

# Utiliser le script de capture de logs
& $script:AdbPath logcat -c 2>&1 | Out-Null

Write-Host ""
Write-Host "========================================" -ForegroundColor Yellow
Write-Host "ACTION REQUISE:" -ForegroundColor Yellow
Write-Host "1. Naviguez vers: Settings > Diagnostics" -ForegroundColor White
Write-Host "2. Lancez les tests de diagnostic" -ForegroundColor White
Write-Host "3. Attendez la fin des tests" -ForegroundColor White
Write-Host "========================================" -ForegroundColor Yellow
Write-Host ""

# Utiliser le script de capture de logs (5 minutes pour capturer les erreurs)
$logFile = & "$PSScriptRoot\..\logs\capture.ps1" -Duration 300 -OutputPath $script:DebugLogPath

if (-not $logFile -or -not (Test-Path $logFile)) {
    Write-Err "Échec de la capture des logs"
    exit 1
}

# Analyser les logs
$logs = Get-Content $logFile -ErrorAction SilentlyContinue

if (-not $logs -or $logs.Count -eq 0) {
    Write-Err "AUCUN LOG PERTINENT CAPTURÉ"
    Write-Info "Cela peut signifier:"
    Write-Host "  - L'application n'a pas été utilisée pendant la capture" -ForegroundColor Gray
    Write-Host "  - Les logs ne sont pas dans les tags attendus" -ForegroundColor Gray
    Write-Host "  - L'application n'a pas été reconstruite avec les logs" -ForegroundColor Gray
    exit 1
}

Write-Host ""
Write-Host "=== ANALYSE ===" -ForegroundColor Cyan

# Erreurs critiques
$errors = $logs | Select-String -Pattern "Command.*not found|native-fetch.*not found|Command native-fetch" -CaseSensitive:$false
if ($errors) {
    Write-Err "ERREURS CRITIQUES DÉTECTÉES: $($errors.Count)"
    $errors | Select-Object -First 10 | ForEach-Object { Write-Host "  $_" -ForegroundColor Red }
} else {
    Write-Ok "Aucune erreur 'Command not found' détectée"
}

# Logs Tauri
$tauri = $logs | Select-String -Pattern "Tauri app starting|registering commands|popcorn-debug.*Tauri" -CaseSensitive:$false
if ($tauri) {
    Write-Ok "Logs Tauri trouvés: $($tauri.Count)"
    $tauri | Select-Object -First 5 | ForEach-Object { Write-Host "  $_" -ForegroundColor Gray }
} else {
    Write-Err "AUCUN LOG DE DÉMARRAGE TAURI"
    Write-Info "L'application n'a peut-être pas été reconstruite avec les logs de diagnostic"
}

# Appels native-fetch
$calls = $logs | Select-String -Pattern "native-fetch.*ENTRY|native-fetch.*called|Attempting native-fetch|invoke.*native-fetch|Command.*native-fetch" -CaseSensitive:$false
if ($calls) {
    Write-Ok "Appels native-fetch détectés: $($calls.Count)"
    $calls | Select-Object -First 10 | ForEach-Object { Write-Host "  $_" -ForegroundColor Gray }
} else {
    Write-Warn "Aucun appel native-fetch détecté"
}

# Erreurs spécifiques native-fetch
$nativeFetchErrors = $logs | Select-String -Pattern "Command native-fetch|native-fetch.*not found|native-fetch.*ERROR" -CaseSensitive:$false
if ($nativeFetchErrors) {
    Write-Err "Erreurs native-fetch détectées: $($nativeFetchErrors.Count)"
    $nativeFetchErrors | Select-Object -First 10 | ForEach-Object { Write-Host "  $_" -ForegroundColor Red }
}

# Erreurs réseau
$netErrors = $logs | Select-String -Pattern "NetworkError|timeout|connection.*refused|failed.*connect|ERR_" -CaseSensitive:$false
if ($netErrors) {
    Write-Warn "Erreurs réseau: $($netErrors.Count)"
    $netErrors | Select-Object -First 5 | ForEach-Object { Write-Host "  $_" -ForegroundColor Yellow }
}

Write-Host ""
Write-Ok "Analyse terminée. Logs complets: $logFile"