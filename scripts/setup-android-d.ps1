# Script pour configurer Android avec les chemins sur D:\
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Configuration Android (D:\)" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Configuration des chemins
$env:JAVA_HOME = "D:\Android Studio\jbr"
$env:ANDROID_HOME = "D:\SDK"
$env:ANDROID_SDK_ROOT = "D:\SDK"

Write-Host "Configuration des variables d'environnement..." -ForegroundColor Yellow
Write-Host "  JAVA_HOME: $env:JAVA_HOME" -ForegroundColor Gray
Write-Host "  ANDROID_HOME: $env:ANDROID_HOME" -ForegroundColor Gray

# Vérifier Java
if (Test-Path "$env:JAVA_HOME\bin\java.exe") {
    $version = & "$env:JAVA_HOME\bin\java.exe" -version 2>&1 | Select-String "version"
    Write-Host "[OK] Java: $version" -ForegroundColor Green
} else {
    Write-Host "[X] Java non trouve dans $env:JAVA_HOME" -ForegroundColor Red
    exit 1
}

# Vérifier Android SDK
if (Test-Path "$env:ANDROID_HOME\platform-tools\adb.exe") {
    Write-Host "[OK] Android SDK valide" -ForegroundColor Green
} else {
    Write-Host "[X] Android SDK invalide dans $env:ANDROID_HOME" -ForegroundColor Red
    exit 1
}

# Chercher NDK
Write-Host ""
Write-Host "Recherche du NDK..." -ForegroundColor Yellow
$ndkFound = $false
$ndkLocations = @(
    "$env:ANDROID_HOME\ndk",
    "D:\Android Studio\ndk",
    "D:\NDK"
)

foreach ($loc in $ndkLocations) {
    if (Test-Path $loc) {
        $versions = Get-ChildItem $loc -Directory -ErrorAction SilentlyContinue
        if ($versions) {
            $latest = $versions | Sort-Object Name -Descending | Select-Object -First 1
            $env:ANDROID_NDK_HOME = $latest.FullName
            Write-Host "[OK] NDK trouve: $($latest.Name)" -ForegroundColor Green
            Write-Host "  Chemin: $env:ANDROID_NDK_HOME" -ForegroundColor Gray
            $ndkFound = $true
            break
        }
    }
}

if (-not $ndkFound) {
    Write-Host "[!] NDK non trouve" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Le NDK (Native Development Kit) est requis pour Tauri Android." -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Pour l'installer:" -ForegroundColor Cyan
    Write-Host "1. Ouvrez Android Studio" -ForegroundColor White
    Write-Host "2. Allez dans Tools > SDK Manager" -ForegroundColor White
    Write-Host "3. Onglet 'SDK Tools'" -ForegroundColor White
    Write-Host "4. Cochez 'NDK (Side by side)' et installez" -ForegroundColor White
    Write-Host "5. Le NDK sera installe dans: $env:ANDROID_HOME\ndk" -ForegroundColor Gray
    Write-Host ""
    $response = Read-Host "Voulez-vous continuer quand meme (l'initialisation peut echouer) ? (O/N)"
    if ($response -ne "O" -and $response -ne "o" -and $response -ne "Y" -and $response -ne "y") {
        exit 1
    }
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Variables configurees pour cette session" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Pour configurer de maniere permanente, executez:" -ForegroundColor Yellow
Write-Host "  setx JAVA_HOME `"$env:JAVA_HOME`"" -ForegroundColor White
Write-Host "  setx ANDROID_HOME `"$env:ANDROID_HOME`"" -ForegroundColor White
if ($env:ANDROID_NDK_HOME) {
    Write-Host "  setx ANDROID_NDK_HOME `"$env:ANDROID_NDK_HOME`"" -ForegroundColor White
}
Write-Host ""
Write-Host "IMPORTANT: Fermez et rouvrez le terminal apres avoir execute setx" -ForegroundColor Yellow
Write-Host ""
