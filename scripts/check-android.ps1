# Script de vérification rapide pour Android
# Usage: .\scripts\check-android.ps1

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Vérification Environnement Android" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

$allOk = $true

# Vérifier Java
Write-Host "Java JDK:" -ForegroundColor Yellow
$javaHome = $env:JAVA_HOME
if ($javaHome -and (Test-Path $javaHome)) {
    $javaExe = Join-Path $javaHome "bin\java.exe"
    if (Test-Path $javaExe) {
        $version = & $javaExe -version 2>&1 | Select-String "version" | Select-Object -First 1
        Write-Host "  ✓ JAVA_HOME: $javaHome" -ForegroundColor Green
        Write-Host "    $version" -ForegroundColor Gray
    } else {
        Write-Host "  ✗ JAVA_HOME configuré mais java.exe introuvable" -ForegroundColor Red
        $allOk = $false
    }
} else {
    $javaPath = Get-Command java -ErrorAction SilentlyContinue
    if ($javaPath) {
        $version = java -version 2>&1 | Select-String "version" | Select-Object -First 1
        Write-Host "  ⚠️  Java trouvé dans PATH mais JAVA_HOME non configuré" -ForegroundColor Yellow
        Write-Host "    $version" -ForegroundColor Gray
    } else {
        Write-Host "  ✗ Java non trouvé" -ForegroundColor Red
        $allOk = $false
    }
}

# Vérifier Android SDK
Write-Host ""
Write-Host "Android SDK:" -ForegroundColor Yellow
$androidHome = $env:ANDROID_HOME
if (-not $androidHome) {
    $androidHome = $env:ANDROID_SDK_ROOT
}

if ($androidHome -and (Test-Path $androidHome)) {
    Write-Host "  ✓ ANDROID_HOME: $androidHome" -ForegroundColor Green
    
    # Vérifier NDK
    $ndkPath = Join-Path $androidHome "ndk"
    if (Test-Path $ndkPath) {
        $ndkVersions = Get-ChildItem $ndkPath -Directory -ErrorAction SilentlyContinue
        if ($ndkVersions) {
            $latestNdk = $ndkVersions | Sort-Object Name -Descending | Select-Object -First 1
            Write-Host "  ✓ NDK trouvé: $($latestNdk.Name)" -ForegroundColor Green
            
            $ndkHome = $env:ANDROID_NDK_HOME
            if ($ndkHome) {
                Write-Host "  ✓ ANDROID_NDK_HOME: $ndkHome" -ForegroundColor Green
            } else {
                Write-Host "  ⚠️  ANDROID_NDK_HOME non configuré (recommandé: $($latestNdk.FullName))" -ForegroundColor Yellow
            }
        } else {
            Write-Host "  ✗ Aucune version NDK trouvée dans $ndkPath" -ForegroundColor Red
            $allOk = $false
        }
    } else {
        Write-Host "  ✗ Dossier NDK introuvable: $ndkPath" -ForegroundColor Red
        $allOk = $false
    }
} else {
    Write-Host "  ✗ ANDROID_HOME non configuré" -ForegroundColor Red
    $allOk = $false
}

# Vérifier Rust
Write-Host ""
Write-Host "Rust:" -ForegroundColor Yellow
$rustVersion = rustc --version 2>$null
if ($rustVersion) {
    Write-Host "  ✓ $rustVersion" -ForegroundColor Green
} else {
    Write-Host "  ✗ Rust non installé" -ForegroundColor Red
    $allOk = $false
}

# Vérifier la cible Android pour Rust
Write-Host ""
Write-Host "Rust Android Target:" -ForegroundColor Yellow
$target = rustup target list --installed 2>$null | Select-String "aarch64-linux-android"
if ($target) {
    Write-Host "  ✓ aarch64-linux-android installé" -ForegroundColor Green
} else {
    Write-Host "  ⚠️  aarch64-linux-android non installé" -ForegroundColor Yellow
    Write-Host "    Installez avec: rustup target add aarch64-linux-android" -ForegroundColor Gray
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan

if ($allOk) {
    Write-Host "✅ Environnement Android prêt !" -ForegroundColor Green
    Write-Host ""
    Write-Host "Vous pouvez construire l'application:" -ForegroundColor Cyan
    Write-Host "  npm run tauri:build:android" -ForegroundColor White
    exit 0
} else {
    Write-Host "❌ Configuration incomplète" -ForegroundColor Red
    Write-Host ""
    Write-Host "Exécutez le script de configuration:" -ForegroundColor Yellow
    Write-Host "  .\scripts\setup-android.ps1" -ForegroundColor White
    Write-Host ""
    Write-Host "Ou consultez INSTALLATION_ANDROID.md" -ForegroundColor Cyan
    exit 1
}
