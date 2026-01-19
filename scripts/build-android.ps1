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

function Sanitize-FileName {
    param([string]$Name)
    if (-not $Name) { return "popcorn" }
    # Remplacer tout caractère non sûr pour un nom de fichier Windows
    return ($Name -replace '[^a-zA-Z0-9._-]', '_')
}

function Invoke-BuildWithProgress {
    param(
        [string]$Command,
        [string]$BuildType
    )
    
    # Définir les étapes du build avec leurs patterns de détection
    $buildSteps = @(
        @{ Name = "Nettoyage"; Pattern = "Caches nettoy|Cleaning|Nettoyage"; Percent = 5 },
        @{ Name = "Routes API"; Pattern = "Routes API|api-routes|Déplacement"; Percent = 10 },
        @{ Name = "Config Tauri"; Pattern = "Configuration Tauri|Tauri config"; Percent = 15 },
        @{ Name = "Build Astro"; Pattern = "Build Astro|Building static|astro build|built in|vite.*built"; Percent = 40 },
        @{ Name = "Build Rust"; Pattern = "Compiling|Building.*rust|cargo build|Finished.*release"; Percent = 60 },
        @{ Name = "Build Gradle"; Pattern = "Task :|Gradle|BUILD SUCCESSFUL|assemble.*Release"; Percent = 90 },
        @{ Name = "Signature APK"; Pattern = "Signing|apksigner|signed\.apk"; Percent = 95 }
    )
    
    $currentStep = 0
    $currentPercent = 0
    $startTime = Get-Date
    $errorLines = New-Object System.Collections.ArrayList
    
    Write-Progress -Activity "Build Android ($BuildType)" -Status "Démarrage..." -PercentComplete 0
    
    # Exécuter la commande et capturer la sortie ligne par ligne
    try {
        # Utiliser Invoke-Expression mais avec redirection pour capturer la sortie
        $output = Invoke-Expression $Command 2>&1 | Tee-Object -Variable allOutput
        
        # Traiter chaque ligne de sortie
        foreach ($line in $allOutput) {
            $lineStr = if ($line -is [string]) { $line } else { $line.ToString() }
            Write-Host $lineStr
            
            # Détecter les erreurs
            if ($lineStr -match "ERROR|Error|error|FAILED|Failed|failed|\[ERROR\]|\[ERREUR\]") {
                [void]$errorLines.Add($lineStr)
            }
            
            # Détecter les étapes du build
            for ($i = $currentStep; $i -lt $buildSteps.Count; $i++) {
                if ($lineStr -match $buildSteps[$i].Pattern) {
                    if ($i -ge $currentStep) {
                        $currentStep = $i
                        $currentPercent = $buildSteps[$i].Percent
                        Write-Progress -Activity "Build Android ($BuildType)" `
                            -Status $buildSteps[$i].Name `
                            -PercentComplete $currentPercent `
                            -CurrentOperation $lineStr.Trim()
                    }
                    break
                }
            }
        }
        
        $exitCode = $LASTEXITCODE
        
    } catch {
        Write-Host $_.Exception.Message -ForegroundColor Red
        $exitCode = 1
    }
    
    # Afficher la progression finale
    if ($exitCode -eq 0) {
        Write-Progress -Activity "Build Android ($BuildType)" -Status "Terminé avec succès!" -PercentComplete 100 -Completed
    } else {
        Write-Progress -Activity "Build Android ($BuildType)" -Status "Échec du build" -PercentComplete 100 -Completed
    }
    
    # Afficher les erreurs s'il y en a
    if ($errorLines.Count -gt 0 -or $exitCode -ne 0) {
        Write-Host ""
        Write-Host "========================================" -ForegroundColor Red
        Write-Host "Erreurs détectées:" -ForegroundColor Red
        Write-Host "========================================" -ForegroundColor Red
        foreach ($errorLine in $errorLines) {
            Write-Host $errorLine -ForegroundColor Red
        }
        Write-Host ""
    }
    
    $elapsed = ((Get-Date) - $startTime).TotalSeconds
    Write-Host ""
    if ($exitCode -eq 0) {
        Write-Host "[100%] Build termine avec succes en $([math]::Round($elapsed))s" -ForegroundColor Green
    } else {
        Write-Host "[ERREUR] Build echoue apres $([math]::Round($elapsed))s (code: $exitCode)" -ForegroundColor Red
    }
    Write-Host ""
    
    return $exitCode
}

function Install-ApkOnEmulator {
    param(
        [string]$ApkPath,
        [string]$ConfigPath,
        [string]$BuildType
    )

    Write-Host ""
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host "Installation automatique sur emulateur" -ForegroundColor Cyan
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host ""

    # Vérifier si adb est disponible
    $androidHome = $env:ANDROID_HOME
    if (-not $androidHome) {
        $androidHome = $env:ANDROID_SDK_ROOT
    }
    if (-not $androidHome) {
        Write-Host "[!] ANDROID_HOME non defini, installation automatique ignoree" -ForegroundColor Yellow
        return
    }

    $adbPath = Join-Path $androidHome "platform-tools\adb.exe"
    if (-not (Test-Path $adbPath)) {
        Write-Host "[!] adb.exe non trouve dans $androidHome\platform-tools, installation automatique ignoree" -ForegroundColor Yellow
        return
    }

    # Vérifier si un émulateur est connecté
    try {
        $devicesOutput = & $adbPath devices 2>&1
        $devices = $devicesOutput | Select-String -Pattern "device$" | ForEach-Object { $_.Line -split '\s+' | Select-Object -First 1 }
        
        if ($devices.Count -eq 0) {
            Write-Host "[!] Aucun emulateur Android connecte, installation automatique ignoree" -ForegroundColor Yellow
            Write-Host "    Lancez un emulateur et reessayez, ou installez manuellement l'APK" -ForegroundColor Gray
            return
        }

        Write-Host "[OK] Emulateur(s) detecte(s): $($devices -join ', ')" -ForegroundColor Green
    } catch {
        Write-Host "[!] Erreur lors de la verification des emulateurs: $_" -ForegroundColor Yellow
        return
    }

    # Récupérer le package name depuis la config
    $packageName = $null
    try {
        if (Test-Path $ConfigPath) {
            $cfg = Get-Content $ConfigPath -Raw | ConvertFrom-Json
            $packageName = $cfg.identifier
        }
    } catch {
        Write-Host "[!] Impossible de lire la config pour obtenir le package name" -ForegroundColor Yellow
    }

    if ([string]::IsNullOrWhiteSpace($packageName)) {
        # Package names par défaut selon la variante
        switch ($BuildType) {
            "mobile" { $packageName = "com.popcorn.client.mobile" }
            "tv" { $packageName = "com.popcorn.client.tv" }
            default { $packageName = "com.popcorn.client" }
        }
    }

    Write-Host "[INFO] Package name: $packageName" -ForegroundColor Gray
    Write-Host ""

    # Désinstaller l'ancienne version si elle existe
    Write-Host "Desinstallation de l'ancienne version..." -ForegroundColor Cyan
    try {
        $uninstallOutput = & $adbPath uninstall $packageName 2>&1
        if ($LASTEXITCODE -eq 0) {
            Write-Host "  [OK] Ancienne version desinstallee" -ForegroundColor Green
        } else {
            Write-Host "  [INFO] Aucune version precedente trouvee (normal pour premiere installation)" -ForegroundColor Gray
        }
    } catch {
        Write-Host "  [!] Erreur lors de la desinstallation: $_" -ForegroundColor Yellow
    }

    Write-Host ""

    # Installer la nouvelle version
    Write-Host "Installation de la nouvelle version..." -ForegroundColor Cyan
    Write-Host "  APK: $ApkPath" -ForegroundColor Gray
    try {
        $installOutput = & $adbPath install $ApkPath 2>&1
        if ($LASTEXITCODE -eq 0) {
            Write-Host "  [OK] Installation reussie!" -ForegroundColor Green
        } else {
            Write-Host "  [ERREUR] Echec de l'installation" -ForegroundColor Red
            Write-Host "  $installOutput" -ForegroundColor Red
            return
        }
    } catch {
        Write-Host "  [ERREUR] Erreur lors de l'installation: $_" -ForegroundColor Red
        return
    }

    Write-Host ""

    # Lancer l'application
    Write-Host "Lancement de l'application..." -ForegroundColor Cyan
    try {
        Start-Sleep -Seconds 2
        $launchOutput = & $adbPath shell am start -n "$packageName/.MainActivity" 2>&1
        if ($LASTEXITCODE -eq 0) {
            Write-Host "  [OK] Application lancee!" -ForegroundColor Green
        } else {
            Write-Host "  [!] Impossible de lancer l'application automatiquement" -ForegroundColor Yellow
            Write-Host "      Lancez-la manuellement depuis l'emulateur" -ForegroundColor Gray
        }
    } catch {
        Write-Host "  [!] Erreur lors du lancement: $_" -ForegroundColor Yellow
    }

    Write-Host ""
    Write-Host "[OK] Installation automatique terminee!" -ForegroundColor Green
    Write-Host ""
}

function Get-ProductInfoForVariant {
    param([string]$Variant)
    $configPath = Get-TauriConfigPath -Variant $Variant
    $productName = $null
    $version = $null
    try {
        if (Test-Path $configPath) {
            $cfg = Get-Content $configPath -Raw | ConvertFrom-Json
            $productName = $cfg.productName
            $version = $cfg.version
        }
    } catch {
        # non bloquant
    }
    if ([string]::IsNullOrWhiteSpace($productName)) { $productName = "popcorn" }
    if ([string]::IsNullOrWhiteSpace($version)) { $version = "0.0.0" }
    return @{
        ProductName = $productName
        Version = $version
    }
}

function Update-VersionForAndroidBuild {
    param(
        [Parameter(Mandatory=$true)][string]$Variant
    )

    # Charger le module de gestion de version
    $versionScript = Join-Path $PSScriptRoot "version-manager.ps1"
    if (Test-Path $versionScript) {
        . $versionScript
    } else {
        Write-Host "  [WARN] Script version-manager.ps1 introuvable, utilisation de l'ancien système" -ForegroundColor Yellow
    }

    # Obtenir et incrémenter la version depuis VERSION.json
    $versionInfo = Update-VersionBuild -Component "client" -IncrementBuild
    if (-not $versionInfo) {
        Write-Host "  [WARN] Impossible de lire la version, utilisation de valeurs par défaut" -ForegroundColor Yellow
        $versionInfo = @{
            Version = "1.0.1"
            Build = 1
            FullVersion = "1.0.1.1"
        }
    }

    $newVersion = $versionInfo.Version
    $newCode = $versionInfo.Build
    $fullVersion = $versionInfo.FullVersion

    $configPath = Get-TauriConfigPath -Variant $Variant
    if (-not (Test-Path $configPath)) { return $null }

    # IMPORTANT: on ne réécrit pas tout le JSON (ConvertTo-Json) car ça peut casser l'encodage
    # et modifier le formatage. On ne touche qu'aux champs nécessaires via regex.
    $raw = $null
    try {
        $raw = Get-Content $configPath -Raw
    } catch {
        Write-Host "  [WARN] Impossible de lire la config Tauri ($configPath) pour bump version: $($_.Exception.Message)" -ForegroundColor Yellow
        return $null
    }
    if ([string]::IsNullOrWhiteSpace($raw)) { return $null }

    # Remplacements (1 occurrence) - éviter ConvertTo-Json et préserver le reste du fichier
    $reCode = New-Object System.Text.RegularExpressions.Regex('"versionCode"\s*:\s*\d+', [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
    $updated = $reCode.Replace($raw, "`"versionCode`": $newCode", 1)

    $reVer = New-Object System.Text.RegularExpressions.Regex('"version"\s*:\s*"[^"]*"', [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
    $updated = $reVer.Replace($updated, "`"version`": `"$newVersion`"", 1)

    try {
        Set-Content -Path $configPath -Value $updated -Encoding UTF8
    } catch {
        Write-Host "  [WARN] Impossible d'écrire la config Tauri ($configPath) pour bump version: $($_.Exception.Message)" -ForegroundColor Yellow
        return $null
    }

    # Exposer la version au frontend (Astro) via import.meta.env.PUBLIC_*
    $env:PUBLIC_APP_VERSION = $newVersion
    $env:PUBLIC_APP_VERSION_CODE = "$newCode"
    $env:PUBLIC_APP_VARIANT = $Variant
    
    # S'assurer que les variables sont bien définies (pour débogage)
    Write-Host "  [DEBUG] Variables d'environnement:" -ForegroundColor Gray
    Write-Host "    PUBLIC_APP_VERSION=$($env:PUBLIC_APP_VERSION)" -ForegroundColor Gray
    Write-Host "    PUBLIC_APP_VERSION_CODE=$($env:PUBLIC_APP_VERSION_CODE)" -ForegroundColor Gray
    Write-Host "    PUBLIC_APP_VARIANT=$($env:PUBLIC_APP_VARIANT)" -ForegroundColor Gray

    Write-Host "  [OK] Version Android: version=$newVersion versionCode=$newCode (build=$fullVersion)" -ForegroundColor Green
    return @{
        Version = $newVersion
        VersionCode = $newCode
        FullVersion = $fullVersion
        ConfigPath = $configPath
    }
}

function Clean-PopcornWebApkArtifactsForVariant {
    param(
        [Parameter(Mandatory=$true)][string]$BuildType
    )

    $info = Get-ProductInfoForVariant -Variant $BuildType
    $safeName = Sanitize-FileName -Name $info.ProductName
    $variantTag = Sanitize-FileName -Name $BuildType

    $destDir = Resolve-Path (Join-Path $PSScriptRoot "..\..\popcorn-web") -ErrorAction SilentlyContinue
    if (-not $destDir) {
        Write-Host "  [WARN] Impossible de resoudre le chemin vers popcorn-web. Clean des APK ignore." -ForegroundColor Yellow
        return
    }

    $appDir = Join-Path $destDir "app"
    if (-not (Test-Path $appDir)) {
        return
    }

    # Supprimer toutes les anciennes versions pour cette variante (apk + artefacts)
    $pattern = "$safeName-v*-android-$variantTag*.apk*"
    $toDelete = Get-ChildItem -Path $appDir -File -ErrorAction SilentlyContinue | Where-Object {
        $_.Name -like $pattern
    }

    if ($toDelete -and $toDelete.Count -gt 0) {
        Write-Host "-> Clean anciens APK dans popcorn-web/app pour $safeName ($BuildType): $($toDelete.Count) fichier(s)" -ForegroundColor Yellow
        $toDelete | ForEach-Object {
            try {
                Remove-Item -Force -Path $_.FullName -ErrorAction Stop
            } catch {
                Write-Host "  [WARN] Suppression echouee: $($_.FullName) : $($_.Exception.Message)" -ForegroundColor Yellow
            }
        }
        Write-Host ""
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

# Avant le build: supprimer les anciennes versions (destination)
Clean-PopcornWebApkArtifactsForVariant -BuildType $buildType

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
            # Note: "standard" utilise tauri.conf.json (pas de --config)

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

# Bump automatique version/versionCode pour garantir un APK toujours "nouveau"
# et afficher le numéro de version dans le wizard.
Update-VersionForAndroidBuild -Variant $buildType | Out-Null

# Déterminer la commande de build
Set-Location (Join-Path $PSScriptRoot "..")

# Préparer les variables d'environnement pour cross-env
# Utiliser npx pour exécuter cross-env depuis node_modules
$versionEnv = ""
$codeEnv = ""
$variantEnv = ""
if ($env:PUBLIC_APP_VERSION) {
    $versionEnv = "PUBLIC_APP_VERSION=$($env:PUBLIC_APP_VERSION) "
}
if ($env:PUBLIC_APP_VERSION_CODE) {
    $codeEnv = "PUBLIC_APP_VERSION_CODE=$($env:PUBLIC_APP_VERSION_CODE) "
}
if ($env:PUBLIC_APP_VARIANT) {
    $variantEnv = "PUBLIC_APP_VARIANT=$($env:PUBLIC_APP_VARIANT) "
}

$buildCommand = switch ($buildType) {
    "mobile" { "npx cross-env $versionEnv$codeEnv$variantEnv npm run tauri:build:android-mobile" }
    "tv" { "npx cross-env $versionEnv$codeEnv$variantEnv npm run tauri:build:android-tv" }
    default { "npx cross-env $versionEnv$codeEnv$variantEnv npm run tauri:build:android" }
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
    # Exécuter le build avec affichage de progression
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host "Progression du build Android" -ForegroundColor Cyan
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host ""
    
    # Exécuter le build avec affichage de progression basée sur les étapes réelles
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host "Progression du build Android" -ForegroundColor Cyan
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host ""
    
    $exitCode = Invoke-BuildWithProgress -Command $buildCommand -BuildType $buildType
    
    $buildSucceeded = $exitCode -eq 0

    # Workaround Windows: si le build échoue uniquement à cause des symlinks (mode développeur non activé),
    # on copie la lib .so dans jniLibs puis on construit l'APK via Gradle en sautant la tâche Rust.
    if (-not $buildSucceeded) {
        Write-Host ""
        Write-Host "[WARN] Build Tauri Android a échoué. Tentative de contournement (copie .so + Gradle)..." -ForegroundColor Yellow

        $soPath = Join-Path $projectRoot "src-tauri\target\aarch64-linux-android\release\libpopcorn_client.so"
        $jniDir = Join-Path $projectRoot "src-tauri\gen\android\app\src\main\jniLibs\arm64-v8a"
        $jniSoPath = Join-Path $jniDir "libpopcorn_client.so"

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

        function Find-LatestApk {
            param([string[]]$SearchDirs)
            $candidates = @()
            foreach ($dir in $SearchDirs) {
                if (Test-Path $dir) {
                    $candidates += Get-ChildItem $dir -Filter "*.apk" -Recurse -File -ErrorAction SilentlyContinue
                }
            }
            if (-not $candidates -or $candidates.Count -eq 0) { return $null }
            
            # Privilégier les APK signés (sans "unsigned" dans le nom), mais accepter les unsigned si nécessaire
            $signedApks = $candidates | Where-Object { $_.Name -notlike "*unsigned*" }
            if ($signedApks -and $signedApks.Count -gt 0) {
                return ($signedApks | Sort-Object LastWriteTime -Descending | Select-Object -First 1)
            }
            
            # Si aucun APK signé, prendre le plus récent (même unsigned, on le signera après)
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
            if (-not $bt) { 
                Write-Host "  [WARN] build-tools introuvable, signature ignorée" -ForegroundColor Yellow
                return $ApkPath 
            }

            $apksigner = Join-Path $bt.FullName "apksigner.bat"
            $zipalign = Join-Path $bt.FullName "zipalign.exe"
            if (-not (Test-Path $apksigner) -or -not (Test-Path $zipalign)) { 
                Write-Host "  [WARN] apksigner/zipalign introuvables, signature ignorée" -ForegroundColor Yellow
                return $ApkPath 
            }

            # Vérifier alignement d'abord (important pour Android)
            $checkAlignCmd = "`"$zipalign`" -c 4 `"$ApkPath`" >nul 2>nul"
            & cmd /c $checkAlignCmd | Out-Null
            $needsAlign = $LASTEXITCODE -ne 0

            # Vérifier signature existante
            # Important: PowerShell peut transformer la sortie d'erreur des exécutables natifs
            # en "erreur PowerShell" (terminating) quand $ErrorActionPreference = Stop.
            # On passe donc par cmd.exe pour neutraliser stdout/stderr.
            $verifyCmd = "`"$apksigner`" verify `"$ApkPath`" >nul 2>nul"
            & cmd /c $verifyCmd | Out-Null
            $isSigned = $LASTEXITCODE -eq 0

            # Vérifier aussi par le nom du fichier (plus fiable pour les APK unsigned)
            $isUnsignedByName = $ApkPath -like "*unsigned*"
            
            # TOUJOURS re-signer l'APK pour garantir qu'il est valide et correctement signé
            # Même si l'APK semble signé, on le re-signe pour éviter les problèmes
            if ($isUnsignedByName -or -not $isSigned) {
                Write-Host "  [INFO] APK non signé détecté, signature en cours..." -ForegroundColor Cyan
            } else {
                Write-Host "  [INFO] Re-signature de l'APK pour garantir la validité..." -ForegroundColor Cyan
            }

            $ks = Ensure-DebugKeystore -JavaHome $JavaHome
            $aligned = [System.IO.Path]::ChangeExtension($ApkPath, ".aligned.apk")
            $signed = [System.IO.Path]::ChangeExtension($ApkPath, ".signed.apk")

            # Aligner l'APK (toujours, même s'il est déjà signé, car on va le re-signer)
            & $zipalign -f 4 $ApkPath $aligned 2>&1 | Out-Null
            if ($LASTEXITCODE -ne 0) { 
                Write-Host "  [ERREUR] Échec de l'alignement" -ForegroundColor Red
                return $ApkPath 
            }

            # Vérifier l'alignement
            $checkAlignedCmd = "`"$zipalign`" -c 4 `"$aligned`" >nul 2>nul"
            & cmd /c $checkAlignedCmd | Out-Null
            if ($LASTEXITCODE -ne 0) {
                Write-Host "  [ERREUR] L'APK aligné n'est pas correctement aligné" -ForegroundColor Red
                Remove-Item $aligned -Force -ErrorAction SilentlyContinue
                return $ApkPath
            }

            # Signer l'APK aligné
            & $apksigner sign `
                --ks $ks `
                --ks-key-alias "androiddebugkey" `
                --ks-pass "pass:android" `
                --key-pass "pass:android" `
                --out $signed `
                $aligned 2>&1 | Out-Null
            if ($LASTEXITCODE -ne 0) { 
                Write-Host "  [ERREUR] Échec de la signature" -ForegroundColor Red
                Remove-Item $aligned -Force -ErrorAction SilentlyContinue
                return $ApkPath 
            }

            # Vérifier la signature finale
            $verifySignedCmd = "`"$apksigner`" verify `"$signed`" >nul 2>nul"
            & cmd /c $verifySignedCmd | Out-Null
            if ($LASTEXITCODE -eq 0) {
                # Nettoyer le fichier temporaire aligné
                Remove-Item $aligned -Force -ErrorAction SilentlyContinue
                Write-Host "  [OK] APK signé et aligné avec succès" -ForegroundColor Green
                return $signed
            } else {
                Write-Host "  [ERREUR] La signature n'a pas pu être vérifiée" -ForegroundColor Red
                Remove-Item $aligned -Force -ErrorAction SilentlyContinue
                Remove-Item $signed -Force -ErrorAction SilentlyContinue
                return $ApkPath
            }
        }

        Write-Host "[APK] APK trouve (avant signature):" -ForegroundColor Cyan
        Write-Host "   $($apk.FullName)" -ForegroundColor White
        Write-Host "   Taille: $([math]::Round($apk.Length / 1MB, 2)) MB" -ForegroundColor Gray
        if ($apk.Name -like "*unsigned*") {
            Write-Host "   [!] APK non signe detecte, signature en cours..." -ForegroundColor Yellow
        }
        Write-Host ""

        # Signer l'APK (TOUJOURS, pour garantir qu'il est valide et correctement signé)
        Write-Host "[APK] Signature de l'APK (toujours re-signer pour garantir la validité)..." -ForegroundColor Cyan
        $signedApkPath = Sign-ApkIfNeeded -ApkPath $apk.FullName -AndroidHome $env:ANDROID_HOME -JavaHome $env:JAVA_HOME
        $apk = Get-Item $signedApkPath

        # Vérification finale obligatoire : l'APK DOIT être signé
        $bt = Get-LatestBuildToolsDir -AndroidHome $env:ANDROID_HOME
        if ($bt) {
            $apksigner = Join-Path $bt.FullName "apksigner.bat"
            if (Test-Path $apksigner) {
                $finalVerifyCmd = "`"$apksigner`" verify `"$($apk.FullName)`" >nul 2>nul"
                & cmd /c $finalVerifyCmd | Out-Null
                if ($LASTEXITCODE -ne 0) {
                    Write-Host "[ERREUR CRITIQUE] L'APK final n'est pas signé!" -ForegroundColor Red
                    Write-Host "   Chemin: $($apk.FullName)" -ForegroundColor Yellow
                    Write-Host "   Le build ne peut pas continuer sans un APK signé." -ForegroundColor Red
                    exit 1
                }
                Write-Host "[OK] APK final verifie: signature valide" -ForegroundColor Green
            }
        }

        Write-Host "[APK] APK final (apres signature):" -ForegroundColor Cyan
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
            
            # Vérifier que l'APK est bien signé avant de le copier
            $bt = Get-LatestBuildToolsDir -AndroidHome $env:ANDROID_HOME
            if ($bt) {
                $apksigner = Join-Path $bt.FullName "apksigner.bat"
                if (Test-Path $apksigner) {
                    $verifyFinalCmd = "`"$apksigner`" verify `"$($apk.FullName)`" >nul 2>nul"
                    & cmd /c $verifyFinalCmd | Out-Null
                    if ($LASTEXITCODE -ne 0) {
                        Write-Host "[ERREUR] L'APK n'est pas signé correctement avant la copie!" -ForegroundColor Red
                        Write-Host "   Chemin: $($apk.FullName)" -ForegroundColor Yellow
                        Write-Host "   Veuillez re-signer l'APK avec: .\scripts\fix-apk-signature.ps1 -ApkPath `"$($apk.FullName)`"" -ForegroundColor Yellow
                        exit 1
                    }
                }
            }
            
            Copy-Item -Path $apk.FullName -Destination $destFile -Force

            Write-Host "[OK] APK copie dans:" -ForegroundColor Green
            Write-Host "   $destFile" -ForegroundColor White
            Write-Host ""
            
            # Vérification finale après copie
            if ($bt) {
                $apksigner = Join-Path $bt.FullName "apksigner.bat"
                if (Test-Path $apksigner) {
                    $verifyCopiedCmd = "`"$apksigner`" verify `"$destFile`" >nul 2>nul"
                    & cmd /c $verifyCopiedCmd | Out-Null
                    if ($LASTEXITCODE -eq 0) {
                        Write-Host "[OK] APK copie est correctement signe et pret pour l'installation" -ForegroundColor Green
                    } else {
                        Write-Host "[WARN] L'APK copie ne semble pas signe, re-signature..." -ForegroundColor Yellow
                        $reSigned = Sign-ApkIfNeeded -ApkPath $destFile -AndroidHome $env:ANDROID_HOME -JavaHome $env:JAVA_HOME
                        if ($reSigned -ne $destFile) {
                            Copy-Item -Path $reSigned -Destination $destFile -Force
                            Write-Host "[OK] APK re-signe avec succes" -ForegroundColor Green
                        }
                    }
                }
            }
            Write-Host ""

            # Installation automatique sur l'émulateur Android si disponible
            Install-ApkOnEmulator -ApkPath $destFile -ConfigPath $configPath -BuildType $buildType
        } else {
            # Si l'APK n'a pas été copié dans popcorn-web/app, essayer quand même l'installation avec l'APK local
            Write-Host "[INFO] APK local disponible, tentative d'installation automatique..." -ForegroundColor Yellow
            Install-ApkOnEmulator -ApkPath $apk.FullName -ConfigPath $configPath -BuildType $buildType
        }

        Write-Host "Build termine avec succes!" -ForegroundColor Green
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
