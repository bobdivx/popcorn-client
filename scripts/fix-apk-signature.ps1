# Script pour corriger la signature d'un APK Android
# Usage: .\scripts\fix-apk-signature.ps1 [path/to.apk]

param(
    [Parameter(Mandatory=$false)]
    [string]$ApkPath = ""
)

$ErrorActionPreference = "Stop"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Correction de la signature APK Android" -ForegroundColor Cyan
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
            Write-Host "Spécifiez le chemin de l'APK: .\scripts\fix-apk-signature.ps1 -ApkPath path/to.apk" -ForegroundColor Yellow
            exit 1
        }
    } else {
        Write-Host "[ERREUR] Chemin de l'APK non fourni et popcorn-web/app introuvable" -ForegroundColor Red
        exit 1
    }
}

if (-not (Test-Path $ApkPath)) {
    Write-Host "[ERREUR] APK introuvable: $ApkPath" -ForegroundColor Red
    exit 1
}

Write-Host "[INFO] APK: $ApkPath" -ForegroundColor Cyan
Write-Host ""

# Détecter Android SDK et Java
$androidHome = $env:ANDROID_HOME
if (-not $androidHome) {
    $androidHome = $env:ANDROID_SDK_ROOT
}
if (-not $androidHome -or -not (Test-Path $androidHome)) {
    $dSdk = "D:\SDK"
    if (Test-Path $dSdk) {
        $androidHome = $dSdk
        Write-Host "[INFO] Android SDK détecté: $androidHome" -ForegroundColor Cyan
    } else {
        Write-Host "[ERREUR] ANDROID_HOME non défini et SDK introuvable" -ForegroundColor Red
        exit 1
    }
}

$javaHome = $env:JAVA_HOME
if (-not $javaHome -or -not (Test-Path $javaHome)) {
    $dJava = "D:\Android Studio\jbr"
    if (Test-Path $dJava) {
        $javaHome = $dJava
        Write-Host "[INFO] Java détecté: $javaHome" -ForegroundColor Cyan
    } else {
        Write-Host "[ERREUR] JAVA_HOME non défini et Java introuvable" -ForegroundColor Red
        exit 1
    }
}

# Trouver build-tools
$buildToolsDir = Get-ChildItem (Join-Path $androidHome "build-tools") -Directory -ErrorAction SilentlyContinue | Sort-Object Name -Descending | Select-Object -First 1
if (-not $buildToolsDir) {
    Write-Host "[ERREUR] build-tools introuvable dans $androidHome" -ForegroundColor Red
    exit 1
}

$apksigner = Join-Path $buildToolsDir.FullName "apksigner.bat"
$zipalign = Join-Path $buildToolsDir.FullName "zipalign.exe"

if (-not (Test-Path $apksigner) -or -not (Test-Path $zipalign)) {
    Write-Host "[ERREUR] apksigner ou zipalign introuvable dans $($buildToolsDir.FullName)" -ForegroundColor Red
    exit 1
}

Write-Host "[OK] Outils trouvés:" -ForegroundColor Green
Write-Host "   apksigner: $apksigner" -ForegroundColor Gray
Write-Host "   zipalign: $zipalign" -ForegroundColor Gray
Write-Host ""

# Vérifier si l'APK est déjà signé
Write-Host "Vérification de la signature..." -ForegroundColor Yellow
$verifyCmd = "`"$apksigner`" verify `"$ApkPath`" 2>&1"
$verifyOutput = & cmd /c $verifyCmd
$isSigned = $LASTEXITCODE -eq 0

if ($isSigned) {
    Write-Host "[OK] APK déjà signé correctement" -ForegroundColor Green
    Write-Host $verifyOutput -ForegroundColor Gray
    exit 0
} else {
    Write-Host "[!] APK non signé ou signature invalide" -ForegroundColor Yellow
    Write-Host $verifyOutput -ForegroundColor Gray
    Write-Host ""
}

# Créer/obtenir le keystore debug
$androidUserDir = Join-Path $env:USERPROFILE ".android"
$keystorePath = Join-Path $androidUserDir "debug.keystore"

if (-not (Test-Path $keystorePath)) {
    Write-Host "Création du keystore debug..." -ForegroundColor Yellow
    New-Item -ItemType Directory -Force -Path $androidUserDir | Out-Null
    
    $keytool = Join-Path $javaHome "bin\keytool.exe"
    if (-not (Test-Path $keytool)) {
        Write-Host "[ERREUR] keytool introuvable dans $javaHome" -ForegroundColor Red
        exit 1
    }
    
    & $keytool -genkeypair -noprompt `
        -keystore $keystorePath `
        -storepass "android" `
        -keypass "android" `
        -alias "androiddebugkey" `
        -dname "CN=Android Debug,O=Android,C=US" `
        -keyalg RSA -keysize 2048 -validity 10000 2>&1 | Out-Null
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "[OK] Keystore debug créé" -ForegroundColor Green
    } else {
        Write-Host "[ERREUR] Échec de la création du keystore" -ForegroundColor Red
        exit 1
    }
} else {
    Write-Host "[OK] Keystore debug trouvé" -ForegroundColor Green
}

Write-Host ""

# Aligner l'APK
Write-Host "Alignement de l'APK..." -ForegroundColor Yellow
$alignedApk = [System.IO.Path]::ChangeExtension($ApkPath, ".aligned.apk")
& $zipalign -f 4 $ApkPath $alignedApk 2>&1 | Out-Null

if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERREUR] Échec de l'alignement" -ForegroundColor Red
    exit 1
}

Write-Host "[OK] APK aligné: $alignedApk" -ForegroundColor Green
Write-Host ""

# Signer l'APK
Write-Host "Signature de l'APK..." -ForegroundColor Yellow
$signedApk = [System.IO.Path]::ChangeExtension($ApkPath, ".signed.apk")

& $apksigner sign `
    --ks $keystorePath `
    --ks-key-alias "androiddebugkey" `
    --ks-pass "pass:android" `
    --key-pass "pass:android" `
    --out $signedApk `
    $alignedApk 2>&1 | Out-Null

if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERREUR] Échec de la signature" -ForegroundColor Red
    Remove-Item $alignedApk -Force -ErrorAction SilentlyContinue
    exit 1
}

Write-Host "[OK] APK signé: $signedApk" -ForegroundColor Green
Write-Host ""

# Vérifier la signature
Write-Host "Vérification de la signature..." -ForegroundColor Yellow
$verifySignedCmd = "`"$apksigner`" verify `"$signedApk`" 2>&1"
$verifySignedOutput = & cmd /c $verifySignedCmd

if ($LASTEXITCODE -eq 0) {
    Write-Host "[OK] Signature vérifiée avec succès!" -ForegroundColor Green
    Write-Host $verifySignedOutput -ForegroundColor Gray
    Write-Host ""
    
    # Remplacer l'APK original par l'APK signé
    Write-Host "Remplacement de l'APK original..." -ForegroundColor Yellow
    $backupApk = "$ApkPath.backup"
    Copy-Item -Path $ApkPath -Destination $backupApk -Force
    Copy-Item -Path $signedApk -Destination $ApkPath -Force
    
    Write-Host "[OK] APK original remplacé (backup: $backupApk)" -ForegroundColor Green
    
    # Nettoyer les fichiers temporaires
    Remove-Item $alignedApk -Force -ErrorAction SilentlyContinue
    Remove-Item $signedApk -Force -ErrorAction SilentlyContinue
    
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host "[OK] APK corrigé avec succès!" -ForegroundColor Green
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "APK final: $ApkPath" -ForegroundColor White
    Write-Host "Taille: $([math]::Round((Get-Item $ApkPath).Length / 1MB, 2)) MB" -ForegroundColor Gray
    Write-Host ""
    Write-Host "Vous pouvez maintenant installer l'APK sur votre mobile." -ForegroundColor Cyan
} else {
    Write-Host "[ERREUR] La signature n'a pas pu être vérifiée" -ForegroundColor Red
    Write-Host $verifySignedOutput -ForegroundColor Red
    exit 1
}
