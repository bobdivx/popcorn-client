# Script de configuration de l'environnement Android pour Tauri
# Usage: .\scripts\android\setup\setup.ps1

$ErrorActionPreference = "Continue"

# Importer les fonctions et variables communes
. "$PSScriptRoot\..\..\_common\variables.ps1"
. "$PSScriptRoot\..\..\_common\functions.ps1"

Write-Section "Configuration Android pour Tauri"

# Vérifier winget
function Test-Winget {
    $null -ne (Get-Command winget -ErrorAction SilentlyContinue)
}

# Fonction pour installer Java
function Install-Java {
    if (-not (Test-Winget)) {
        Write-Err "winget non disponible. Installez Java manuellement."
        return $false
    }
    
    try {
        Write-Info "Téléchargement et installation de Java JDK 17..."
        $result = winget install --id EclipseAdoptium.Temurin.17.JDK --silent --accept-package-agreements --accept-source-agreements 2>&1
        if ($LASTEXITCODE -eq 0) {
            Write-Ok "Java JDK installé avec succès"
            return $true
        } else {
            Write-Err "Erreur lors de l'installation: $result"
            return $false
        }
    } catch {
        Write-Err "Erreur: $($_.Exception.Message)"
        return $false
    }
}

# Fonction pour installer Rust
function Install-Rust {
    if (-not (Test-Winget)) {
        Write-Err "winget non disponible. Installez Rust manuellement depuis https://rustup.rs/"
        return $false
    }
    
    try {
        Write-Info "Téléchargement et installation de Rust..."
        $result = winget install --id Rustlang.Rustup --silent --accept-package-agreements --accept-source-agreements 2>&1
        if ($LASTEXITCODE -eq 0) {
            Write-Ok "Rust installé avec succès"
            Write-Warn "Redémarrez le terminal pour que Rust soit disponible dans le PATH"
            return $true
        } else {
            Write-Err "Erreur lors de l'installation: $result"
            return $false
        }
    } catch {
        Write-Err "Erreur: $($_.Exception.Message)"
        return $false
    }
}

# Demander installation automatique
Write-Info "Ce script peut installer automatiquement certains prérequis via winget."
$response = Read-Host "Voulez-vous installer automatiquement Java et Rust s'ils manquent ? (O/N)"
$autoInstall = ($response -eq "O" -or $response -eq "o" -or $response -eq "Y" -or $response -eq "y")

if ($autoInstall -and -not (Test-Winget)) {
    Write-Warn "winget n'est pas disponible sur ce système. L'installation automatique ne sera pas possible."
    $autoInstall = $false
}

$errors = 0
$warnings = 0

# Vérifier Java
Write-Host ""
Write-Host "Vérification Java JDK..." -ForegroundColor Yellow
$javaHome = $script:JavaHome
$javaOk = $false

if ($javaHome -and (Test-Path $javaHome)) {
    $javaExe = Join-Path $javaHome "bin\java.exe"
    if (Test-Path $javaExe) {
        $version = & $javaExe -version 2>&1 | Select-String "version" | Select-Object -First 1
        Write-Ok "JAVA_HOME: $javaHome - $version"
        $javaOk = $true
    }
}

if (-not $javaOk) {
    $javaPath = Get-Command java -ErrorAction SilentlyContinue
    if ($javaPath) {
        $version = java -version 2>&1 | Select-String "version" | Select-Object -First 1
        Write-Warn "Java trouvé dans PATH mais JAVA_HOME non configuré - $version"
        $warnings++
        $javaOk = $true
    } else {
        Write-Err "Java non trouvé"
        if ($autoInstall) {
            if (Install-Java) {
                Start-Sleep -Seconds 2
                # Réessayer après installation
                $javaPath = Get-Command java -ErrorAction SilentlyContinue
                if ($javaPath) { $javaOk = $true }
            }
        } else {
            Write-Info "Installez Java JDK 17+ ou Android Studio"
        }
        if (-not $javaOk) { $errors++ }
    }
}

# Vérifier Android SDK
Write-Host ""
Write-Host "Vérification Android SDK..." -ForegroundColor Yellow
$androidHome = $script:AndroidHome
$androidOk = $false

if ($androidHome -and (Test-Path $androidHome)) {
    Write-Ok "ANDROID_HOME: $androidHome"
    
    $ndkPath = Join-Path $androidHome "ndk"
    if (Test-Path $ndkPath) {
        $ndkVersions = Get-ChildItem $ndkPath -Directory -ErrorAction SilentlyContinue
        if ($ndkVersions) {
            $latestNdk = $ndkVersions | Sort-Object Name -Descending | Select-Object -First 1
            Write-Ok "NDK trouvé: $($latestNdk.Name)"
            
            if (-not $env:ANDROID_NDK_HOME) {
                Write-Warn "ANDROID_NDK_HOME non configuré (recommandé: $($latestNdk.FullName))"
                $warnings++
            }
        } else {
            Write-Warn "Aucune version NDK trouvée dans $ndkPath"
            $warnings++
        }
    } else {
        Write-Warn "Dossier NDK introuvable: $ndkPath"
        $warnings++
    }
    $androidOk = $true
} else {
    Write-Err "ANDROID_HOME non configuré"
    Write-Info "Installez Android Studio et configurez ANDROID_HOME"
    $errors++
}

# Vérifier Rust
Write-Host ""
Write-Host "Vérification Rust..." -ForegroundColor Yellow
$rustVersion = rustc --version 2>$null
if ($rustVersion) {
    Write-Ok "$rustVersion"
} else {
    Write-Err "Rust non installé"
    if ($autoInstall) {
        Install-Rust | Out-Null
    } else {
        Write-Info "Installez Rust depuis: https://rustup.rs/"
    }
    $errors++
}

# Vérifier la cible Rust Android
Write-Host ""
Write-Host "Vérification cible Rust Android..." -ForegroundColor Yellow
$target = rustup target list --installed 2>$null | Select-String "aarch64-linux-android"
if ($target) {
    Write-Ok "aarch64-linux-android installé"
} else {
    Write-Warn "aarch64-linux-android non installé"
    Write-Info "Installez avec: rustup target add aarch64-linux-android"
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan

if ($errors -eq 0) {
    Write-Ok "Toutes les dépendances sont installées"
    
    if ($warnings -gt 0) {
        Write-Host ""
        Write-Warn "$warnings avertissement(s) - Variables d'environnement à configurer"
        Write-Info "Consultez INSTALLATION_ANDROID.md pour plus de détails"
    }
    
    Write-Host ""
    $response = Read-Host "Voulez-vous initialiser l'environnement Android Tauri maintenant ? (O/N)"
    if ($response -eq "O" -or $response -eq "o" -or $response -eq "Y" -or $response -eq "y") {
        Write-Info "Initialisation de l'environnement Android Tauri..."
        Push-Location $script:ProjectRoot
        try {
            npx tauri android init
            if ($LASTEXITCODE -eq 0) {
                Write-Ok "Configuration Android terminée"
                Write-Info "Vous pouvez maintenant construire: npm run android:build"
            } else {
                Write-Err "Erreur lors de l'initialisation"
                exit 1
            }
        } finally {
            Pop-Location
        }
    }
    
    exit 0
} else {
    Write-Err "$errors erreur(s) détectée(s)"
    Write-Info "Veuillez installer les dépendances manquantes avant de continuer"
    exit 1
}