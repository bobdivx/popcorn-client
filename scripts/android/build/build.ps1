# Script de build Android avec Tauri
# Usage: .\scripts\android\build\build.ps1 [mobile|tv|standard]
# Affiche la progression en temps réel comme build-tauri.js

param(
    [Parameter(Position=0)]
    [ValidateSet("mobile", "tv", "standard", "")]
    [string]$Variant = "standard"
)

$ErrorActionPreference = "Stop"

# Importer les fonctions et variables communes
. "$PSScriptRoot\..\..\_common\variables.ps1"
. "$PSScriptRoot\..\..\_common\functions.ps1"

# Déterminer la variante
$buildType = if ($Variant -eq "mobile") { "mobile" } elseif ($Variant -eq "tv") { "tv" } else { "standard" }

Write-Section "Build Android avec Tauri ($buildType)"

# Configuration des variables d'environnement depuis les variables communes
if (-not $env:JAVA_HOME -or -not (Test-Path $env:JAVA_HOME)) {
    if ($script:JavaHome) {
        $env:JAVA_HOME = $script:JavaHome
        Write-Info "Java détecté automatiquement: $script:JavaHome"
    }
}

if (-not $env:ANDROID_HOME -or -not (Test-Path $env:ANDROID_HOME)) {
    if ($script:AndroidHome) {
        $env:ANDROID_HOME = $script:AndroidHome
        $env:ANDROID_SDK_ROOT = $script:AndroidHome
        Write-Info "Android SDK détecté automatiquement: $script:AndroidHome"
    }
}

# Configuration NDK pour Rust
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
                    $env:CARGO_TARGET_AARCH64_LINUX_ANDROID_LINKER = $clang.FullName
                    if (-not $env:CC) { $env:CC = $clang.FullName }
                }
                if ($ar) {
                    $env:AR_aarch64_linux_android = $ar.FullName
                    if (-not $env:AR) { $env:AR = $ar.FullName }
                }
            }
        }
    }
}

# Fonctions internes pour le build (non partagées car spécifiques au build)
function Clean-PopcornWebApkArtifacts {
    param([string]$BuildType)
    $info = Get-ProductInfoForVariant -Variant $BuildType
    $safeName = Sanitize-FileName -Name $info.ProductName
    $variantTag = Sanitize-FileName -Name $BuildType
    $destDir = Resolve-Path (Join-Path $script:ProjectRoot "..\popcorn-web") -ErrorAction SilentlyContinue
    if (-not $destDir) { return }
    $appDir = Join-Path $destDir "app"
    if (-not (Test-Path $appDir)) { return }
    $pattern = "$safeName-v*.apk*"
    $toDelete = Get-ChildItem -Path $appDir -File -ErrorAction SilentlyContinue | Where-Object { $_.Name -like $pattern }
    if ($toDelete -and $toDelete.Count -gt 0) {
        Write-Info "Nettoyage de $($toDelete.Count) ancien(s) APK(s) dans popcorn-web/app"
        $toDelete | Remove-Item -Force -ErrorAction SilentlyContinue
    }
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
    } catch {}
    if ([string]::IsNullOrWhiteSpace($productName)) { $productName = "popcorn" }
    if ([string]::IsNullOrWhiteSpace($version)) { $version = "0.0.0" }
    return @{ ProductName = $productName; Version = $version }
}

function Update-VersionForAndroidBuild {
    param([string]$Variant)
    $configPath = Get-TauriConfigPath -Variant $Variant
    if (-not (Test-Path $configPath)) { 
        Write-Warn "Config Tauri introuvable: $configPath"
        return $null 
    }
    $raw = Get-Content $configPath -Raw -ErrorAction SilentlyContinue
    if ([string]::IsNullOrWhiteSpace($raw)) { 
        Write-Err "Config Tauri vide ou invalide: $configPath"
        return $null 
    }
    
    # Charger le module de gestion de version
    # Utiliser $script:ProjectRoot défini dans variables.ps1 (déjà importé)
    $versionScript = Join-Path $script:ProjectRoot "scripts\version-manager.ps1"
    
    if (Test-Path $versionScript) {
        Write-Host "  [INFO] Chargement du script de version: $versionScript" -ForegroundColor Gray
        . $versionScript
    } else {
        Write-Warn "Script version-manager.ps1 introuvable à: $versionScript"
        Write-Warn "Racine projet: $script:ProjectRoot"
        Write-Warn "Utilisation de l'ancien système de version"
        # Fallback vers l'ancien système
        $mCode = [regex]::Match($raw, '"versionCode"\s*:\s*(\d+)')
        $oldCode = if ($mCode.Success) { [int]$mCode.Groups[1].Value } else { 0 }
        if ($oldCode -lt 1) { $oldCode = 1 }
        $newCode = $oldCode + 1
        
        $mVer = [regex]::Match($raw, '"version"\s*:\s*"([^"]*)"')
        $base = if ($mVer.Success -and ($mVer.Groups[1].Value -match '^\d+\.\d+\.\d+')) { ($mVer.Groups[1].Value -split '\+')[0] } else { "1.0.1" }
        $newVersion = "$base"
        
        $reCode = New-Object System.Text.RegularExpressions.Regex('"versionCode"\s*:\s*\d+')
        $updated = $reCode.Replace($raw, "`"versionCode`": $newCode", 1)
        $reVer = New-Object System.Text.RegularExpressions.Regex('"version"\s*:\s*"[^"]*"')
        $updated = $reVer.Replace($updated, "`"version`": `"$newVersion`"", 1)
        
        try {
            Set-Content -Path $configPath -Value $updated -Encoding UTF8 -NoNewline -ErrorAction Stop
            $verify = Get-Content $configPath -Raw -ErrorAction SilentlyContinue
            if ([string]::IsNullOrWhiteSpace($verify)) {
                Write-Err "Écriture de la config Tauri a échoué (fichier vide après écriture): $configPath"
                return $null
            }
        } catch {
            Write-Err "Erreur lors de l'écriture de la config Tauri: $_"
            return $null
        }
        
        $env:PUBLIC_APP_VERSION = $newVersion
        $env:PUBLIC_APP_VERSION_CODE = "$newCode"
        $env:PUBLIC_APP_VARIANT = $Variant
        
        Write-Ok "Version Android (ancien système): version=$newVersion versionCode=$newCode"
        return @{ Version = $newVersion; VersionCode = $newCode; FullVersion = "$newVersion.$newCode" }
    }

    # Obtenir et incrémenter la version depuis VERSION.json
    $versionInfo = Update-VersionBuild -Component "client" -IncrementBuild
    if (-not $versionInfo) {
        Write-Warn "Impossible de lire la version, utilisation de valeurs par défaut"
        $versionInfo = @{
            Version = "1.0.1"
            Build = 1
            FullVersion = "1.0.1.1"
        }
    }

    $newVersion = $versionInfo.Version
    $newCode = $versionInfo.Build
    $fullVersion = $versionInfo.FullVersion
    
    $reCode = New-Object System.Text.RegularExpressions.Regex('"versionCode"\s*:\s*\d+')
    $updated = $reCode.Replace($raw, "`"versionCode`": $newCode", 1)
    $reVer = New-Object System.Text.RegularExpressions.Regex('"version"\s*:\s*"[^"]*"')
    $updated = $reVer.Replace($updated, "`"version`": `"$newVersion`"", 1)
    
    try {
        Set-Content -Path $configPath -Value $updated -Encoding UTF8 -NoNewline -ErrorAction Stop
        # Vérifier que le fichier est valide après écriture
        $verify = Get-Content $configPath -Raw -ErrorAction SilentlyContinue
        if ([string]::IsNullOrWhiteSpace($verify)) {
            Write-Err "Écriture de la config Tauri a échoué (fichier vide après écriture): $configPath"
            return $null
        }
    } catch {
        Write-Err "Erreur lors de l'écriture de la config Tauri: $_"
        return $null
    }
    
    $env:PUBLIC_APP_VERSION = $newVersion
    $env:PUBLIC_APP_VERSION_CODE = "$newCode"
    $env:PUBLIC_APP_VARIANT = $Variant
    
    Write-Ok "Version Android: version=$newVersion versionCode=$newCode (build=$fullVersion)"
    return @{ Version = $newVersion; VersionCode = $newCode; FullVersion = $fullVersion }
}

function Ensure-AndroidCleartextTrafficEnabled {
    param([string]$AndroidAppGradlePath)
    if (-not (Test-Path $AndroidAppGradlePath)) { return }
    try {
        $content = Get-Content $AndroidAppGradlePath -Raw
        $updated = $content -replace 'manifestPlaceholders\["usesCleartextTraffic"\]\s*=\s*"false"', 'manifestPlaceholders["usesCleartextTraffic"] = "true"'
        if ($updated -ne $content) {
            Set-Content -Path $AndroidAppGradlePath -Value $updated -Encoding UTF8
            Write-Ok "Cleartext HTTP activé (release) dans build.gradle.kts"
        }
    } catch {}
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
        return (Join-Path (Join-Path $script:ProjectRoot "src-tauri\gen\android\app\src\main\java") $pkgPath)
    } catch { return $null }
}

# Vérifier les prérequis
Write-Info "Vérification des prérequis..."

$allOk = $true

if (-not (Test-Command "rustc")) {
    Write-Err "Rust non installé - Installez depuis: https://rustup.rs/"
    $allOk = $false
} else {
    Write-Ok "$(rustc --version)"
}

$javaOk = $false
if ($env:JAVA_HOME -and (Test-Path $env:JAVA_HOME)) {
    $javaExe = Join-Path $env:JAVA_HOME "bin\java.exe"
    if (Test-Path $javaExe) {
        $javaOk = $true
        Write-Ok "Java trouvé: $env:JAVA_HOME"
    }
}
if (-not $javaOk) {
    $javaPath = Get-Command java -ErrorAction SilentlyContinue
    if ($javaPath) {
        Write-Warn "Java trouvé dans PATH (JAVA_HOME recommandé)"
        $javaOk = $true
    } else {
        Write-Err "Java JDK non trouvé - Installez Java JDK 17+ ou Android Studio"
        $allOk = $false
    }
}

$androidOk = $false
if ($env:ANDROID_HOME -and (Test-Path $env:ANDROID_HOME)) {
    if (Test-Path (Join-Path $env:ANDROID_HOME "platform-tools\adb.exe")) {
        $androidOk = $true
        Write-Ok "Android SDK trouvé: $env:ANDROID_HOME"
    }
}
if (-not $androidOk) {
    Write-Err "Android SDK non trouvé - Installez Android Studio et configurez ANDROID_HOME"
    $allOk = $false
}

if ($allOk) {
    $targetInstalled = rustup target list --installed 2>$null | Select-String "aarch64-linux-android"
    if (-not $targetInstalled) {
        Write-Info "Installation de la cible aarch64-linux-android..."
        rustup target add aarch64-linux-android
        if ($LASTEXITCODE -eq 0) {
            Write-Ok "Cible installée"
        } else {
            Write-Err "Erreur lors de l'installation de la cible"
            $allOk = $false
        }
    } else {
        Write-Ok "Cible aarch64-linux-android installée"
    }
}

if (-not $allOk) {
    Write-Err "Prérequis manquants"
    Write-Info "Exécutez d'abord: npm run android:setup"
    exit 1
}

# Nettoyer les anciens APK
Clean-PopcornWebApkArtifacts -BuildType $buildType

# Vérifier/initialiser le projet Android Tauri
$androidDirPath = Join-Path $script:ProjectRoot "src-tauri\gen\android"
$expectedJavaDir = Get-ExpectedAndroidJavaDir -Variant $buildType
# Note: tauri.build.gradle.kts est généré dynamiquement pendant le build par Gradle (via tauri android android-studio-script)
# Ne pas vérifier son existence ici car il sera créé automatiquement lors des tâches Rust
$needsInit = (-not (Test-Path $androidDirPath)) -or ($expectedJavaDir -and -not (Test-Path $expectedJavaDir))

# Fonction pour s'assurer que build.gradle.kts utilise Java 17
function Ensure-Java17Config {
    param([string]$AndroidDirPath)
    
    $buildGradle = Join-Path $AndroidDirPath "app\build.gradle.kts"
    if (-not (Test-Path $buildGradle)) {
        return
    }
    
    $content = Get-Content $buildGradle -Raw
    $needsUpdate = $false
    
    # Vérifier et ajouter compileOptions si manquant
    if ($content -notmatch "compileOptions\s*\{") {
        $needsUpdate = $true
        # Ajouter compileOptions après defaultConfig
        $content = $content -replace "(defaultConfig\s*\{[^}]*\})", "`$1`n    compileOptions {`n        sourceCompatibility = JavaVersion.VERSION_17`n        targetCompatibility = JavaVersion.VERSION_17`n    }"
    }
    
    # Vérifier et mettre à jour jvmTarget
    if ($content -match 'jvmTarget\s*=\s*"1\.8"') {
        $needsUpdate = $true
        $content = $content -replace 'jvmTarget\s*=\s*"1\.8"', 'jvmTarget = "17"'
    }
    
    if ($needsUpdate) {
        Set-Content -Path $buildGradle -Value $content -NoNewline
        Write-Info "Configuration Java 17 appliquée à build.gradle.kts"
    }
}

if ($needsInit -and (Test-Path $androidDirPath)) {
    Write-Info "Projet Android existant ne correspond pas à la variante '$buildType', régénération..."
    
    $gradlew = Join-Path $androidDirPath "gradlew.bat"
    if (Test-Path $gradlew) {
        Push-Location $androidDirPath
        .\gradlew.bat --stop | Out-Null
        Pop-Location
        
        # Nettoyer les caches Gradle/Kotlin pour éviter les erreurs de chemins relatifs entre lecteurs
        $gradleCache = Join-Path $androidDirPath ".gradle"
        $buildCache = Join-Path $androidDirPath "build"
        if (Test-Path $gradleCache) {
            Remove-Item -Recurse -Force $gradleCache -ErrorAction SilentlyContinue
            Write-Info "Cache .gradle nettoyé"
        }
        if (Test-Path $buildCache) {
            Remove-Item -Recurse -Force $buildCache -ErrorAction SilentlyContinue
            Write-Info "Cache build nettoyé"
        }
    }
    
    for ($i = 1; $i -le 6; $i++) {
        try {
            if (Test-Path $androidDirPath) {
                Remove-Item -Recurse -Force -Path $androidDirPath -ErrorAction Stop
            }
            break
        } catch {
            if ($i -eq 6) {
                Write-Err "Impossible de supprimer $androidDirPath (fichiers verrouillés). Fermez Android Studio/Gradle."
                exit 1
            }
            Start-Sleep -Seconds 2
        }
    }
}

if ($needsInit) {
    Write-Info "Initialisation de l'environnement Android Tauri..."
    
    $androidHomeForCmd = if ($env:ANDROID_HOME) { $env:ANDROID_HOME } else { "" }
    $androidSdkRootForCmd = if ($env:ANDROID_SDK_ROOT) { $env:ANDROID_SDK_ROOT } else { $androidHomeForCmd }
    $androidNdkHomeForCmd = if ($env:ANDROID_NDK_HOME) { $env:ANDROID_NDK_HOME } else { "" }
    $javaHomeForCmd = if ($env:JAVA_HOME) { $env:JAVA_HOME } else { "" }
    
    $initConfigArg = switch ($buildType) {
        "mobile" { " --config src-tauri\tauri.android.mobile.conf.json" }
        "tv" { " --config src-tauri\tauri.android.conf.json" }
        default { "" }
    }
    
    $cmdArgs = 'set "ANDROID_HOME=' + $androidHomeForCmd + '"&& ' +
               'set "ANDROID_SDK_ROOT=' + $androidSdkRootForCmd + '"&& ' +
               'set "ANDROID_NDK_HOME=' + $androidNdkHomeForCmd + '"&& ' +
               'set "NDK_HOME=' + $androidNdkHomeForCmd + '"&& ' +
               'set "JAVA_HOME=' + $javaHomeForCmd + '"&& ' +
               ('npx tauri android init --ci -v' + $initConfigArg)
    
    Push-Location $script:ProjectRoot
    & cmd /c $cmdArgs
    Pop-Location
    
    if ($LASTEXITCODE -ne 0) {
        Write-Err "Erreur lors de l'initialisation Android Tauri"
        exit 1
    }
    
    Write-Ok "Environnement Android Tauri initialisé"
    Write-Info "Note: tauri.build.gradle.kts sera généré automatiquement pendant le build Gradle"
    
    # S'assurer que la configuration Java 17 est appliquée après l'initialisation
    if (Test-Path $androidDirPath) {
        Ensure-Java17Config -AndroidDirPath $androidDirPath
    }
}

# Activer cleartext HTTP
$androidAppGradle = Join-Path $script:ProjectRoot "src-tauri\gen\android\app\build.gradle.kts"
Ensure-AndroidCleartextTrafficEnabled -AndroidAppGradlePath $androidAppGradle

# Bump version
Update-VersionForAndroidBuild -Variant $buildType | Out-Null

# Vérifier que tauri.android.conf.json est valide (le build Rust le lit toujours, même avec --config)
# Cette vérification DOIT être après Update-VersionForAndroidBuild car elle peut corrompre le fichier
$androidConfigPath = Join-Path $script:ProjectRoot "src-tauri\tauri.android.conf.json"
if (Test-Path $androidConfigPath) {
    try {
        $testJson = Get-Content $androidConfigPath -Raw | ConvertFrom-Json
        if ($null -eq $testJson -or [string]::IsNullOrWhiteSpace($testJson.productName)) {
            throw "JSON vide ou invalide"
        }
        Write-Info "Configuration Tauri Android (tv) valide"
    } catch {
        Write-Warn "Configuration Tauri Android (tv) invalide: $_"
        Write-Info "Restauration depuis git..."
        Push-Location $script:ProjectRoot
        git restore "src-tauri\tauri.android.conf.json" 2>&1 | Out-Null
        Pop-Location
        # Vérifier à nouveau après restauration
        Start-Sleep -Milliseconds 200
        try {
            $testJson2 = Get-Content $androidConfigPath -Raw | ConvertFrom-Json
            Write-Ok "Configuration restaurée et validée"
        } catch {
            Write-Err "Impossible de restaurer la configuration: $_"
            exit 1
        }
    }
} else {
    Write-Warn "Fichier tauri.android.conf.json manquant, restauration depuis git..."
    Push-Location $script:ProjectRoot
    git restore "src-tauri\tauri.android.conf.json" 2>&1 | Out-Null
    Pop-Location
}

# Générer tauri.build.gradle.kts et tauri.settings.gradle si nécessaires
# Note: Gradle évalue apply(from = ...) immédiatement, donc les fichiers doivent exister avant le build
$tauriBuildGradle = Join-Path $script:ProjectRoot "src-tauri\gen\android\app\tauri.build.gradle.kts"
$tauriSettingsGradle = Join-Path $script:ProjectRoot "src-tauri\gen\android\tauri.settings.gradle"

# Générer tauri.settings.gradle si manquant (requis par settings.gradle ligne 3)
if (-not (Test-Path $tauriSettingsGradle)) {
    Write-Info "Génération de tauri.settings.gradle avant le build..."
    # Créer un stub minimal (Tauri le régénère pendant le build) - ASCII uniquement
    $settingsStub = "// Auto-generated by Tauri`n// This file will be regenerated during the build`nrootProject.name = 'popcorn_client'`n"
    Set-Content -Path $tauriSettingsGradle -Value $settingsStub -Encoding UTF8 -ErrorAction SilentlyContinue
    Write-Ok "tauri.settings.gradle créé"
}

# Créer un stub minimal pour tauri.build.gradle.kts si manquant (requis par build.gradle.kts ligne 70)
# Note: Ce fichier est généré automatiquement par les tâches Rust (BuildTask) pendant le build Gradle
# Le stub sert uniquement à éviter l'erreur "file not found" pendant la phase de configuration Gradle
# Le vrai fichier sera généré pendant l'exécution des tâches rustBuild* via android-studio-script
if (-not (Test-Path $tauriBuildGradle) -or ((Get-Item $tauriBuildGradle).Length -lt 100)) {
    Write-Info "Création d'un stub minimal pour tauri.build.gradle.kts..."
    Write-Info "Note: Le fichier sera régénéré automatiquement par les tâches Rust pendant le build"
    # Stub minimal vide - Gradle l'accepte et les tâches Rust le remplaceront
    $stub = "// Auto-generated stub - will be replaced by Rust build tasks`n// This file is generated by tauri android android-studio-script during rustBuild* tasks`n`ndependencies {`n    // Dependencies will be added by tauri android-studio-script`n}`n"
    Set-Content -Path $tauriBuildGradle -Value $stub -Encoding UTF8 -ErrorAction SilentlyContinue
    Write-Ok "Stub minimal créé (sera remplacé par le contenu réel pendant le build)"
}

# Validation finale de tauri.android.conf.json juste avant le build Rust
# Le build Rust lit ce fichier même si --config spécifie un autre fichier
$finalCheckPath = Join-Path $script:ProjectRoot "src-tauri\tauri.android.conf.json"
if (Test-Path $finalCheckPath) {
    $finalCheckContent = Get-Content $finalCheckPath -Raw -ErrorAction SilentlyContinue
    if ([string]::IsNullOrWhiteSpace($finalCheckContent) -or ($finalCheckContent.Trim().Length -lt 10)) {
        Write-Warn "tauri.android.conf.json est vide avant le build, restauration d'urgence..."
        Push-Location $script:ProjectRoot
        git restore "src-tauri\tauri.android.conf.json" 2>&1 | Out-Null
        Pop-Location
        Start-Sleep -Milliseconds 200
    }
    try {
        $finalJson = Get-Content $finalCheckPath -Raw | ConvertFrom-Json
        if ($null -eq $finalJson.productName) {
            throw "productName manquant"
        }
    } catch {
        Write-Err "ERREUR CRITIQUE: tauri.android.conf.json invalide juste avant le build Rust: $_"
        Write-Info "Restauration depuis git..."
        Push-Location $script:ProjectRoot
        git restore "src-tauri\tauri.android.conf.json" 2>&1 | Out-Null
        Pop-Location
        exit 1
    }
}

# Préparer la commande de build
Push-Location (Join-Path $PSScriptRoot "..\..")

# S'assurer que la configuration Java 17 est appliquée avant le build
if (Test-Path $androidDirPath) {
    Ensure-Java17Config -AndroidDirPath $androidDirPath
}

$versionEnv = if ($env:PUBLIC_APP_VERSION) { "PUBLIC_APP_VERSION=$($env:PUBLIC_APP_VERSION) " } else { "" }
$codeEnv = if ($env:PUBLIC_APP_VERSION_CODE) { "PUBLIC_APP_VERSION_CODE=$($env:PUBLIC_APP_VERSION_CODE) " } else { "" }
$variantEnv = if ($env:PUBLIC_APP_VARIANT) { "PUBLIC_APP_VARIANT=$($env:PUBLIC_APP_VARIANT) " } else { "" }

$buildCommand = switch ($buildType) {
    "mobile" { "npx cross-env $versionEnv$codeEnv$variantEnv npm run tauri:build:android-mobile" }
    "tv" { "npx cross-env $versionEnv$codeEnv$variantEnv npm run tauri:build:android-tv" }
    default { "npx cross-env $versionEnv$codeEnv$variantEnv npm run tauri:build:android" }
}

Write-Section "Lancement du build Android"
Write-Info "Commande: $buildCommand"
Write-Info "Le build peut prendre plusieurs minutes..."
Write-Host ""

# Appliquer la configuration de signature avant le build (si les fichiers Android existent déjà)
# Note: Le fichier build.gradle.kts est généré par Tauri, donc on l'applique aussi dans le workaround
$androidProjectDir = Join-Path $script:ProjectRoot "src-tauri\gen\android"
$buildGradlePath = Join-Path $androidProjectDir "app\build.gradle.kts"
$applySigningScript = Join-Path $script:ProjectRoot "scripts\android\apply-signing-config.ps1"
if (Test-Path $applySigningScript) {
    # Attendre un peu que Tauri génère les fichiers (si nécessaire)
    $maxWait = 30
    $waited = 0
    while (-not (Test-Path $buildGradlePath) -and $waited -lt $maxWait) {
        Start-Sleep -Milliseconds 500
        $waited += 0.5
    }
    if (Test-Path $buildGradlePath) {
        Write-Info "Application de la configuration de signature..."
        & $applySigningScript -BuildGradlePath $buildGradlePath
    }
}

try {
    # Exécuter le build avec progression visible en temps réel
    # Utiliser & directement pour que la sortie passe en temps réel (comme stdio:inherit)
    $exitCode = 0
    try {
        # Exécuter directement pour voir la progression en temps réel
        Invoke-Expression $buildCommand
        $exitCode = $LASTEXITCODE
    } catch {
        Write-Err "Erreur lors de l'exécution du build: $_"
        $exitCode = 1
    }
    
    # Workaround si échec: copier .so et builder via Gradle
    if ($exitCode -ne 0) {
        Write-Warn "Build Tauri échoué, tentative de contournement (copie .so + Gradle)..."
        
        $soPath = Join-Path $script:ProjectRoot "src-tauri\target\aarch64-linux-android\release\libpopcorn_client.so"
        $jniDir = Join-Path $script:ProjectRoot "src-tauri\gen\android\app\src\main\jniLibs\arm64-v8a"
        $jniSoPath = Join-Path $jniDir "libpopcorn_client.so"
        
        if (-not (Test-Path $soPath)) {
            Write-Err "Bibliothèque Android non générée: $soPath"
            exit 1
        }
        
        New-Item -ItemType Directory -Force -Path $jniDir | Out-Null
        Copy-Item -Path $soPath -Destination $jniSoPath -Force
        Write-Ok "Copie lib -> jniLibs: $jniSoPath"
        
        $androidProjectDir = Join-Path $script:ProjectRoot "src-tauri\gen\android"
        
        # Appliquer la configuration de signature
        $applySigningScript = Join-Path $script:ProjectRoot "scripts\android\apply-signing-config.ps1"
        if (Test-Path $applySigningScript) {
            Write-Info "Application de la configuration de signature..."
            & $applySigningScript -BuildGradlePath (Join-Path $androidProjectDir "app\build.gradle.kts")
        }
        
        Push-Location $androidProjectDir
        try {
            # Arrêter le daemon Gradle/Kotlin pour éviter les erreurs de cache
            .\gradlew.bat --stop | Out-Null
            # Nettoyer les caches avant de relancer (évite les problèmes de chemins relatifs entre lecteurs)
            if (Test-Path ".gradle") {
                Remove-Item -Recurse -Force ".gradle" -ErrorAction SilentlyContinue
                Write-Info "Cache .gradle nettoyé"
            }
            if (Test-Path "build") {
                Remove-Item -Recurse -Force "build" -ErrorAction SilentlyContinue
                Write-Info "Cache build nettoyé"
            }
            # Nettoyer aussi les caches Kotlin
            $kotlinCache = Join-Path $env:USERPROFILE ".kotlin"
            if (Test-Path $kotlinCache) {
                Get-ChildItem $kotlinCache -Directory -Filter "daemon-*" -ErrorAction SilentlyContinue | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
                Write-Info "Caches Kotlin daemon nettoyés"
            }
            Write-Info "Relance du build Gradle sans daemon (--no-daemon forcé via gradle.properties)..."
            # --no-daemon est déjà forcé via gradle.properties, mais on l'ajoute explicitement pour être sûr
            .\gradlew.bat :app:assembleArm64Release -x :app:rustBuildArm64Release --no-daemon
            $exitCode = $LASTEXITCODE
        } finally {
            Pop-Location
        }
        
        if ($exitCode -ne 0) {
            Write-Err "Le workaround Gradle a échoué"
            exit 1
        }
    }
    
    if ($exitCode -eq 0) {
        Write-Section "Build Android terminé avec succès"
        
        # Trouver l'APK généré
        $searchDirs = @(
            (Join-Path $script:ProjectRoot "src-tauri\gen\android\app\build\outputs\apk"),
            (Join-Path $script:ProjectRoot "src-tauri\target\aarch64-linux-android\release")
        )
        
        $apk = $null
        foreach ($dir in $searchDirs) {
            if (Test-Path $dir) {
                $apk = Get-ChildItem $dir -Filter "*.apk" -Recurse -File -ErrorAction SilentlyContinue | 
                    Sort-Object LastWriteTime -Descending | Select-Object -First 1
                if ($apk) { break }
            }
        }
        
        if (-not $apk) {
            Write-Err "Aucun APK trouvé après le build"
            exit 1
        }
        
        Write-Info "APK trouvé: $($apk.FullName)"
        Write-Info "Taille: $([math]::Round($apk.Length / 1MB, 2)) MB"
        if ($apk.Name -like "*unsigned*") {
            Write-Warn "APK non signé détecté, signature en cours..."
        }
        
        # Fonctions de signature
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
                Write-Warn "build-tools introuvable, signature ignorée"
                return $ApkPath 
            }

            $apksigner = Join-Path $bt.FullName "apksigner.bat"
            $zipalign = Join-Path $bt.FullName "zipalign.exe"
            if (-not (Test-Path $apksigner) -or -not (Test-Path $zipalign)) { 
                Write-Warn "apksigner/zipalign introuvables, signature ignorée"
                return $ApkPath 
            }

            # Vérifier signature existante
            $verifyCmd = "`"$apksigner`" verify `"$ApkPath`" >nul 2>nul"
            & cmd /c $verifyCmd | Out-Null
            $isSigned = $LASTEXITCODE -eq 0

            # Vérifier aussi par le nom du fichier
            $isUnsignedByName = $ApkPath -like "*unsigned*"
            
            # Si l'APK est déjà signé et valide, ne pas le re-signer (préserver la signature native)
            if ($isSigned -and -not $isUnsignedByName) {
                Write-Ok "APK déjà signé avec signature native, préservation de la signature"
                return $ApkPath
            }

            # L'APK n'est pas signé ou invalide, on doit le signer
            if ($isUnsignedByName -or -not $isSigned) {
                Write-Info "APK non signé détecté, signature en cours..."
            }

            # Essayer d'utiliser le keystore de production en priorité
            $androidProjectDir = Join-Path $script:ProjectRoot "src-tauri\gen\android"
            $keystorePropertiesPath = Join-Path $androidProjectDir "keystore.properties"
            $keystorePath = Join-Path $androidProjectDir "keystore.jks"
            
            $useProductionKeystore = $false
            $ks = $null
            $ksAlias = $null
            $ksPass = $null
            $keyPass = $null

            # Vérifier si le keystore de production existe
            if ((Test-Path $keystorePropertiesPath) -and (Test-Path $keystorePath)) {
                try {
                    $props = @{}
                    Get-Content $keystorePropertiesPath | ForEach-Object {
                        if ($_ -match '^\s*([^#=]+)\s*=\s*(.+)$') {
                            $props[$matches[1].Trim()] = $matches[2].Trim()
                        }
                    }
                    
                    if ($props.ContainsKey("storeFile") -and $props.ContainsKey("storePassword") -and 
                        $props.ContainsKey("keyAlias") -and $props.ContainsKey("keyPassword")) {
                        $ksFile = $props["storeFile"]
                        if (-not [System.IO.Path]::IsPathRooted($ksFile)) {
                            $ksFile = Join-Path $androidProjectDir $ksFile
                        }
                        if (Test-Path $ksFile) {
                            $ks = $ksFile
                            $ksAlias = $props["keyAlias"]
                            $ksPass = $props["storePassword"]
                            $keyPass = $props["keyPassword"]
                            $useProductionKeystore = $true
                            Write-Info "Utilisation du keystore de production: $ks"
                        }
                    }
                } catch {
                    Write-Warn "Impossible de lire keystore.properties: $_"
                }
            }

            # Fallback vers le debug keystore si le keystore de production n'est pas disponible
            if (-not $useProductionKeystore) {
                $ks = Ensure-DebugKeystore -JavaHome $JavaHome
                $ksAlias = "androiddebugkey"
                $ksPass = "android"
                $keyPass = "android"
                Write-Info "Utilisation du debug keystore (fallback)"
            }

            $aligned = [System.IO.Path]::ChangeExtension($ApkPath, ".aligned.apk")
            $signed = [System.IO.Path]::ChangeExtension($ApkPath, ".signed.apk")

            # Aligner l'APK
            & $zipalign -f 4 $ApkPath $aligned 2>&1 | Out-Null
            if ($LASTEXITCODE -ne 0) { 
                Write-Err "Échec de l'alignement"
                return $ApkPath 
            }

            # Vérifier l'alignement
            $checkAlignedCmd = "`"$zipalign`" -c 4 `"$aligned`" >nul 2>nul"
            & cmd /c $checkAlignedCmd | Out-Null
            if ($LASTEXITCODE -ne 0) {
                Write-Err "L'APK aligné n'est pas correctement aligné"
                Remove-Item $aligned -Force -ErrorAction SilentlyContinue
                return $ApkPath
            }

            # Signer l'APK aligné
            & $apksigner sign `
                --ks $ks `
                --ks-key-alias $ksAlias `
                --ks-pass "pass:$ksPass" `
                --key-pass "pass:$keyPass" `
                --out $signed `
                $aligned 2>&1 | Out-Null
            if ($LASTEXITCODE -ne 0) { 
                Write-Err "Échec de la signature"
                Remove-Item $aligned -Force -ErrorAction SilentlyContinue
                return $ApkPath 
            }

            # Vérifier la signature finale
            $verifySignedCmd = "`"$apksigner`" verify `"$signed`" >nul 2>nul"
            & cmd /c $verifySignedCmd | Out-Null
            if ($LASTEXITCODE -eq 0) {
                # Nettoyer le fichier temporaire aligné
                Remove-Item $aligned -Force -ErrorAction SilentlyContinue
                Write-Ok "APK signé et aligné avec succès"
                return $signed
            } else {
                Write-Err "La signature n'a pas pu être vérifiée"
                Remove-Item $aligned -Force -ErrorAction SilentlyContinue
                Remove-Item $signed -Force -ErrorAction SilentlyContinue
                return $ApkPath
            }
        }
        
        # Vérifier et signer l'APK si nécessaire (préserve la signature native si déjà présente)
        Write-Section "Vérification de la signature de l'APK"
        $androidHome = if ($env:ANDROID_HOME) { $env:ANDROID_HOME } elseif ($script:AndroidHome) { $script:AndroidHome } else { $null }
        $javaHome = if ($env:JAVA_HOME) { $env:JAVA_HOME } elseif ($script:JavaHome) { $script:JavaHome } else { $null }
        $signedApkPath = Sign-ApkIfNeeded -ApkPath $apk.FullName -AndroidHome $androidHome -JavaHome $javaHome
        $apk = Get-Item $signedApkPath
        
        # Vérification finale obligatoire : l'APK DOIT être signé
        $bt = Get-LatestBuildToolsDir -AndroidHome $androidHome
        if ($bt) {
            $apksigner = Join-Path $bt.FullName "apksigner.bat"
            if (Test-Path $apksigner) {
                $finalVerifyCmd = "`"$apksigner`" verify `"$($apk.FullName)`" >nul 2>nul"
                & cmd /c $finalVerifyCmd | Out-Null
                if ($LASTEXITCODE -ne 0) {
                    Write-Err "L'APK final n'est pas signé!"
                    Write-Err "Le build ne peut pas continuer sans un APK signé."
                    exit 1
                }
                Write-Ok "APK final vérifié: signature valide"
            }
        }
        
        # Copier dans popcorn-web/app
        $info = Get-ProductInfoForVariant -Variant $buildType
        $safeName = Sanitize-FileName -Name $info.ProductName
        $safeVersion = Sanitize-FileName -Name $info.Version
        
        $destDir = Resolve-Path (Join-Path $script:ProjectRoot "..\popcorn-web") -ErrorAction SilentlyContinue
        if ($destDir) {
            $appDir = Join-Path $destDir "app"
            New-Item -ItemType Directory -Force -Path $appDir | Out-Null
            $destFile = Join-Path $appDir "$safeName-v$safeVersion.apk"
            Copy-Item -Path $apk.FullName -Destination $destFile -Force
            Write-Ok "APK copié dans: $destFile"
            Write-Info "Taille: $([math]::Round((Get-Item $destFile).Length / 1MB, 2)) MB"
        }
        
        Write-Ok "Build terminé avec succès"
    } else {
        Write-Err "Build échoué"
        exit 1
    }
} finally {
    Pop-Location
}