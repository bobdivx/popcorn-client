# Script pour trouver et configurer Java et Android SDK
Write-Host "Recherche de Java et Android SDK..." -ForegroundColor Cyan
Write-Host ""

# Recherche Java
Write-Host "Recherche Java..." -ForegroundColor Yellow
$javaFound = $false

# Emplacements à vérifier
$javaLocations = @(
    "$env:LOCALAPPDATA\Android\AndroidStudio\jbr",
    "$env:ProgramFiles\Android\Android Studio\jbr",
    "$env:ProgramFiles(x86)\Android\Android Studio\jbr",
    "$env:ProgramFiles\Eclipse Adoptium",
    "$env:ProgramFiles(x86)\Eclipse Adoptium",
    "$env:ProgramFiles\Java",
    "$env:ProgramFiles(x86)\Java",
    "C:\Program Files\Java",
    "C:\Program Files (x86)\Java"
)

foreach ($location in $javaLocations) {
    if (Test-Path $location) {
        if ($location -like "*jbr*") {
            $jdkDirs = Get-ChildItem -Path $location -Directory -ErrorAction SilentlyContinue
            foreach ($jdk in $jdkDirs) {
                $javaExe = Join-Path $jdk.FullName "bin\java.exe"
                if (Test-Path $javaExe) {
                    Write-Host "  [OK] Java trouve: $($jdk.FullName)" -ForegroundColor Green
                    $env:JAVA_HOME = $jdk.FullName
                    $javaFound = $true
                    break
                }
            }
        } elseif ($location -like "*Adoptium*") {
            $jdkDirs = Get-ChildItem -Path "$location\jdk-*" -Directory -ErrorAction SilentlyContinue | Sort-Object Name -Descending
            foreach ($jdk in $jdkDirs) {
                $javaExe = Join-Path $jdk.FullName "bin\java.exe"
                if (Test-Path $javaExe) {
                    Write-Host "  [OK] Java trouve: $($jdk.FullName)" -ForegroundColor Green
                    $env:JAVA_HOME = $jdk.FullName
                    $javaFound = $true
                    break
                }
            }
        } else {
            $jdkDirs = Get-ChildItem -Path $location -Directory -ErrorAction SilentlyContinue
            foreach ($jdk in $jdkDirs) {
                $javaExe = Join-Path $jdk.FullName "bin\java.exe"
                if (Test-Path $javaExe) {
                    Write-Host "  [OK] Java trouve: $($jdk.FullName)" -ForegroundColor Green
                    $env:JAVA_HOME = $jdk.FullName
                    $javaFound = $true
                    break
                }
            }
        }
        if ($javaFound) { break }
    }
}

if (-not $javaFound) {
    Write-Host "  [X] Java non trouve dans les emplacements standards" -ForegroundColor Red
    Write-Host ""
    Write-Host "  Veuillez configurer JAVA_HOME manuellement:" -ForegroundColor Yellow
    Write-Host "  1. Trouvez le chemin d'installation de Java" -ForegroundColor White
    Write-Host "  2. Configurez la variable d'environnement JAVA_HOME" -ForegroundColor White
    Write-Host "     Exemple: setx JAVA_HOME 'C:\Program Files\Java\jdk-17'" -ForegroundColor Gray
}

Write-Host ""

# Recherche Android SDK
Write-Host "Recherche Android SDK..." -ForegroundColor Yellow
$sdkFound = $false

$sdkLocations = @(
    "$env:LOCALAPPDATA\Android\Sdk",
    "$env:USERPROFILE\AppData\Local\Android\Sdk",
    "$env:ProgramFiles\Android\Android Studio\sdk",
    "C:\Android\Sdk",
    "C:\Users\$env:USERNAME\AppData\Local\Android\Sdk"
)

foreach ($location in $sdkLocations) {
    if (Test-Path $location) {
        Write-Host "  [OK] Android SDK trouve: $location" -ForegroundColor Green
        $env:ANDROID_HOME = $location
        $env:ANDROID_SDK_ROOT = $location
        $sdkFound = $true
        
        # Chercher NDK
        $ndkPath = Join-Path $location "ndk"
        if (Test-Path $ndkPath) {
            $ndkVersions = Get-ChildItem $ndkPath -Directory -ErrorAction SilentlyContinue
            if ($ndkVersions) {
                $latestNdk = $ndkVersions | Sort-Object Name -Descending | Select-Object -First 1
                Write-Host "  [OK] NDK trouve: $($latestNdk.Name)" -ForegroundColor Green
                $env:ANDROID_NDK_HOME = $latestNdk.FullName
            } else {
                Write-Host "  [!] NDK non trouve dans $ndkPath" -ForegroundColor Yellow
            }
        } else {
            Write-Host "  [!] Dossier NDK non trouve: $ndkPath" -ForegroundColor Yellow
        }
        break
    }
}

if (-not $sdkFound) {
    Write-Host "  [X] Android SDK non trouve dans les emplacements standards" -ForegroundColor Red
    Write-Host ""
    Write-Host "  Veuillez configurer ANDROID_HOME manuellement:" -ForegroundColor Yellow
    Write-Host "  1. Trouvez le chemin d'installation du SDK Android" -ForegroundColor White
    Write-Host "  2. Configurez la variable d'environnement ANDROID_HOME" -ForegroundColor White
    Write-Host "     Exemple: setx ANDROID_HOME '%LOCALAPPDATA%\Android\Sdk'" -ForegroundColor Gray
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
if ($javaFound -and $sdkFound) {
    Write-Host "[OK] Java et Android SDK trouves et configures pour cette session" -ForegroundColor Green
    Write-Host ""
    Write-Host "Pour configurer de maniere permanente:" -ForegroundColor Yellow
    Write-Host "  setx JAVA_HOME '$env:JAVA_HOME'" -ForegroundColor White
    Write-Host "  setx ANDROID_HOME '$env:ANDROID_HOME'" -ForegroundColor White
    if ($env:ANDROID_NDK_HOME) {
        Write-Host "  setx ANDROID_NDK_HOME '$env:ANDROID_NDK_HOME'" -ForegroundColor White
    }
} else {
    Write-Host "[X] Configuration incomplete" -ForegroundColor Red
}
