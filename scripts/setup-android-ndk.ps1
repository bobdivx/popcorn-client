# Script pour configurer les variables d'environnement du NDK pour le build Android
$ndk = Get-ChildItem "D:\SDK\ndk" -Directory | Sort-Object Name -Descending | Select-Object -First 1

if (-not $ndk) {
    Write-Host "[ERREUR] NDK non trouve dans D:\SDK\ndk" -ForegroundColor Red
    exit 1
}

$ndkPath = $ndk.FullName
$toolchainPath = Join-Path $ndkPath "toolchains\llvm\prebuilt\windows-x86_64\bin"

if (-not (Test-Path $toolchainPath)) {
    Write-Host "[ERREUR] Toolchain non trouve dans $toolchainPath" -ForegroundColor Red
    exit 1
}

# Trouver les outils
$clang = Get-ChildItem "$toolchainPath\aarch64-linux-android*-clang.cmd" | Select-Object -First 1
$ar = Get-ChildItem "$toolchainPath\llvm-ar.exe" | Select-Object -First 1
$ranlib = Get-ChildItem "$toolchainPath\llvm-ranlib.exe" | Select-Object -First 1
$strip = Get-ChildItem "$toolchainPath\llvm-strip.exe" | Select-Object -First 1

if ($clang) {
    $env:CC_aarch64_linux_android = $clang.FullName
    Write-Host "[OK] CC: $($clang.FullName)" -ForegroundColor Green
} else {
    Write-Host "[ERREUR] Clang non trouve" -ForegroundColor Red
    exit 1
}

if ($ar) {
    $env:AR_aarch64_linux_android = $ar.FullName
    Write-Host "[OK] AR: $($ar.FullName)" -ForegroundColor Green
} else {
    Write-Host "[ERREUR] AR non trouve" -ForegroundColor Red
    exit 1
}

if ($ranlib) {
    $env:RANLIB_aarch64_linux_android = $ranlib.FullName
    Write-Host "[OK] RANLIB: $($ranlib.FullName)" -ForegroundColor Green
}

if ($strip) {
    $env:STRIP_aarch64_linux_android = $strip.FullName
    Write-Host "[OK] STRIP: $($strip.FullName)" -ForegroundColor Green
}

# Configurer aussi les variables principales
$env:JAVA_HOME = "D:\Android Studio\jbr"
$env:ANDROID_HOME = "D:\SDK"
$env:ANDROID_SDK_ROOT = "D:\SDK"
$env:ANDROID_NDK_HOME = $ndkPath

Write-Host ""
Write-Host "[OK] Configuration NDK terminee" -ForegroundColor Green
