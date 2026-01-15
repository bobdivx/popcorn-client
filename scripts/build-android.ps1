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

# Racine du projet (popcorn-client)
$projectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")

# Fonction pour vérifier si une commande existe
function Test-Command {
    param([string]$Command)
    $null -ne (Get-Command $Command -ErrorAction SilentlyContinue)
}

function Get-TauriConfigPath {
    param([string]$Variant)
    switch ($Variant) {
        "mobile" { return (Join-Path $projectRoot "src-tauri\tauri.android.mobile.conf.json") }
        "tv" { return (Join-Path $projectRoot "src-tauri\tauri.android.conf.json") }
        default { return (Join-Path $projectRoot "src-tauri\tauri.conf.json") }
    }
}

function Get-ExpectedAndroidJavaDir {
    param([string]$Variant)
    $configPath = Get-TauriConfigPath -Variant $Variant
    if (-not (Test-Path $configPath)) { return $null }
    try {
        $cfg = Get-Content $configPath -Raw | ConvertFrom-Json
        $identifier = $cfg.identifier
        if ([string]::IsNullOrWhiteSpace($identifier)) { return $null }
        $pkgPath = $identifier -replace '\.', '\'
        return (Join-Path (Join-Path $projectRoot "src-tauri\gen\android\app\src\main\java") $pkgPath)
    } catch {
        return $null
    }
}

function Ensure-AndroidCleartextTrafficEnabled {
    param(
        [Parameter(Mandatory=$true)]
        [string]$AndroidAppGradlePath
    )

    if (-not (Test-Path $AndroidAppGradlePath)) {
        Write-Host "  [WARN] build.gradle.kts introuvable: $AndroidAppGradlePath" -ForegroundColor Yellow
        return
    }

    try {
        $content = Get-Content $AndroidAppGradlePath -Raw
        # Tauri Android utilise un placeholder manifestPlaceholders["usesCleartextTraffic"].
        # En release, par défaut c'est souvent "false" => HTTP bloqué (Android 9+).
        $updated = $content -replace 'manifestPlaceholders\["usesCleartextTraffic"\]\s*=\s*"false"', 'manifestPlaceholders["usesCleartextTraffic"] = "true"'

        if ($updated -ne $content) {
            Set-Content -Path $AndroidAppGradlePath -Value $updated -Encoding UTF8
            Write-Host "  [OK] Cleartext HTTP activé (release) dans build.gradle.kts" -ForegroundColor Green
        } else {
            Write-Host "  [OK] Cleartext HTTP déjà activé (ou pattern non trouvé)" -ForegroundColor Green
        }
    } catch {
        Write-Host "  [WARN] Impossible de patcher usesCleartextTraffic: $($_.Exception.Message)" -ForegroundColor Yellow
    }
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
                    # Rust utilise ce linker pour la target Android (évite l'erreur "linker cc not found")
                    $env:CARGO_TARGET_AARCH64_LINUX_ANDROID_LINKER = $clang.FullName
                    # Certains toolchains regardent aussi CC/AR génériques
                    if (-not $env:CC) { $env:CC = $clang.FullName }
                }
                if ($ar) {
                    $env:AR_aarch64_linux_android = $ar.FullName
                    if (-not $env:AR) { $env:AR = $ar.FullName }
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

# Vérifier si l'environnement Android Tauri est initialisé (Tauri v2 génère dans src-tauri/gen/android)
$androidDirPath = Join-Path $projectRoot "src-tauri\gen\android"
$expectedJavaDir = Get-ExpectedAndroidJavaDir -Variant $buildType

$needsInit = $false
if (-not (Test-Path $androidDirPath)) {
    $needsInit = $true
} elseif ($expectedJavaDir -and -not (Test-Path $expectedJavaDir)) {
    Write-Host ""
    Write-Host "[!] Projet Android existant ne correspond pas à la variante '$buildType'." -ForegroundColor Yellow
    Write-Host "    (Package Java attendu introuvable: $expectedJavaDir)" -ForegroundColor Gray
    Write-Host "    Suppression de src-tauri/gen/android pour régénérer..." -ForegroundColor Cyan

    # Tuer les daemons Gradle éventuels (verrouillage Windows)
    $gradlew = Join-Path $androidDirPath "gradlew.bat"
    if (Test-Path $gradlew) {
        try {
            $prev = Get-Location
            Set-Location $androidDirPath
            .\gradlew.bat --stop | Out-Null
        } catch {
            # non bloquant
        } finally {
            if ($prev) { Set-Location $prev }
        }
    }

    $deleted = $false
    for ($i = 1; $i -le 6; $i++) {
        try {
            if (Test-Path $androidDirPath) {
                Remove-Item -Recurse -Force -Path $androidDirPath -ErrorAction Stop
            }
            $deleted = $true
            break
        } catch {
            Write-Host "    [WARN] Suppression échouée (tentative $i/6): $($_.Exception.Message)" -ForegroundColor Yellow
            Start-Sleep -Seconds 2
        }
    }

    if (-not $deleted) {
        Write-Host "[ERREUR] Impossible de supprimer $androidDirPath (fichiers verrouillés)." -ForegroundColor Red
        Write-Host "Fermez Android Studio/Gradle et relancez." -ForegroundColor Yellow
        exit 1
    }
    $needsInit = $true
}

if ($needsInit) {
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
        
        Set-Location $projectRoot
        
        try {
            Write-Host "  ANDROID_HOME: $env:ANDROID_HOME" -ForegroundColor Gray
            Write-Host "  ANDROID_SDK_ROOT: $env:ANDROID_SDK_ROOT" -ForegroundColor Gray
            Write-Host "  JAVA_HOME: $env:JAVA_HOME" -ForegroundColor Gray

            # Forcer la présence des variables d'environnement pour le process enfant (robuste sur Windows)
            $androidHomeForCmd = if ($env:ANDROID_HOME) { $env:ANDROID_HOME } else { "" }
            $androidSdkRootForCmd = if ($env:ANDROID_SDK_ROOT) { $env:ANDROID_SDK_ROOT } else { $androidHomeForCmd }
            $androidNdkHomeForCmd = if ($env:ANDROID_NDK_HOME) { $env:ANDROID_NDK_HOME } else { "" }
            $javaHomeForCmd = if ($env:JAVA_HOME) { $env:JAVA_HOME } else { "" }

            $initConfigArg = ""
            if ($buildType -eq "mobile") { $initConfigArg = " --config src-tauri\tauri.android.mobile.conf.json" }
            elseif ($buildType -eq "tv") { $initConfigArg = " --config src-tauri\tauri.android.conf.json" }

            $cmdArgs = 'set "ANDROID_HOME=' + $androidHomeForCmd + '"&& ' +
                       'set "ANDROID_SDK_ROOT=' + $androidSdkRootForCmd + '"&& ' +
                       'set "ANDROID_NDK_HOME=' + $androidNdkHomeForCmd + '"&& ' +
                       'set "NDK_HOME=' + $androidNdkHomeForCmd + '"&& ' +
                       'set "JAVA_HOME=' + $javaHomeForCmd + '"&& ' +
                       ('npx tauri android init --ci -v' + $initConfigArg)

            & cmd /c $cmdArgs
            if ($LASTEXITCODE -eq 0) {
                Write-Host ""
                Write-Host "[OK] Environnement Android Tauri initialise !" -ForegroundColor Green
            } else {
                Write-Host ""
                Write-Host "[ERREUR] Erreur lors de l'initialisation:" -ForegroundColor Red
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

# Important: en release Android, HTTP est bloqué si usesCleartextTraffic=false.
# Comme le setup utilise souvent un backend en LAN (http://ip:3000), on l'active ici
# après init/régénération du projet Android et avant le build.
$androidAppGradle = Join-Path $projectRoot "src-tauri\gen\android\app\build.gradle.kts"
Ensure-AndroidCleartextTrafficEnabled -AndroidAppGradlePath $androidAppGradle

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
    
    $buildSucceeded = $LASTEXITCODE -eq 0

    # Workaround Windows: si le build échoue uniquement à cause des symlinks (mode développeur non activé),
    # on copie la lib .so dans jniLibs puis on construit l'APK via Gradle en sautant la tâche Rust.
    if (-not $buildSucceeded) {
        Write-Host ""
        Write-Host "[WARN] Build Tauri Android a échoué. Tentative de contournement (copie .so + Gradle)..." -ForegroundColor Yellow

        $soPath = Join-Path $projectRoot "src-tauri\target\aarch64-linux-android\release\libpopcorn_vercel_client.so"
        $jniDir = Join-Path $projectRoot "src-tauri\gen\android\app\src\main\jniLibs\arm64-v8a"
        $jniSoPath = Join-Path $jniDir "libpopcorn_vercel_client.so"

        if (-not (Test-Path $soPath)) {
            Write-Host "[ERREUR] La bibliothèque Android n'a pas été générée: $soPath" -ForegroundColor Red
            Write-Host "Activez Windows Developer Mode (ou lancez en admin) ou corrigez l'erreur de build ci-dessus." -ForegroundColor Yellow
            exit 1
        }

        New-Item -ItemType Directory -Force -Path $jniDir | Out-Null
        Copy-Item -Path $soPath -Destination $jniSoPath -Force
        Write-Host "  [OK] Copie lib -> jniLibs: $jniSoPath" -ForegroundColor Green

        $androidProjectDir = Join-Path $projectRoot "src-tauri\gen\android"
        if (-not (Test-Path $androidProjectDir)) {
            Write-Host "[ERREUR] Projet Android introuvable: $androidProjectDir" -ForegroundColor Red
            exit 1
        }

        $originalDir = Get-Location
        Set-Location $androidProjectDir
        try {
            # On build uniquement la variante arm64, en sautant le task rustBuildArm64Release (sinon relance tauri et retombe sur les symlinks)
            .\gradlew.bat :app:assembleArm64Release -x :app:rustBuildArm64Release
            $buildSucceeded = $LASTEXITCODE -eq 0
        } finally {
            Set-Location $originalDir
        }

        if (-not $buildSucceeded) {
            Write-Host ""
            Write-Host "[ERREUR] Le workaround Gradle a échoué. Voir les logs ci-dessus." -ForegroundColor Red
            exit 1
        }
    }
    
    if ($buildSucceeded) {
        Write-Host ""
        Write-Host "========================================" -ForegroundColor Cyan
        Write-Host "[OK] Build Android termine avec succes !" -ForegroundColor Green
        Write-Host "========================================" -ForegroundColor Cyan
        Write-Host ""

        function Sanitize-FileName {
            param([string]$Name)
            if (-not $Name) { return "popcorn" }
            # Remplacer tout caractère non sûr pour un nom de fichier Windows
            return ($Name -replace '[^a-zA-Z0-9._-]', '_')
        }

        function Find-LatestApk {
            param([string[]]$SearchDirs)
            $candidates = @()
            foreach ($dir in $SearchDirs) {
                if (Test-Path $dir) {
                    $candidates += Get-ChildItem $dir -Filter "*.apk" -Recurse -File -ErrorAction SilentlyContinue
                }
            }
            if (-not $candidates -or $candidates.Count -eq 0) { return $null }
            return ($candidates | Sort-Object LastWriteTime -Descending | Select-Object -First 1)
        }

        # Trouver l'APK généré (on privilégie les outputs Gradle)
        $searchDirs = @(
            (Join-Path (Get-Location) "src-tauri\gen\android\app\build\outputs\apk"),
            (Join-Path (Get-Location) "src-tauri\target\aarch64-linux-android\release"),
            (Join-Path (Get-Location) "src-tauri\target\aarch64-linux-android\debug")
        )

        $apk = Find-LatestApk -SearchDirs $searchDirs

        if (-not $apk) {
            Write-Host "[!] APK non trouve dans les emplacements standards" -ForegroundColor Yellow
            Write-Host "Recherche dans src-tauri..." -ForegroundColor Cyan
            $apk = Find-LatestApk -SearchDirs @((Join-Path (Get-Location) "src-tauri"))
        }

        if (-not $apk) {
            Write-Host "[ERREUR] Aucun APK n'a ete trouve apres le build." -ForegroundColor Red
            exit 1
        }

        function Get-LatestBuildToolsDir {
            param([string]$AndroidHome)
            if (-not $AndroidHome) { return $null }
            $btRoot = Join-Path $AndroidHome "build-tools"
            if (-not (Test-Path $btRoot)) { return $null }
            return (Get-ChildItem $btRoot -Directory | Sort-Object Name -Descending | Select-Object -First 1)
        }

        function Ensure-DebugKeystore {
            param([string]$JavaHome)
            $androidUserDir = Join-Path $env:USERPROFILE ".android"
            $ksPath = Join-Path $androidUserDir "debug.keystore"

            if (Test-Path $ksPath) { return $ksPath }

            New-Item -ItemType Directory -Force -Path $androidUserDir | Out-Null

            $keytool = "keytool"
            if ($JavaHome) {
                $candidate = Join-Path $JavaHome "bin\keytool.exe"
                if (Test-Path $candidate) { $keytool = $candidate }
            }

            & $keytool -genkeypair -noprompt `
                -keystore $ksPath `
                -storepass "android" `
                -keypass "android" `
                -alias "androiddebugkey" `
                -dname "CN=Android Debug,O=Android,C=US" `
                -keyalg RSA -keysize 2048 -validity 10000 | Out-Null

            return $ksPath
        }

        function Sign-ApkIfNeeded {
            param(
                [Parameter(Mandatory=$true)][string]$ApkPath,
                [Parameter(Mandatory=$true)][string]$AndroidHome,
                [Parameter(Mandatory=$true)][string]$JavaHome
            )

            $bt = Get-LatestBuildToolsDir -AndroidHome $AndroidHome
            if (-not $bt) { return $ApkPath }

            $apksigner = Join-Path $bt.FullName "apksigner.bat"
            $zipalign = Join-Path $bt.FullName "zipalign.exe"
            if (-not (Test-Path $apksigner) -or -not (Test-Path $zipalign)) { return $ApkPath }

            # Vérifier signature existante
            # Important: PowerShell peut transformer la sortie d'erreur des exécutables natifs
            # en "erreur PowerShell" (terminating) quand $ErrorActionPreference = Stop.
            # On passe donc par cmd.exe pour neutraliser stdout/stderr.
            $verifyCmd = "`"$apksigner`" verify `"$ApkPath`" >nul 2>nul"
            & cmd /c $verifyCmd | Out-Null
            if ($LASTEXITCODE -eq 0) { return $ApkPath }

            $ks = Ensure-DebugKeystore -JavaHome $JavaHome
            $aligned = [System.IO.Path]::ChangeExtension($ApkPath, ".aligned.apk")
            $signed = [System.IO.Path]::ChangeExtension($ApkPath, ".signed.apk")

            & $zipalign -f 4 $ApkPath $aligned | Out-Null
            if ($LASTEXITCODE -ne 0) { return $ApkPath }

            & $apksigner sign `
                --ks $ks `
                --ks-key-alias "androiddebugkey" `
                --ks-pass "pass:android" `
                --key-pass "pass:android" `
                --out $signed `
                $aligned | Out-Null
            if ($LASTEXITCODE -ne 0) { return $ApkPath }

            $verifySignedCmd = "`"$apksigner`" verify `"$signed`" >nul 2>nul"
            & cmd /c $verifySignedCmd | Out-Null
            if ($LASTEXITCODE -eq 0) { return $signed }

            return $ApkPath
        }

        $apk = Get-Item (Sign-ApkIfNeeded -ApkPath $apk.FullName -AndroidHome $env:ANDROID_HOME -JavaHome $env:JAVA_HOME)

        Write-Host "[APK] APK genere:" -ForegroundColor Cyan
        Write-Host "   $($apk.FullName)" -ForegroundColor White
        Write-Host "   Taille: $([math]::Round($apk.Length / 1MB, 2)) MB" -ForegroundColor Gray
        Write-Host ""

        # Lire la config Tauri correspondante pour nommer l'APK exporté
        $configPath = Get-TauriConfigPath -Variant $buildType
        $productName = $null
        $version = $null
        try {
            if (Test-Path $configPath) {
                $cfg = Get-Content $configPath -Raw | ConvertFrom-Json
                $productName = $cfg.productName
                $version = $cfg.version
            }
        } catch {
            # Pas bloquant: on tombera sur des valeurs par défaut
        }

        if ([string]::IsNullOrWhiteSpace($productName)) { $productName = "popcorn" }
        if ([string]::IsNullOrWhiteSpace($version)) { $version = "0.0.0" }

        $safeName = Sanitize-FileName -Name $productName
        $safeVersion = Sanitize-FileName -Name $version
        $variantTag = Sanitize-FileName -Name $buildType

        # Dossier de destination demandé: popcorn-web/app
        $destDir = Resolve-Path (Join-Path $PSScriptRoot "..\..\popcorn-web") -ErrorAction SilentlyContinue
        if (-not $destDir) {
            Write-Host "[!] Impossible de resoudre le chemin vers popcorn-web (attendu a cote de popcorn-client)" -ForegroundColor Yellow
        } else {
            $appDir = Join-Path $destDir "app"
            New-Item -ItemType Directory -Force -Path $appDir | Out-Null

            $destFile = Join-Path $appDir "$safeName-v$safeVersion-android-$variantTag.apk"
            Copy-Item -Path $apk.FullName -Destination $destFile -Force

            Write-Host "[OK] APK copie dans:" -ForegroundColor Green
            Write-Host "   $destFile" -ForegroundColor White
            Write-Host ""
        }

        Write-Host "Vous pouvez maintenant installer l'APK sur votre appareil Android." -ForegroundColor Green
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
