# Script de vérification de l'environnement Android
# Usage: .\scripts\android\setup\check.ps1

$ErrorActionPreference = "Continue"

# Importer les fonctions et variables communes
. "$PSScriptRoot\..\..\_common\variables.ps1"
. "$PSScriptRoot\..\..\_common\functions.ps1"

Write-Section "Vérification Environnement Android"

$allOk = $true

# Vérifier Java
Write-Host "Java JDK:" -ForegroundColor Yellow
$javaHome = $script:JavaHome
if ($javaHome -and (Test-Path $javaHome)) {
    $javaExe = Join-Path $javaHome "bin\java.exe"
    if (Test-Path $javaExe) {
        $version = & $javaExe -version 2>&1 | Select-String "version" | Select-Object -First 1
        Write-Host "  [OK] JAVA_HOME: $javaHome" -ForegroundColor Green
        Write-Host "    $version" -ForegroundColor Gray
    } else {
        Write-Host "  [ERREUR] JAVA_HOME configuré mais java.exe introuvable" -ForegroundColor Red
        $allOk = $false
    }
} else {
    $javaPath = Get-Command java -ErrorAction SilentlyContinue
    if ($javaPath) {
        $version = java -version 2>&1 | Select-String "version" | Select-Object -First 1
        Write-Host "  [WARN] Java trouvé dans PATH mais JAVA_HOME non configuré" -ForegroundColor Yellow
        Write-Host "    $version" -ForegroundColor Gray
    } else {
        Write-Host "  [ERREUR] Java non trouvé" -ForegroundColor Red
        $allOk = $false
    }
}

# Vérifier Android SDK
Write-Host ""
Write-Host "Android SDK:" -ForegroundColor Yellow
$androidHome = $script:AndroidHome
if ($androidHome -and (Test-Path $androidHome)) {
    Write-Host "  [OK] ANDROID_HOME: $androidHome" -ForegroundColor Green
    
    # Vérifier NDK
    $ndkPath = Join-Path $androidHome "ndk"
    if (Test-Path $ndkPath) {
        $ndkVersions = Get-ChildItem $ndkPath -Directory -ErrorAction SilentlyContinue
        if ($ndkVersions) {
            $latestNdk = $ndkVersions | Sort-Object Name -Descending | Select-Object -First 1
            Write-Host "  [OK] NDK trouvé: $($latestNdk.Name)" -ForegroundColor Green
            
            $ndkHome = $env:ANDROID_NDK_HOME
            if ($ndkHome) {
                Write-Host "  [OK] ANDROID_NDK_HOME: $ndkHome" -ForegroundColor Green
            } else {
                Write-Host "  [WARN] ANDROID_NDK_HOME non configuré (recommandé: $($latestNdk.FullName))" -ForegroundColor Yellow
            }
        } else {
            Write-Host "  [ERREUR] Aucune version NDK trouvée dans $ndkPath" -ForegroundColor Red
            $allOk = $false
        }
    } else {
        Write-Host "  [ERREUR] Dossier NDK introuvable: $ndkPath" -ForegroundColor Red
        $allOk = $false
    }
} else {
    Write-Host "  [ERREUR] ANDROID_HOME non configuré" -ForegroundColor Red
    $allOk = $false
}

# Vérifier Rust
Write-Host ""
Write-Host "Rust:" -ForegroundColor Yellow
if (-not (Test-Command "rustc")) {
    Write-Host "  [ERREUR] Rust non installé" -ForegroundColor Red
    $allOk = $false
} else {
    $rustVersion = rustc --version
    Write-Host "  [OK] $rustVersion" -ForegroundColor Green
}

# Vérifier la cible Android pour Rust
Write-Host ""
Write-Host "Rust Android Target:" -ForegroundColor Yellow
$target = rustup target list --installed 2>$null | Select-String "aarch64-linux-android"
if ($target) {
    Write-Host "  [OK] aarch64-linux-android installé" -ForegroundColor Green
} else {
    Write-Host "  [WARN] aarch64-linux-android non installé" -ForegroundColor Yellow
    Write-Host "    Installez avec: rustup target add aarch64-linux-android" -ForegroundColor Gray
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan

if ($allOk) {
    Write-Ok "Environnement Android prêt !"
    Write-Host ""
    Write-Host "Vous pouvez construire l'application:" -ForegroundColor Cyan
    Write-Host "  npm run android:build" -ForegroundColor White
    exit 0
} else {
    Write-Err "Configuration incomplète"
    Write-Host ""
    Write-Host "Exécutez le script de configuration:" -ForegroundColor Yellow
    Write-Host "  npm run android:setup" -ForegroundColor White
    Write-Host ""
    Write-Host "Ou consultez INSTALLATION_ANDROID.md" -ForegroundColor Cyan
    exit 1
}