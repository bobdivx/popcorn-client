# Script de surveillance du build Android - Vérifie régulièrement et lance le test automatiquement
# Surveille le build et exécute automatiquement le test quand l'APK est prêt

$ErrorActionPreference = "Continue"
$projectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$adbPath = "D:\SDK\platform-tools\adb.exe"
$logFile = "d:\Github\popcorn-server\.cursor\debug.log"
$packageId = "com.popcorn.client.mobile"
$apkDestPath = "d:\Github\popcorn-web\app"
$checkInterval = 30 # Vérifier toutes les 30 secondes
$maxWaitMinutes = 90 # Maximum 90 minutes d'attente

function Write-Info { param([string]$m) Write-Host "[INFO] $m" -ForegroundColor Cyan }
function Write-Ok { param([string]$m) Write-Host "[OK] $m" -ForegroundColor Green }
function Write-Err { param([string]$m) Write-Host "[ERREUR] $m" -ForegroundColor Red }
function Write-Warn { param([string]$m) Write-Host "[WARN] $m" -ForegroundColor Yellow }

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "SURVEILLANCE BUILD + TEST AUTOMATIQUE" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Vérifier l'état initial
Write-Info "Vérification de l'état initial..."

$buildRunning = $false
$javaProcesses = Get-Process -Name "java" -ErrorAction SilentlyContinue | Where-Object { 
    $_.Path -like "*java*" -or $_.CommandLine -like "*gradle*" -or $_.CommandLine -like "*build*" 
}

if ($javaProcesses) {
    $buildRunning = $true
    Write-Info "Build détecté en cours (processus Java actifs: $($javaProcesses.Count))"
} else {
    Write-Warn "Aucun build détecté - vérification des APK existants..."
}

# Vérifier s'il y a déjà un APK récent
$existingApk = Get-ChildItem "$apkDestPath\Popcorn_Mobile-v*.apk" -ErrorAction SilentlyContinue | 
    Sort-Object LastWriteTime -Descending | Select-Object -First 1

$startTime = Get-Date
$timeout = $startTime.AddMinutes($maxWaitMinutes)
$lastJavaCheck = $startTime
$buildStoppedTime = $null

Write-Info "Surveillance démarrée (vérification toutes les $checkInterval secondes, max $maxWaitMinutes minutes)"
Write-Host ""

# Boucle de surveillance
$iteration = 0
while ((Get-Date) -lt $timeout) {
    $iteration++
    $elapsed = [math]::Round(((Get-Date) - $startTime).TotalMinutes, 1)
    
    # Vérifier les processus Java (toutes les 2 minutes pour éviter la surcharge)
    if (((Get-Date) - $lastJavaCheck).TotalMinutes -ge 2) {
        $currentJava = Get-Process -Name "java" -ErrorAction SilentlyContinue | Where-Object {
            $_.Path -like "*java*" -or $_.CommandLine -like "*gradle*" -or $_.CommandLine -like "*build*"
        }
        
        if ($buildRunning -and -not $currentJava) {
            # Le build s'est arrêté
            $buildStoppedTime = Get-Date
            Write-Warn "Build arrêté détecté (plus de processus Java)"
            $buildRunning = $false
        } elseif (-not $buildRunning -and $currentJava) {
            # Le build a redémarré
            Write-Info "Build redémarré détecté"
            $buildRunning = $true
            $buildStoppedTime = $null
        }
        
        $lastJavaCheck = Get-Date
    }
    
    # Vérifier si un APK récent a été créé
    $apk = Get-ChildItem "$apkDestPath\Popcorn_Mobile-v*.apk" -ErrorAction SilentlyContinue | 
        Sort-Object LastWriteTime -Descending | Select-Object -First 1
    
    if ($apk) {
        $apkAge = ((Get-Date) - $apk.LastWriteTime).TotalMinutes
        
        # Si l'APK a été modifié il y a moins de 5 minutes et le build s'est arrêté
        if ($apkAge -lt 5) {
            if (-not $buildRunning -or ($buildStoppedTime -and ((Get-Date) - $buildStoppedTime).TotalMinutes -ge 2)) {
                Write-Ok "APK récent détecté: $($apk.Name) (âge: $([math]::Round($apkAge, 1)) min)"
                Write-Info "Le build semble terminé, lancement du test automatique..."
                Write-Host ""
                
                # Exécuter le script de test
                $testScript = Join-Path $projectRoot "scripts\build-and-test-complete.ps1"
                if (Test-Path $testScript) {
                    & powershell -ExecutionPolicy Bypass -File $testScript
                    exit $LASTEXITCODE
                } else {
                    Write-Err "Script de test non trouvé: $testScript"
                    exit 1
                }
            }
        }
    }
    
    # Afficher le statut toutes les 10 itérations (environ 5 minutes)
    if ($iteration % 10 -eq 0) {
        $status = if ($buildRunning) { "EN COURS" } else { "ARRETE" }
        Write-Host "[$elapsed min] Build: $status | APK récent: $(if ($apk -and ((Get-Date) - $apk.LastWriteTime).TotalMinutes -lt 60) { 'OUI' } else { 'NON' })" -ForegroundColor DarkGray
    } else {
        Write-Host "." -NoNewline -ForegroundColor DarkGray
    }
    
    Start-Sleep -Seconds $checkInterval
}

Write-Host ""
Write-Err "Timeout: Aucun APK récent détecté après $maxWaitMinutes minutes"
Write-Info "Vérifiez manuellement le statut du build"

# Vérification finale
$finalApk = Get-ChildItem "$apkDestPath\Popcorn_Mobile-v*.apk" -ErrorAction SilentlyContinue | 
    Sort-Object LastWriteTime -Descending | Select-Object -First 1

if ($finalApk) {
    Write-Info "APK trouvé (mais peut-être ancien): $($finalApk.Name) - Modifié: $($finalApk.LastWriteTime)"
}

exit 1