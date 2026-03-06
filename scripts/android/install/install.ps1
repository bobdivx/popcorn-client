# Script d'installation de l'APK Android
# Usage: .\scripts\android\install\install.ps1 [mobile|tv] [--apk-path path/to.apk]

param(
    [Parameter(Position=0)]
    [ValidateSet("mobile", "tv", "")]
    [string]$Variant = "mobile",
    [Parameter()]
    [string]$ApkPath = ""
)

$ErrorActionPreference = "Continue"

# Importer les fonctions et variables communes
. "$PSScriptRoot\..\..\_common\variables.ps1"
. "$PSScriptRoot\..\..\_common\functions.ps1"

$packageId = Get-PackageId -Variant $Variant

Write-Section "Installation Application Android ($Variant)"

# Vérifier qu'un appareil est connecté
if (-not (Test-AndroidDevice)) {
    exit 1
}

# Trouver l'APK
if ([string]::IsNullOrWhiteSpace($ApkPath)) {
    $apk = Get-LatestApk -Variant $Variant
    if (-not $apk) {
        Write-Err "Aucun APK trouvé pour $Variant"
        Write-Info "APK attendu dans: $script:ApkDestPath"
        Write-Info "Exécutez d'abord: npm run android:build:$Variant"
        exit 1
    }
    $ApkPath = $apk.FullName
} else {
    if (-not (Test-Path $ApkPath)) {
        Write-Err "APK introuvable: $ApkPath"
        exit 1
    }
}

Write-Info "APK: $ApkPath"

# Vérifier si l'APK est signé (utiliser apksigner pour vérification moderne)
$isUnsigned = $false

# D'abord vérifier le nom du fichier (rapide)
if ($ApkPath -like "*unsigned*" -or $ApkPath -like "*-unsigned.apk") {
    $isUnsigned = $true
    Write-Info "APK non signé détecté (par nom de fichier)"
} else {
    # Vérifier avec apksigner (plus fiable pour APK modernes)
    $buildTools = Get-ChildItem (Join-Path $script:AndroidHome "build-tools") -Directory -ErrorAction SilentlyContinue | Sort-Object Name -Descending | Select-Object -First 1
    if ($buildTools) {
        $apksignerPath = Join-Path $buildTools.FullName "apksigner.bat"
        if (Test-Path $apksignerPath) {
            $verifyCmd = "`"$apksignerPath`" verify `"$ApkPath`" >nul 2>nul"
            & cmd /c $verifyCmd | Out-Null
            if ($LASTEXITCODE -ne 0) {
                $isUnsigned = $true
                Write-Info "APK non signé détecté (vérification apksigner)"
            }
        }
    }
    
    # Fallback: vérifier avec jarsigner si apksigner n'est pas disponible
    if (-not $isUnsigned) {
        $jarsignerPath = if ($script:JavaHome) { Join-Path $script:JavaHome "bin\jarsigner.exe" } else { "jarsigner.exe" }
        if (Test-Path $jarsignerPath) {
            $verifyResult = & $jarsignerPath -verify -verbose $ApkPath 2>&1 | Out-String
            if ($LASTEXITCODE -ne 0 -or ($verifyResult -like "*jar is unsigned*") -or ($verifyResult -like "*no certificate*")) {
                $isUnsigned = $true
                Write-Info "APK non signé détecté (vérification jarsigner)"
            }
        }
    }
}

# Désinstaller l'ancienne version d'abord
Write-Info "Désinstallation de l'ancienne version..."
$uninstallOutput = & $script:AdbPath uninstall $packageId 2>&1 | Out-Null

# Installer
Write-Info "Installation de $packageId..."

# Si l'APK est unsigned, le signer avec un keystore debug
if ($isUnsigned) {
    Write-Info "APK non signé détecté, signature avec keystore debug..."
    
    # Chemin du keystore debug (standard Android)
    $debugKeystore = Join-Path $env:USERPROFILE ".android\debug.keystore"
    $debugKeyPass = "android"
    $debugKeyAlias = "androiddebugkey"
    
    # Créer le keystore debug s'il n'existe pas
    if (-not (Test-Path $debugKeystore)) {
        $androidDir = Split-Path $debugKeystore -Parent
        if (-not (Test-Path $androidDir)) {
            New-Item -ItemType Directory -Path $androidDir -Force | Out-Null
        }
        Write-Info "Création du keystore debug..."
        $keytoolPath = Join-Path $script:JavaHome "bin\keytool.exe"
        & $keytoolPath -genkey -v -keystore $debugKeystore -storepass $debugKeyPass -alias $debugKeyAlias -keypass $debugKeyPass -keyalg RSA -keysize 2048 -validity 10000 -dname "CN=Android Debug,O=Android,C=US" 2>&1 | Out-Null
    }
    
    # Signer l'APK avec apksigner (plus moderne que jarsigner)
    $signedApk = $ApkPath -replace "-unsigned\.apk$", "-signed.apk" -replace "\.apk$", "-signed.apk"
    
    # Trouver apksigner et zipalign dans build-tools
    $buildTools = Get-ChildItem (Join-Path $script:AndroidHome "build-tools") -Directory -ErrorAction SilentlyContinue | Sort-Object Name -Descending | Select-Object -First 1
    if ($buildTools) {
        $apksignerPath = Join-Path $buildTools.FullName "apksigner.bat"
        $zipalignPath = Join-Path $buildTools.FullName "zipalign.exe"
        
        if ((Test-Path $apksignerPath) -and (Test-Path $zipalignPath)) {
            Write-Info "Signature avec apksigner (modern)..."
            
            # Aligner l'APK d'abord
            $alignedApk = $ApkPath -replace "\.apk$", "-aligned.apk"
            & $zipalignPath -f 4 $ApkPath $alignedApk 2>&1 | Out-Null
            
            # Signer avec apksigner
            & $apksignerPath sign --ks $debugKeystore --ks-pass "pass:$debugKeyPass" --key-pass "pass:$debugKeyPass" --ks-key-alias $debugKeyAlias --out $signedApk $alignedApk 2>&1 | Out-Null
            
            if ($LASTEXITCODE -eq 0 -and (Test-Path $signedApk)) {
                Remove-Item $alignedApk -Force -ErrorAction SilentlyContinue
                $ApkPath = $signedApk
                Write-Ok "APK signé avec apksigner: $signedApk"
            } else {
                Write-Warn "Échec de la signature avec apksigner, tentative avec jarsigner..."
                # Fallback sur jarsigner
                $jarsignerPath = Join-Path $script:JavaHome "bin\jarsigner.exe"
                $signResult = & $jarsignerPath -verbose -sigalg SHA256withRSA -digestalg SHA-256 -keystore $debugKeystore -storepass $debugKeyPass -keypass $debugKeyPass $ApkPath $debugKeyAlias 2>&1
                if ($LASTEXITCODE -eq 0) {
                    Copy-Item -Path $ApkPath -Destination $signedApk -Force
                    $ApkPath = $signedApk
                    Write-Ok "APK signé avec jarsigner (fallback): $signedApk"
                } else {
                    Write-Warn "Échec de la signature, tentative d'installation directe..."
                }
            }
        } else {
            Write-Warn "apksigner/zipalign non trouvés, tentative avec jarsigner..."
            $jarsignerPath = Join-Path $script:JavaHome "bin\jarsigner.exe"
            $signResult = & $jarsignerPath -verbose -sigalg SHA256withRSA -digestalg SHA-256 -keystore $debugKeystore -storepass $debugKeyPass -keypass $debugKeyPass $ApkPath $debugKeyAlias 2>&1
            if ($LASTEXITCODE -eq 0) {
                Copy-Item -Path $ApkPath -Destination $signedApk -Force
                $ApkPath = $signedApk
                Write-Ok "APK signé avec jarsigner: $signedApk"
            }
        }
    }
}

# Installer (avec -t pour permettre l'installation sur émulateur même si problèmes de signature)
$installResult = & $script:AdbPath install -t -r $ApkPath 2>&1

if ($LASTEXITCODE -eq 0) {
    Write-Ok "Application installée avec succès"
    exit 0
} else {
    Write-Err "Échec de l'installation"
    $installResult | ForEach-Object { Write-Host "  $_" -ForegroundColor Red }
    
    # Suggestion: essayer avec l'APK original si on a créé une copie signée
    if ($isUnsigned -and $ApkPath -like "*-signed.apk") {
        Write-Info "Tentative avec l'APK original..."
        $originalApk = $ApkPath -replace "-signed\.apk$", "-unsigned.apk" -replace "-signed\.apk$", ".apk"
        if (Test-Path $originalApk) {
            $installResult2 = & $script:AdbPath install -t -r $originalApk 2>&1
            if ($LASTEXITCODE -eq 0) {
                Write-Ok "Installation réussie avec l'APK original"
                exit 0
            }
        }
    }
    
    exit 1
}