# Script pour builder l'application Android avec Tauri
# Usage: .\scripts\build-android.ps1 [mobile|tv|standard]

param(
    [Parameter(Position=0)]
    [ValidateSet("mobile", "tv", "standard", "")]
    [string]$Variant = "standard"
)

$ErrorActionPreference = "Stop"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Build Android avec Tauri" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Déterminer la variante
$buildType = if ($Variant -eq "mobile") { "mobile" } elseif ($Variant -eq "tv") { "tv" } else { "standard" }

Write-Host "Variante sélectionnée: $buildType" -ForegroundColor Yellow
Write-Host ""

# Fonction pour vérifier si une commande existe
function Test-Command {
    param([string]$Command)
    $null -ne (Get-Command $Command -ErrorAction SilentlyContinue)
}

# Détection automatique des chemins sur D:\ si les variables ne sont pas configurées
if (-not $env:JAVA_HOME -or -not (Test-Path $env:JAVA_HOME)) {
    $dJava = "D:\Android Studio\jbr"
    if (Test-Path $dJava) {
        $env:JAVA_HOME = $dJava
        Write-Host "  [INFO] Java detecte automatiquement: $dJava" -ForegroundColor Cyan
    }
}

if (-not $env:ANDROID_HOME -or -not (Test-Path $env:ANDROID_HOME)) {
    $dSdk = "D:\SDK"
    if (Test-Path $dSdk) {
        $env:ANDROID_HOME = $dSdk
        $env:ANDROID_SDK_ROOT = $dSdk
        Write-Host "  [INFO] Android SDK detecte automatiquement: $dSdk" -ForegroundColor Cyan
    }
}

# Configuration des outils NDK pour le build Rust
if ($env:ANDROID_HOME) {
    $ndkPath = Join-Path $env:ANDROID_HOME "ndk"
    if (Test-Path $ndkPath) {
        $ndk = Get-ChildItem $ndkPath -Directory | Sort-Object Name -Descending | Select-Object -First 1
        if ($ndk) {
            $env:ANDROID_NDK_HOME = $ndk.FullName
            $toolchainPath = Join-Path $ndk.FullName "toolchains\llvm\prebuilt\windows-x86_64\bin"
            if (Test-Path $toolchainPath) {
                $clang = Get-ChildItem "$toolchainPath\aarch64-linux-android*-clang.cmd" | Select-Object -First 1
                $ar = Get-ChildItem "$toolchainPath\llvm-ar.exe" | Select-Object -First 1
                if ($clang) {
                    $env:CC_aarch64_linux_android = $clang.FullName
                }
                if ($ar) {
                    $env:AR_aarch64_linux_android = $ar.FullName
                }
                $ranlib = Get-ChildItem "$toolchainPath\llvm-ranlib.exe" | Select-Object -First 1
                if ($ranlib) {
                    $env:RANLIB_aarch64_linux_android = $ranlib.FullName
                }
            }
        }
    }
}

# Vérifier les prérequis
Write-Host "Vérification des prérequis..." -ForegroundColor Yellow

$allOk = $true

# Vérifier Rust
if (-not (Test-Command "rustc")) {
    Write-Host "  [X] Rust non installe" -ForegroundColor Red
    Write-Host "    Installez Rust depuis: https://rustup.rs/" -ForegroundColor Yellow
    $allOk = $false
} else {
    $rustVersion = rustc --version
    Write-Host "  [OK] $rustVersion" -ForegroundColor Green
}

# Vérifier Java
$javaOk = $false
$javaHome = $env:JAVA_HOME
if ($javaHome -and (Test-Path $javaHome)) {
    $javaExe = Join-Path $javaHome "bin\java.exe"
    if (Test-Path $javaExe) {
        $javaOk = $true
        Write-Host "  [OK] Java trouve: $javaHome" -ForegroundColor Green
    }
}

if (-not $javaOk) {
    $javaPath = Get-Command java -ErrorAction SilentlyContinue
    if ($javaPath) {
        $javaOk = $true
        Write-Host "  [!] Java trouve dans PATH (JAVA_HOME recommande)" -ForegroundColor Yellow
    } else {
        Write-Host "  [X] Java JDK non trouve" -ForegroundColor Red
        Write-Host "    Installez Java JDK 17+ ou Android Studio" -ForegroundColor Yellow
        $allOk = $false
    }
}

# Vérifier Android SDK
$androidOk = $false
$androidHome = $env:ANDROID_HOME
if (-not $androidHome) {
    $androidHome = $env:ANDROID_SDK_ROOT
}

if ($androidHome -and (Test-Path $androidHome)) {
    # Vérifier que c'est un SDK valide
    if (Test-Path (Join-Path $androidHome "platform-tools\adb.exe")) {
        $androidOk = $true
        Write-Host "  [OK] Android SDK trouve: $androidHome" -ForegroundColor Green
        
        # Chercher NDK (optionnel pour l'instant, Tauri le vérifiera)
        $ndkPath = Join-Path $androidHome "ndk"
        if (Test-Path $ndkPath) {
            $ndkVersions = Get-ChildItem $ndkPath -Directory -ErrorAction SilentlyContinue
            if ($ndkVersions) {
                $latestNdk = $ndkVersions | Sort-Object Name -Descending | Select-Object -First 1
                Write-Host "  [OK] NDK trouve: $($latestNdk.Name)" -ForegroundColor Green
                $env:ANDROID_NDK_HOME = $latestNdk.FullName
            } else {
                Write-Host "  [!] NDK non trouve (sera installe si necessaire)" -ForegroundColor Yellow
            }
        } else {
            Write-Host "  [!] NDK non trouve (sera installe si necessaire)" -ForegroundColor Yellow
        }
    }
}

if (-not $androidOk) {
    Write-Host "  [X] Android SDK non trouve" -ForegroundColor Red
    Write-Host "    Installez Android Studio et configurez ANDROID_HOME" -ForegroundColor Yellow
    $allOk = $false
}

# Vérifier la cible Rust Android
if ($allOk) {
    Write-Host ""
    Write-Host "Vérification de la cible Rust Android..." -ForegroundColor Yellow
    $targetInstalled = rustup target list --installed 2>$null | Select-String "aarch64-linux-android"
    if (-not $targetInstalled) {
        Write-Host "  [!] Cible aarch64-linux-android non installee" -ForegroundColor Yellow
        Write-Host "  Installation de la cible..." -ForegroundColor Cyan
        rustup target add aarch64-linux-android
        if ($LASTEXITCODE -eq 0) {
            Write-Host "  [OK] Cible installee" -ForegroundColor Green
        } else {
            Write-Host "  [X] Erreur lors de l'installation de la cible" -ForegroundColor Red
            $allOk = $false
        }
    } else {
        Write-Host "  [OK] Cible aarch64-linux-android installee" -ForegroundColor Green
    }
}

if (-not $allOk) {
    Write-Host ""
    Write-Host "[ERREUR] Prerequis manquants" -ForegroundColor Red
    Write-Host ""
    Write-Host "Exécutez d'abord le script de configuration:" -ForegroundColor Yellow
    Write-Host "  .\scripts\setup-android.ps1" -ForegroundColor White
    exit 1
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan

# Vérifier si l'environnement Android Tauri est initialisé
$androidDir = Join-Path $PSScriptRoot "..\src-tauri\android"
$androidDir = Resolve-Path $androidDir -ErrorAction SilentlyContinue

if (-not $androidDir -or -not (Test-Path $androidDir)) {
    Write-Host ""
    Write-Host "[!] Environnement Android Tauri non initialise" -ForegroundColor Yellow
    Write-Host "Initialisation automatique..." -ForegroundColor Cyan
    Write-Host ""
    
    # Initialiser automatiquement sans demander de confirmation
    $shouldInit = $true
    
    if ($shouldInit) {
        Write-Host ""
        Write-Host "Initialisation de l'environnement Android Tauri..." -ForegroundColor Cyan
        Write-Host "(Cela peut prendre plusieurs minutes)" -ForegroundColor Gray
        Write-Host ""
        
        Set-Location (Join-Path $PSScriptRoot "..")
        
        try {
            $output = npx tauri android init 2>&1
            if ($LASTEXITCODE -eq 0) {
                Write-Host ""
                Write-Host "[OK] Environnement Android Tauri initialise !" -ForegroundColor Green
            } else {
                Write-Host ""
                Write-Host "[ERREUR] Erreur lors de l'initialisation:" -ForegroundColor Red
                Write-Host $output -ForegroundColor Red
                exit 1
            }
        } catch {
            Write-Host ""
            Write-Host "[ERREUR] Erreur lors de l'initialisation:" -ForegroundColor Red
            Write-Host $_.Exception.Message -ForegroundColor Red
            exit 1
        }
    }
}

# Déterminer la commande de build
Set-Location (Join-Path $PSScriptRoot "..")

$buildCommand = switch ($buildType) {
    "mobile" { "npm run tauri:build:android-mobile" }
    "tv" { "npm run tauri:build:android-tv" }
    default { "npm run tauri:build:android" }
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Lancement du build Android..." -ForegroundColor Cyan
Write-Host "Commande: $buildCommand" -ForegroundColor Yellow
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "[!] Le build peut prendre plusieurs minutes..." -ForegroundColor Yellow
Write-Host ""

try {
    # Exécuter le build
    Invoke-Expression $buildCommand
    
    # Le build Tauri peut echouer sur le bundling mais reussir la compilation
    # Dans ce cas, on construit l'APK manuellement avec Gradle
    $buildSucceeded = $LASTEXITCODE -eq 0
    
    if (-not $buildSucceeded) {
        Write-Host ""
        Write-Host "[INFO] Build Tauri termine (bundling non supporte)" -ForegroundColor Yellow
        Write-Host "Construction de l'APK avec Gradle..." -ForegroundColor Cyan
        Write-Host ""
        
        # Construire l'APK avec Gradle
        $androidProjectDir = Join-Path (Get-Location) "src-tauri\gen\android"
        if (Test-Path $androidProjectDir) {
            $originalDir = Get-Location
            Set-Location $androidProjectDir
            
            # Configurer les outils NDK pour Gradle
            $ndk = Get-ChildItem "$env:ANDROID_HOME\ndk" -Directory | Sort-Object Name -Descending | Select-Object -First 1
            if ($ndk) {
                $toolchainPath = Join-Path $ndk.FullName "toolchains\llvm\prebuilt\windows-x86_64\bin"
                $clang = Get-ChildItem "$toolchainPath\aarch64-linux-android*-clang.cmd" | Select-Object -First 1
                $ar = Get-ChildItem "$toolchainPath\llvm-ar.exe" | Select-Object -First 1
                if ($clang) { $env:CC_aarch64_linux_android = $clang.FullName }
                if ($ar) { $env:AR_aarch64_linux_android = $ar.FullName }
                $env:CARGO_TARGET_AARCH64_LINUX_ANDROID_LINKER = $clang.FullName
            }
            
            .\gradlew.bat assembleRelease
            $gradleSuccess = $LASTEXITCODE -eq 0
            
            Set-Location $originalDir
            
            if ($gradleSuccess) {
                $buildSucceeded = $true
            }
        }
    }
    
    if ($buildSucceeded) {
        Write-Host ""
        Write-Host "========================================" -ForegroundColor Cyan
        Write-Host "[OK] Build Android termine avec succes !" -ForegroundColor Green
        Write-Host "========================================" -ForegroundColor Cyan
        Write-Host ""
        
        # Trouver le fichier APK généré
        $apkPaths = @(
            "src-tauri\gen\android\app\build\outputs\apk\release\app-release.apk",
            "src-tauri\target\aarch64-linux-android\release\app\build\outputs\apk\release\app-release.apk",
            "src-tauri\target\aarch64-linux-android\debug\app\build\outputs\apk\debug\app-debug.apk"
        )
        
        $apkFound = $false
        foreach ($apkPath in $apkPaths) {
            $fullPath = Join-Path (Get-Location) $apkPath
            if (Test-Path $fullPath) {
                $apk = Get-Item $fullPath
                Write-Host "[APK] APK genere:" -ForegroundColor Cyan
                Write-Host "   $fullPath" -ForegroundColor White
                Write-Host "   Taille: $([math]::Round($apk.Length / 1MB, 2)) MB" -ForegroundColor Gray
                Write-Host ""
                $apkFound = $true
                break
            }
        }
        
        if (-not $apkFound) {
            Write-Host "[!] APK non trouve dans les emplacements standards" -ForegroundColor Yellow
            Write-Host "Recherche dans tout le projet..." -ForegroundColor Cyan
            Get-ChildItem "src-tauri" -Filter "*.apk" -Recurse -ErrorAction SilentlyContinue | ForEach-Object {
                Write-Host "  APK trouve: $($_.FullName)" -ForegroundColor Green
            }
        } else {
            Write-Host "Vous pouvez maintenant installer l'APK sur votre appareil Android." -ForegroundColor Green
        }
    } else {
        Write-Host ""
        Write-Host "[ERREUR] Erreur lors du build" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host ""
    Write-Host "[ERREUR] Erreur lors du build:" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    exit 1
}
