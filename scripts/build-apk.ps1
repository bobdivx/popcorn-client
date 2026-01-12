# Script pour builder l'APK Android avec Gradle
$env:JAVA_HOME = "D:\Android Studio\jbr"
$env:ANDROID_HOME = "D:\SDK"
$env:ANDROID_SDK_ROOT = "D:\SDK"

$projectRoot = Split-Path $PSScriptRoot -Parent
$androidDir = Join-Path $projectRoot "src-tauri\gen\android"

if (-not (Test-Path $androidDir)) {
    Write-Host "[ERREUR] Projet Android non trouve: $androidDir" -ForegroundColor Red
    exit 1
}

Set-Location $androidDir

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Construction de l'APK Android" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Projet: $androidDir" -ForegroundColor Gray
Write-Host ""

# Construire l'APK
Write-Host "Lancement de Gradle..." -ForegroundColor Yellow
Write-Host "(Cela peut prendre plusieurs minutes)" -ForegroundColor Gray
Write-Host ""

.\gradlew.bat assembleRelease

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host "[OK] Build reussi !" -ForegroundColor Green
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host ""
    
    # Chercher l'APK
    $apkPath = Join-Path $androidDir "app\build\outputs\apk\release\app-release.apk"
    if (Test-Path $apkPath) {
        $apk = Get-Item $apkPath
        Write-Host "[APK] APK genere avec succes !" -ForegroundColor Green
        Write-Host "  Chemin: $($apk.FullName)" -ForegroundColor White
        Write-Host "  Taille: $([math]::Round($apk.Length / 1MB, 2)) MB" -ForegroundColor Gray
        Write-Host ""
        Write-Host "Vous pouvez maintenant installer l'APK sur votre appareil Android." -ForegroundColor Green
    } else {
        Write-Host "[!] APK non trouve dans l'emplacement attendu" -ForegroundColor Yellow
        Write-Host "Recherche dans d'autres emplacements..." -ForegroundColor Cyan
        Get-ChildItem $androidDir -Filter "*.apk" -Recurse -ErrorAction SilentlyContinue | ForEach-Object {
            Write-Host "  APK trouve: $($_.FullName)" -ForegroundColor Green
        }
    }
} else {
    Write-Host ""
    Write-Host "[ERREUR] Build echoue" -ForegroundColor Red
    exit 1
}
