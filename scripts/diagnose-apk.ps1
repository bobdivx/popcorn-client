# Script de diagnostic pour un APK Android
# Usage: .\scripts\diagnose-apk.ps1 [path/to.apk]

param(
    [Parameter(Mandatory=$false)]
    [string]$ApkPath = ""
)

$ErrorActionPreference = "Continue"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Diagnostic APK Android" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Trouver l'APK si le chemin n'est pas fourni
if ([string]::IsNullOrWhiteSpace($ApkPath)) {
    $destDir = Resolve-Path (Join-Path $PSScriptRoot "..\..\popcorn-web\app") -ErrorAction SilentlyContinue
    if ($destDir) {
        $apks = Get-ChildItem -Path $destDir -Filter "*.apk" -File | Sort-Object LastWriteTime -Descending
        if ($apks -and $apks.Count -gt 0) {
            $ApkPath = $apks[0].FullName
            Write-Host "[INFO] APK trouvé automatiquement: $ApkPath" -ForegroundColor Cyan
        } else {
            Write-Host "[ERREUR] Aucun APK trouvé dans $destDir" -ForegroundColor Red
            exit 1
        }
    } else {
        Write-Host "[ERREUR] Chemin de l'APK non fourni" -ForegroundColor Red
        exit 1
    }
}

if (-not (Test-Path $ApkPath)) {
    Write-Host "[ERREUR] APK introuvable: $ApkPath" -ForegroundColor Red
    exit 1
}

$apkInfo = Get-Item $ApkPath
Write-Host "[INFO] APK: $($apkInfo.FullName)" -ForegroundColor Cyan
Write-Host "[INFO] Taille: $([math]::Round($apkInfo.Length / 1MB, 2)) MB" -ForegroundColor Cyan
Write-Host ""

# Détecter Android SDK
$androidHome = $env:ANDROID_HOME
if (-not $androidHome) {
    $androidHome = $env:ANDROID_SDK_ROOT
}
if (-not $androidHome -or -not (Test-Path $androidHome)) {
    $dSdk = "D:\SDK"
    if (Test-Path $dSdk) {
        $androidHome = $dSdk
    } else {
        Write-Host "[ERREUR] ANDROID_HOME non défini" -ForegroundColor Red
        exit 1
    }
}

# Trouver build-tools et aapt2
$buildToolsDir = Get-ChildItem (Join-Path $androidHome "build-tools") -Directory -ErrorAction SilentlyContinue | Sort-Object Name -Descending | Select-Object -First 1
if (-not $buildToolsDir) {
    Write-Host "[ERREUR] build-tools introuvable" -ForegroundColor Red
    exit 1
}

$apksigner = Join-Path $buildToolsDir.FullName "apksigner.bat"
$zipalign = Join-Path $buildToolsDir.FullName "zipalign.exe"
$aapt2 = Join-Path $buildToolsDir.FullName "aapt2.exe"

# 1. Vérifier la signature
Write-Host "1. Vérification de la signature..." -ForegroundColor Yellow
if (Test-Path $apksigner) {
    $verifyCmd = "`"$apksigner`" verify `"$ApkPath`" 2>&1"
    $verifyOutput = & cmd /c $verifyCmd
    if ($LASTEXITCODE -eq 0) {
        Write-Host "   [OK] APK signé correctement" -ForegroundColor Green
        
        # Afficher les détails du certificat
        Write-Host "   Détails du certificat:" -ForegroundColor Cyan
        $certCmd = "`"$apksigner`" verify --print-certs `"$ApkPath`" 2>&1"
        $certOutput = & cmd /c $certCmd
        if ($LASTEXITCODE -eq 0) {
            $certOutput | ForEach-Object { Write-Host "      $_" -ForegroundColor Gray }
            
            # Vérifier si c'est un certificat debug
            $isDebug = $certOutput | Select-String -Pattern "CN=Android Debug|androiddebugkey" -Quiet
            if ($isDebug) {
                Write-Host "      [INFO] Certificat DEBUG détecté (normal pour les builds locaux)" -ForegroundColor Cyan
                Write-Host "      [WARN] Les certificats DEBUG peuvent être rejetés par certains appareils" -ForegroundColor Yellow
                Write-Host "      [INFO] Pour la production, utilisez un certificat de release" -ForegroundColor Gray
            } else {
                Write-Host "      [INFO] Certificat RELEASE détecté" -ForegroundColor Green
            }
        }
    } else {
        Write-Host "   [ERREUR] APK non signé ou signature invalide" -ForegroundColor Red
        $verifyOutput | ForEach-Object { Write-Host "   $_" -ForegroundColor Red }
    }
} else {
    Write-Host "   [!] apksigner introuvable, vérification ignorée" -ForegroundColor Yellow
}
Write-Host ""

# 2. Vérifier l'alignement
Write-Host "2. Vérification de l'alignement..." -ForegroundColor Yellow
if (Test-Path $zipalign) {
    $checkAlignCmd = "`"$zipalign`" -c 4 `"$ApkPath`" 2>&1"
    $alignOutput = & cmd /c $checkAlignCmd
    if ($LASTEXITCODE -eq 0) {
        Write-Host "   [OK] APK correctement aligné" -ForegroundColor Green
    } else {
        Write-Host "   [ERREUR] APK non aligné correctement" -ForegroundColor Red
        $alignOutput | ForEach-Object { Write-Host "   $_" -ForegroundColor Red }
    }
} else {
    Write-Host "   [!] zipalign introuvable, vérification ignorée" -ForegroundColor Yellow
}
Write-Host ""

# 3. Extraire les informations du manifest
Write-Host "3. Informations du manifest Android..." -ForegroundColor Yellow
if (Test-Path $aapt2) {
    # Utiliser aapt2 pour extraire les infos du manifest
    $dumpCmd = "`"$aapt2`" dump badging `"$ApkPath`" 2>&1"
    $dumpOutput = & cmd /c $dumpCmd
    
    if ($LASTEXITCODE -eq 0) {
        # Extraire les informations importantes
        $packageName = $dumpOutput | Select-String -Pattern "package: name='([^']+)'" | ForEach-Object { $_.Matches[0].Groups[1].Value }
        $versionCode = $dumpOutput | Select-String -Pattern "versionCode='([^']+)'" | ForEach-Object { $_.Matches[0].Groups[1].Value }
        $versionName = $dumpOutput | Select-String -Pattern "versionName='([^']+)'" | ForEach-Object { $_.Matches[0].Groups[1].Value }
        $sdkVersion = $dumpOutput | Select-String -Pattern "sdkVersion:'([^']+)'" | ForEach-Object { $_.Matches[0].Groups[1].Value }
        $targetSdk = $dumpOutput | Select-String -Pattern "targetSdkVersion:'([^']+)'" | ForEach-Object { $_.Matches[0].Groups[1].Value }
        $nativeCode = $dumpOutput | Select-String -Pattern "native-code: '([^']+)'" | ForEach-Object { $_.Matches[0].Groups[1].Value }
        
        Write-Host "   Package name: $packageName" -ForegroundColor Cyan
        Write-Host "   Version name: $versionName" -ForegroundColor Cyan
        Write-Host "   Version code: $versionCode" -ForegroundColor Cyan
        Write-Host "   SDK version: $sdkVersion" -ForegroundColor Cyan
        Write-Host "   Target SDK: $targetSdk" -ForegroundColor Cyan
        if ($nativeCode) {
            Write-Host "   Native code: $nativeCode" -ForegroundColor Cyan
        }
        
        # Vérifier les problèmes potentiels
        $issues = @()
        if ([string]::IsNullOrWhiteSpace($packageName)) {
            $issues += "Package name manquant"
        }
        if ([string]::IsNullOrWhiteSpace($versionCode)) {
            $issues += "Version code manquant"
        }
        if ([string]::IsNullOrWhiteSpace($versionName)) {
            $issues += "Version name manquant"
        }
        if ($nativeCode -and $nativeCode -notlike "*arm64*") {
            $issues += "Architecture native non arm64 (trouvé: $nativeCode)"
        }
        
        if ($issues.Count -gt 0) {
            Write-Host ""
            Write-Host "   [!] Problèmes détectés:" -ForegroundColor Yellow
            foreach ($issue in $issues) {
                Write-Host "      - $issue" -ForegroundColor Yellow
            }
        } else {
            Write-Host "   [OK] Informations du manifest valides" -ForegroundColor Green
        }
    } else {
        Write-Host "   [ERREUR] Impossible d'extraire les informations du manifest" -ForegroundColor Red
        $dumpOutput | ForEach-Object { Write-Host "   $_" -ForegroundColor Red }
    }
} else {
    Write-Host "   [!] aapt2 introuvable, extraction du manifest ignorée" -ForegroundColor Yellow
}
Write-Host ""

# 4. Vérifier la structure de l'APK (c'est un fichier ZIP)
Write-Host "4. Vérification de la structure de l'APK..." -ForegroundColor Yellow
try {
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $zip = [System.IO.Compression.ZipFile]::OpenRead($ApkPath)
    
    $requiredFiles = @("AndroidManifest.xml", "classes.dex", "resources.arsc")
    $missingFiles = @()
    
    foreach ($file in $requiredFiles) {
        $found = $zip.Entries | Where-Object { $_.Name -eq $file -or $_.FullName -like "*$file" }
        if (-not $found) {
            $missingFiles += $file
        }
    }
    
    if ($missingFiles.Count -eq 0) {
        Write-Host "   [OK] Structure de l'APK valide" -ForegroundColor Green
    } else {
        Write-Host "   [ERREUR] Fichiers manquants dans l'APK:" -ForegroundColor Red
        foreach ($file in $missingFiles) {
            Write-Host "      - $file" -ForegroundColor Red
        }
    }
    
    # Vérifier la présence de libs natives
    $nativeLibs = $zip.Entries | Where-Object { $_.FullName -like "lib/*/lib*.so" }
    if ($nativeLibs) {
        Write-Host "   [INFO] Bibliothèques natives trouvées:" -ForegroundColor Cyan
        $nativeLibs | ForEach-Object { Write-Host "      $($_.FullName)" -ForegroundColor Gray }
    } else {
        Write-Host "   [!] Aucune bibliothèque native trouvée" -ForegroundColor Yellow
    }
    
    $zip.Dispose()
} catch {
    Write-Host "   [ERREUR] Impossible de lire l'APK comme archive ZIP: $_" -ForegroundColor Red
}
Write-Host ""

# 5. Utiliser apkanalyzer si disponible (outil recommandé par Android)
Write-Host "5. Analyse avec apkanalyzer..." -ForegroundColor Yellow
# Chercher apkanalyzer dans toutes les versions de build-tools
$apkanalyzer = $null
$allBuildTools = Get-ChildItem (Join-Path $androidHome "build-tools") -Directory -ErrorAction SilentlyContinue | Sort-Object Name -Descending
foreach ($bt in $allBuildTools) {
    $candidate = Join-Path $bt.FullName "apkanalyzer.bat"
    if (Test-Path $candidate) {
        $apkanalyzer = $candidate
        break
    }
}
if ($apkanalyzer -and (Test-Path $apkanalyzer)) {
    Write-Host "   [INFO] Utilisation de apkanalyzer (recommandé par Android)" -ForegroundColor Cyan
    Write-Host ""
    
    # Afficher la taille de l'APK
    Write-Host "   Taille de l'APK:" -ForegroundColor Cyan
    $sizeCmd = "`"$apkanalyzer`" apk file-size `"$ApkPath`" 2>&1"
    $sizeOutput = & cmd /c $sizeCmd
    if ($LASTEXITCODE -eq 0) {
        $sizeBytes = [int64]$sizeOutput
        $sizeMB = [math]::Round($sizeBytes / 1MB, 2)
        Write-Host "      $sizeMB MB ($sizeBytes bytes)" -ForegroundColor Gray
    }
    
    # Afficher les fichiers DEX
    Write-Host ""
    Write-Host "   Fichiers DEX:" -ForegroundColor Cyan
    $dexCmd = "`"$apkanalyzer`" dex list `"$ApkPath`" 2>&1"
    $dexOutput = & cmd /c $dexCmd
    if ($LASTEXITCODE -eq 0 -and $dexOutput) {
        $dexOutput | ForEach-Object { Write-Host "      $_" -ForegroundColor Gray }
    } else {
        Write-Host "      [ERREUR] Impossible de lister les fichiers DEX" -ForegroundColor Red
    }
    
    # Afficher les fichiers natifs
    Write-Host ""
    Write-Host "   Bibliothèques natives:" -ForegroundColor Cyan
    $nativeCmd = "`"$apkanalyzer`" files list `"$ApkPath`" 2>&1 | findstr /i `"lib.*\.so`""
    $nativeOutput = & cmd /c $nativeCmd
    if ($nativeOutput) {
        $nativeOutput | ForEach-Object { Write-Host "      $_" -ForegroundColor Gray }
    } else {
        Write-Host "      [WARN] Aucune bibliothèque native trouvée" -ForegroundColor Yellow
    }
    
    # Vérifier les certificats
    Write-Host ""
    Write-Host "   Certificats de signature:" -ForegroundColor Cyan
    $certCmd = "`"$apkanalyzer`" apk summary `"$ApkPath`" 2>&1"
    $certOutput = & cmd /c $certCmd
    if ($LASTEXITCODE -eq 0) {
        $certOutput | Select-String -Pattern "signer|certificate|signature" | ForEach-Object { Write-Host "      $_" -ForegroundColor Gray }
    }
    
    # Vérifier les certificats avec apksigner (plus détaillé)
    Write-Host ""
    Write-Host "   Détails du certificat (apksigner):" -ForegroundColor Cyan
    $certDetailCmd = "`"$apksigner`" verify --print-certs `"$ApkPath`" 2>&1"
    $certDetailOutput = & cmd /c $certDetailCmd
    if ($LASTEXITCODE -eq 0) {
        $certDetailOutput | ForEach-Object { Write-Host "      $_" -ForegroundColor Gray }
        
        # Vérifier si c'est un certificat debug
        $isDebug = $certDetailOutput | Select-String -Pattern "CN=Android Debug|androiddebugkey" -Quiet
        if ($isDebug) {
            Write-Host "      [INFO] Certificat DEBUG détecté (normal pour les builds locaux)" -ForegroundColor Cyan
        } else {
            Write-Host "      [INFO] Certificat RELEASE détecté" -ForegroundColor Green
        }
    }
} else {
    Write-Host "   [!] apkanalyzer introuvable (disponible dans build-tools 26.0.0+)" -ForegroundColor Yellow
    Write-Host "      Vous pouvez utiliser Android Studio > Build > Analyze APK pour une analyse complète" -ForegroundColor Gray
}
Write-Host ""

# Résumé
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Résumé du diagnostic" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Si l'APK ne peut pas être installé, vérifiez:" -ForegroundColor Yellow
Write-Host "  1. Que l'APK est signé (voir section 1)" -ForegroundColor Gray
Write-Host "  2. Que l'APK est aligné (voir section 2)" -ForegroundColor Gray
Write-Host "  3. Que le package name est valide (voir section 3)" -ForegroundColor Gray
Write-Host "  4. Que l'architecture correspond à votre appareil (arm64)" -ForegroundColor Gray
Write-Host "  5. Que les 'Sources inconnues' sont activées sur votre mobile" -ForegroundColor Gray
Write-Host "  6. Que vous n'essayez pas d'installer un APK 32-bit sur un appareil 64-bit" -ForegroundColor Gray
Write-Host "  7. Que le certificat de signature est valide (voir section 5)" -ForegroundColor Gray
Write-Host ""
Write-Host "Pour une analyse complète avec Android Studio:" -ForegroundColor Cyan
Write-Host "  1. Ouvrez Android Studio" -ForegroundColor White
Write-Host "  2. Build > Analyze APK" -ForegroundColor White
Write-Host "  3. Sélectionnez: $ApkPath" -ForegroundColor White
Write-Host ""
Write-Host "Pour corriger la signature:" -ForegroundColor Cyan
Write-Host "  .\scripts\fix-apk-signature.ps1 -ApkPath `"$ApkPath`"" -ForegroundColor White
Write-Host ""
