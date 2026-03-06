# Script complet: Build + Test Communication Android
# Attend la fin du build, installe l'APK et teste la communication automatiquement

$ErrorActionPreference = "Continue"
$projectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$adbPath = "D:\SDK\platform-tools\adb.exe"
$logFile = "d:\Github\popcorn-server\.cursor\debug.log"
$packageId = "com.popcorn.client.mobile"
$apkDestPath = "d:\Github\popcorn-web\app"

function Write-Info { param([string]$m) Write-Host "[INFO] $m" -ForegroundColor Cyan }
function Write-Ok { param([string]$m) Write-Host "[OK] $m" -ForegroundColor Green }
function Write-Err { param([string]$m) Write-Host "[ERREUR] $m" -ForegroundColor Red }
function Write-Warn { param([string]$m) Write-Host "[WARN] $m" -ForegroundColor Yellow }

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "BUILD + TEST COMPLET ANDROID" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# 1. Vérifier que le build est lancé ou le lancer
Write-Info "1. Vérification du build Android..."

$javaRunning = Get-Process -Name "java" -ErrorAction SilentlyContinue
$buildRunning = $javaRunning -ne $null

if (-not $buildRunning) {
    Write-Info "Lancement du build Android en temps réel..."
    $env:ANDROID_HOME = "D:\SDK"
    $env:ANDROID_SDK_ROOT = "D:\SDK"
    
    # Lancer le build en capturant la sortie
    Push-Location $projectRoot
    $buildProcess = Start-Process powershell -ArgumentList "-ExecutionPolicy", "Bypass", "-NoExit", "-Command", "& '$projectRoot\scripts\build-android.ps1' mobile" -PassThru -WindowStyle Normal
    Write-Info "Build lancé (PID: $($buildProcess.Id)). Suivi en temps réel..."
    Pop-Location
    
    Start-Sleep -Seconds 5
    $buildRunning = $true
}

# 2. Surveiller le build avec affichage de progression
Write-Info "2. Surveillance du build avec affichage en temps réel (max 60 minutes)..."
Write-Host "   [OK] Une fenêtre PowerShell affiche la progression du build en temps réel" -ForegroundColor DarkGray
Write-Host "   [OK] Surveille toutes les 30 secondes, statut affiché toutes les minutes" -ForegroundColor DarkGray
Write-Host ""

$timeout = (Get-Date).AddMinutes(60)
$buildComplete = $false
$lastApkTime = $null
$lastJavaCheck = Get-Date
$checkCount = 0
$buildLogPath = Join-Path $projectRoot "src-tauri\gen\android\app\build"

while ((Get-Date) -lt $timeout -and -not $buildComplete) {
    $checkCount++
    $elapsed = [math]::Round(((Get-Date) - $lastJavaCheck).TotalMinutes, 1)
    
    # Vérifier l'état du build toutes les 30 secondes
    Start-Sleep -Seconds 30
    
    # Vérifier les processus Java
    $currentJava = Get-Process -Name "java" -ErrorAction SilentlyContinue
    $hasJava = $currentJava -ne $null
    
    # Chercher un APK récent
    $apk = Get-ChildItem "$apkDestPath\Popcorn_Mobile-v*.apk" -ErrorAction SilentlyContinue | 
        Sort-Object LastWriteTime -Descending | Select-Object -First 1
    
    # Vérifier les fichiers de build pour la progression
    $buildProgress = ""
    if (Test-Path $buildLogPath) {
        $apkFiles = Get-ChildItem "$buildLogPath\outputs\apk" -Recurse -Filter "*.apk" -ErrorAction SilentlyContinue
        if ($apkFiles) {
            $buildProgress = "APK en cours de génération..."
        }
    }
    
    # Afficher le statut toutes les 2 vérifications (1 minute)
    if ($checkCount % 2 -eq 0) {
        $status = if ($hasJava) { "EN COURS [OK]" } else { "ARRETE [STOP]" }
        $statusColor = if ($hasJava) { "Green" } else { "Yellow" }
        $apkInfo = if ($apk) { 
            $age = [math]::Round(((Get-Date) - $apk.LastWriteTime).TotalMinutes, 1)
            "$($apk.Name) (il y a ${age} min)"
        } else { 
            "Aucun APK détecté"
        }
        
        Write-Host ""
        Write-Host "[$elapsed min] " -NoNewline -ForegroundColor DarkGray
        Write-Host "Build: $status " -NoNewline -ForegroundColor $statusColor
        Write-Host "| APK: $apkInfo" -NoNewline -ForegroundColor DarkGray
        if ($buildProgress) {
            Write-Host " $buildProgress" -ForegroundColor Cyan
        } else {
            Write-Host ""
        }
        
        # Vérifier si le build a planté (pas de Java depuis plus de 5 minutes sans APK)
        if (-not $hasJava -and -not $apk -and $elapsed -gt 5) {
            Write-Host ""
            Write-Err "⚠ ATTENTION: Le build semble bloqué (pas de processus Java et aucun APK après $elapsed minutes)"
            Write-Warn "→ Vérifiez la fenêtre de build PowerShell pour voir les erreurs éventuelles"
            Write-Info "→ Le script continue de surveiller pendant encore $([math]::Round(($timeout - (Get-Date)).TotalMinutes, 1)) minutes"
            Write-Host ""
        }
    } else {
        Write-Host "." -NoNewline -ForegroundColor DarkGray
    }
    
    # Si un APK récent existe et le build s'est arrêté
    if ($apk) {
        $apkAge = ((Get-Date) - $apk.LastWriteTime).TotalMinutes
        if ($apkAge -lt 5) {
            if (-not $hasJava) {
                Write-Host ""
                Write-Ok "APK trouvé: $($apk.Name) - Modifié il y a $([math]::Round($apkAge, 1)) minutes"
                $buildComplete = $true
                break
            } elseif ($apk.LastWriteTime -ne $lastApkTime) {
                Write-Host ""
                Write-Info "APK mis à jour détecté: $($apk.Name)"
                $lastApkTime = $apk.LastWriteTime
            }
        }
    }
    
    # Si plus de Java depuis plus de 2 minutes, le build est terminé
    if ($buildRunning -and -not $hasJava) {
        $noJavaDuration = ((Get-Date) - $lastJavaCheck).TotalMinutes
        if ($noJavaDuration -ge 2) {
            if ($apk) {
                Write-Host ""
                Write-Ok "Build terminé - APK trouvé: $($apk.Name)"
                $buildComplete = $true
                break
            }
        }
    } else {
        $lastJavaCheck = Get-Date
    }
}

Write-Host ""

if (-not $buildComplete) {
    Write-Err "Timeout: Le build n'a pas été détecté comme terminé dans les 60 minutes"
    exit 1
}

# 3. Installer l'APK
Write-Info "3. Installation de l'APK..."

$apk = Get-ChildItem "$apkDestPath\Popcorn_Mobile-v*.apk" -ErrorAction SilentlyContinue | 
    Sort-Object LastWriteTime -Descending | Select-Object -First 1

if (-not $apk) {
    Write-Err "APK non trouvé dans $apkDestPath"
    exit 1
}

$devices = & $adbPath devices 2>&1 | Select-String "device$"
if (-not $devices) {
    Write-Err "Aucun appareil Android connecté"
    exit 1
}

Write-Info "Désinstallation de l'ancienne version..."
& $adbPath uninstall $packageId 2>&1 | Out-Null

Write-Info "Installation de: $($apk.Name)"
$installResult = & $adbPath install -r $apk.FullName 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Err "Échec de l'installation"
    $installResult | ForEach-Object { Write-Host "  $_" -ForegroundColor Red }
    exit 1
}

Write-Ok "Application installée"

# 4. Tester la communication
Write-Info "4. Test de communication..."

$logDir = Split-Path $logFile -Parent
if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir -Force | Out-Null }
if (Test-Path $logFile) { Remove-Item $logFile -Force }

Write-Info "Lancement de l'application..."
& $adbPath shell am force-stop $packageId 2>&1 | Out-Null
Start-Sleep -Seconds 1
& $adbPath shell monkey -p $packageId -c android.intent.category.LAUNCHER 1 2>&1 | Out-Null
Write-Ok "Application lancée"
Start-Sleep -Seconds 8

& $adbPath logcat -c 2>&1 | Out-Null

Write-Host ""
Write-Host "========================================" -ForegroundColor Yellow
Write-Host "CAPTURE DES LOGS - Navigation requise" -ForegroundColor Yellow
Write-Host "========================================" -ForegroundColor Yellow
Write-Host "1. Naviguez vers: Settings > Diagnostics" -ForegroundColor White
Write-Host "2. Lancez tous les tests de diagnostic" -ForegroundColor White
Write-Host "3. Attendez la fin complète" -ForegroundColor White
Write-Host "========================================" -ForegroundColor Yellow
Write-Host ""
Write-Info "Capture des logs pendant 60 secondes..."

$allLogs = @()
$endTime = (Get-Date).AddSeconds(60)

while ((Get-Date) -lt $endTime) {
    $logs = & $adbPath logcat -d 2>&1
    if ($logs) { $allLogs += $logs }
    Start-Sleep -Seconds 5
    Write-Host "." -NoNewline -ForegroundColor DarkGray
}

Write-Host ""

$finalLogs = & $adbPath logcat -d 2>&1
if ($finalLogs) { $allLogs += $finalLogs }

$filtered = $allLogs | Select-String -Pattern "popcorn-debug|native-fetch|Command|Tauri|Rust|tauri|invoke|diag|backend|http|network|error|Error|ERROR" -CaseSensitive:$false | Sort-Object -Unique
$filtered | Out-File -FilePath $logFile -Encoding utf8 -Force

Write-Ok "$($filtered.Count) lignes sauvegardées dans $logFile"

# 5. Analyse
Write-Host ""
Write-Host "=== ANALYSE DES LOGS ===" -ForegroundColor Cyan

$errors = $filtered | Select-String -Pattern "Command.*not found|native-fetch.*not found" -CaseSensitive:$false
if ($errors) {
    Write-Err "ERREURS CRITIQUES: $($errors.Count)"
    $errors | Select-Object -First 5 | ForEach-Object { Write-Host "  $_" -ForegroundColor Red }
} else {
    Write-Ok "Aucune erreur 'Command not found'"
}

$tauriLogs = $filtered | Select-String -Pattern "popcorn-debug.*Tauri|registering commands" -CaseSensitive:$false
if ($tauriLogs) {
    Write-Ok "Logs Tauri trouvés: $($tauriLogs.Count)"
    $tauriLogs | Select-Object -First 3 | ForEach-Object { Write-Host "  $_" -ForegroundColor Gray }
}

$fetchCalls = $filtered | Select-String -Pattern "native-fetch.*ENTRY|Attempting native-fetch" -CaseSensitive:$false
if ($fetchCalls) {
    Write-Ok "Appels native-fetch détectés: $($fetchCalls.Count)"
    $fetchCalls | Select-Object -First 3 | ForEach-Object { Write-Host "  $_" -ForegroundColor Gray }
} else {
    Write-Warn "Aucun appel native-fetch détecté"
}

$successLogs = $filtered | Select-String -Pattern "native-fetch.*SUCCESS" -CaseSensitive:$false
if ($successLogs) {
    Write-Ok "Communications réussies détectées: $($successLogs.Count)"
    $successLogs | Select-Object -First 3 | ForEach-Object { Write-Host "  $_" -ForegroundColor Green }
}

Write-Host ""
Write-Ok "Analyse terminée. Logs complets: $logFile"