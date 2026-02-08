# Script pour configurer l'environnement Android pour Tauri
# Usage: .\scripts\setup-android.ps1

# VÃ©rifier si winget est disponible
function Test-Winget {
    $winget = Get-Command winget -ErrorAction SilentlyContinue
    return $null -ne $winget
}

# Fonction pour installer Java via winget
function Install-Java {
    Write-Host ""
    Write-Host "Installation de Java JDK via winget..." -ForegroundColor Cyan
    
    if (-not (Test-Winget)) {
        Write-Host "  âœ— winget non disponible. Installez Windows Package Manager ou installez Java manuellement." -ForegroundColor Red
        return $false
    }
    
    try {
        Write-Host "  TÃ©lÃ©chargement et installation de Java JDK 17 (cela peut prendre plusieurs minutes)..." -ForegroundColor Yellow
        $result = winget install --id EclipseAdoptium.Temurin.17.JDK --silent --accept-package-agreements --accept-source-agreements 2>&1
        
        if ($LASTEXITCODE -eq 0) {
            Write-Host "  âœ“ Java JDK installÃ© avec succÃ¨s" -ForegroundColor Green
            
            # Essayer de trouver JAVA_HOME aprÃ¨s installation
            $javaPaths = @(
                "$env:ProgramFiles\Eclipse Adoptium\jdk-17*",
                "$env:ProgramFiles(x86)\Eclipse Adoptium\jdk-17*"
            )
            
            foreach ($pattern in $javaPaths) {
                $found = Get-ChildItem -Path $pattern -ErrorAction SilentlyContinue | Sort-Object Name -Descending | Select-Object -First 1
                if ($found) {
                    $env:JAVA_HOME = $found.FullName
                    Write-Host "  âœ“ JAVA_HOME configurÃ© temporairement: $($found.FullName)" -ForegroundColor Green
                    Write-Host "  âš ï¸  Configurez JAVA_HOME de maniÃ¨re permanente dans les variables d'environnement" -ForegroundColor Yellow
                    return $true
                }
            }
            
            return $true
        } else {
            Write-Host "  âœ— Erreur lors de l'installation: $result" -ForegroundColor Red
            return $false
        }
    } catch {
        Write-Host "  âœ— Erreur: $($_.Exception.Message)" -ForegroundColor Red
        return $false
    }
}

# Fonction pour installer Rust via winget
function Install-Rust {
    Write-Host ""
    Write-Host "Installation de Rust via winget..." -ForegroundColor Cyan
    
    if (-not (Test-Winget)) {
        Write-Host "  âœ— winget non disponible. Installez Rust manuellement depuis https://rustup.rs/" -ForegroundColor Red
        return $false
    }
    
    try {
        Write-Host "  TÃ©lÃ©chargement et installation de Rust (cela peut prendre plusieurs minutes)..." -ForegroundColor Yellow
        $result = winget install --id Rustlang.Rustup --silent --accept-package-agreements --accept-source-agreements 2>&1
        
        if ($LASTEXITCODE -eq 0) {
            Write-Host "  âœ“ Rust installÃ© avec succÃ¨s" -ForegroundColor Green
            Write-Host "  âš ï¸  RedÃ©marrez le terminal pour que Rust soit disponible dans le PATH" -ForegroundColor Yellow
            return $true
        } else {
            Write-Host "  âœ— Erreur lors de l'installation: $result" -ForegroundColor Red
            return $false
        }
    } catch {
        Write-Host "  âœ— Erreur: $($_.Exception.Message)" -ForegroundColor Red
        return $false
    }
}

# ========================================
# DÃ‰BUT DU SCRIPT
# ========================================

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Configuration Android pour Tauri" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Demander si l'utilisateur veut installer automatiquement
Write-Host "Ce script peut installer automatiquement certains prÃ©requis via winget." -ForegroundColor Cyan
Write-Host ""
$response = Read-Host "Voulez-vous installer automatiquement Java et Rust s'ils manquent ? (O/N)"
$autoInstall = ($response -eq "O" -or $response -eq "o" -or $response -eq "Y" -or $response -eq "y")

if ($autoInstall) {
    if (-not (Test-Winget)) {
        Write-Host ""
        Write-Host "âš ï¸  winget n'est pas disponible sur ce systÃ¨me." -ForegroundColor Yellow
        Write-Host "   L'installation automatique ne sera pas possible." -ForegroundColor Yellow
        Write-Host "   Installez Windows Package Manager ou installez les prÃ©requis manuellement." -ForegroundColor Yellow
        Write-Host ""
        $autoInstall = $false
    } else {
        Write-Host ""
        Write-Host "âœ“ Installation automatique activÃ©e" -ForegroundColor Green
        Write-Host ""
    }
}

$errors = 0
$warnings = 0

# Fonction pour vÃ©rifier Java
function Test-Java {
    Write-Host "VÃ©rification Java JDK..." -ForegroundColor Yellow
    
    # VÃ©rifier JAVA_HOME
    $javaHome = $env:JAVA_HOME
    if ($javaHome -and (Test-Path $javaHome)) {
        $javaExe = Join-Path $javaHome "bin\java.exe"
        if (Test-Path $javaExe) {
            $version = & $javaExe -version 2>&1 | Select-String "version"
            Write-Host "  âœ“ JAVA_HOME configurÃ©: $javaHome" -ForegroundColor Green
            Write-Host "    $version" -ForegroundColor Gray
            return $true
        }
    }
    
    # VÃ©rifier dans PATH
    $javaPath = Get-Command java -ErrorAction SilentlyContinue
    if ($javaPath) {
        $version = java -version 2>&1 | Select-String "version"
        Write-Host "  âœ“ Java trouvÃ© dans PATH" -ForegroundColor Green
        Write-Host "    $version" -ForegroundColor Gray
        
        # Essayer de trouver JAVA_HOME depuis le chemin
        $javaDir = Split-Path (Split-Path $javaPath.Source)
        if (Test-Path (Join-Path $javaDir "bin\java.exe")) {
            Write-Host "  â„¹ï¸  JAVA_HOME non configurÃ©, mais Java trouvÃ©" -ForegroundColor Yellow
            $warnings++
        }
        return $true
    }
    
    # VÃ©rifier les emplacements par dÃ©faut d'Android Studio
    $defaultJavaPaths = @(
        "$env:LOCALAPPDATA\Android\AndroidStudio\jbr",
        "$env:ProgramFiles\Android\Android Studio\jbr",
        "$env:ProgramFiles(x86)\Android\Android Studio\jbr"
    )
    
    foreach ($path in $defaultJavaPaths) {
        if (Test-Path $path) {
            $javaExe = Join-Path $path "bin\java.exe"
            if (Test-Path $javaExe) {
                Write-Host "  âœ“ Java trouvÃ© dans Android Studio: $path" -ForegroundColor Green
                Write-Host "  âš ï¸  Configurez JAVA_HOME: $path" -ForegroundColor Yellow
                $warnings++
                return $true
            }
        }
    }
    
    Write-Host "  âœ— Java JDK non trouvÃ©" -ForegroundColor Red
    Write-Host ""
    
    if ($autoInstall) {
        if (Install-Java) {
            # RÃ©essayer aprÃ¨s installation
            Start-Sleep -Seconds 2
            return Test-Java
        }
    } else {
        Write-Host "    Installation requise:" -ForegroundColor Yellow
        Write-Host "    1. TÃ©lÃ©chargez Java JDK 17+ depuis:" -ForegroundColor White
        Write-Host "       https://adoptium.net/ ou https://www.oracle.com/java/technologies/downloads/" -ForegroundColor Cyan
        Write-Host "    2. Installez-le et configurez JAVA_HOME" -ForegroundColor White
        Write-Host "    3. Ou installez Android Studio (inclut Java)" -ForegroundColor White
        Write-Host "    4. Ou rÃ©exÃ©cutez ce script avec l'option d'installation automatique" -ForegroundColor White
        Write-Host ""
    }
    
    $errors++
    return $false
}

# Fonction pour vÃ©rifier Android SDK
function Test-AndroidSDK {
    Write-Host "VÃ©rification Android SDK..." -ForegroundColor Yellow
    
    # VÃ©rifier ANDROID_HOME
    $androidHome = $env:ANDROID_HOME
    if (-not $androidHome) {
        $androidHome = $env:ANDROID_SDK_ROOT
    }
    
    if ($androidHome -and (Test-Path $androidHome)) {
        Write-Host "  âœ“ ANDROID_HOME configurÃ©: $androidHome" -ForegroundColor Green
        
        # VÃ©rifier NDK
        $ndkPath = Join-Path $androidHome "ndk"
        if (Test-Path $ndkPath) {
            $ndkVersions = Get-ChildItem $ndkPath -Directory -ErrorAction SilentlyContinue
            if ($ndkVersions) {
                $latestNdk = $ndkVersions | Sort-Object Name -Descending | Select-Object -First 1
                Write-Host "  âœ“ Android NDK trouvÃ©: $($latestNdk.Name)" -ForegroundColor Green
                
                # Configurer ANDROID_NDK_HOME si nÃ©cessaire
                if (-not $env:ANDROID_NDK_HOME) {
                    $env:ANDROID_NDK_HOME = $latestNdk.FullName
                    Write-Host "  â„¹ï¸  ANDROID_NDK_HOME non configurÃ©, utilisation: $($latestNdk.FullName)" -ForegroundColor Yellow
                    $warnings++
                }
                return $true
            } else {
                Write-Host "  âš ï¸  NDK non installÃ© dans $ndkPath" -ForegroundColor Yellow
                $warnings++
            }
        } else {
            Write-Host "  âš ï¸  Dossier NDK non trouvÃ©" -ForegroundColor Yellow
            $warnings++
        }
        
        return $true
    }
    
    # VÃ©rifier les emplacements par dÃ©faut
    $defaultSdkPaths = @(
        "$env:LOCALAPPDATA\Android\Sdk",
        "$env:USERPROFILE\AppData\Local\Android\Sdk",
        "$env:ProgramFiles\Android\Android Studio\sdk"
    )
    
    foreach ($path in $defaultSdkPaths) {
        if (Test-Path $path) {
            Write-Host "  âœ“ Android SDK trouvÃ©: $path" -ForegroundColor Green
            Write-Host "  âš ï¸  Configurez ANDROID_HOME: $path" -ForegroundColor Yellow
            $warnings++
            return $true
        }
    }
    
    Write-Host "  âœ— Android SDK non trouvÃ©" -ForegroundColor Red
    Write-Host ""
    
    if ($autoInstall) {
        Write-Host "    Installation d'Android Studio via winget..." -ForegroundColor Yellow
        Write-Host "    (Note: Android Studio est volumineux, le tÃ©lÃ©chargement peut prendre du temps)" -ForegroundColor Gray
        Write-Host ""
        $response = Read-Host "    Voulez-vous installer Android Studio maintenant ? (O/N)"
        if ($response -eq "O" -or $response -eq "o" -or $response -eq "Y" -or $response -eq "y") {
            if (Test-Winget) {
                try {
                    Write-Host "    TÃ©lÃ©chargement et installation d'Android Studio..." -ForegroundColor Yellow
                    $result = winget install --id Google.AndroidStudio --silent --accept-package-agreements --accept-source-agreements 2>&1
                    
                    if ($LASTEXITCODE -eq 0) {
                        Write-Host "    âœ“ Android Studio installÃ©" -ForegroundColor Green
                        Write-Host ""
                        Write-Host "    âš ï¸  IMPORTANT: AprÃ¨s l'installation:" -ForegroundColor Yellow
                        Write-Host "    1. Ouvrez Android Studio" -ForegroundColor White
                        Write-Host "    2. Allez dans SDK Manager et installez:" -ForegroundColor White
                        Write-Host "       - Android SDK Platform" -ForegroundColor White
                        Write-Host "       - Android SDK Build-Tools" -ForegroundColor White
                        Write-Host "       - Android NDK (Native Development Kit)" -ForegroundColor White
                        Write-Host "    3. Configurez ANDROID_HOME et ANDROID_NDK_HOME" -ForegroundColor White
                        Write-Host "    4. RÃ©exÃ©cutez ce script" -ForegroundColor White
                        Write-Host ""
                        return $false
                    } else {
                        Write-Host "    âœ— Erreur lors de l'installation: $result" -ForegroundColor Red
                    }
                } catch {
                    Write-Host "    âœ— Erreur: $($_.Exception.Message)" -ForegroundColor Red
                }
            }
        }
    }
    
    Write-Host "    Installation requise:" -ForegroundColor Yellow
    Write-Host "    1. Installez Android Studio depuis:" -ForegroundColor White
    Write-Host "       https://developer.android.com/studio" -ForegroundColor Cyan
    Write-Host "       Ou via winget: winget install Google.AndroidStudio" -ForegroundColor Cyan
    Write-Host "    2. Ouvrez Android Studio > SDK Manager" -ForegroundColor White
    Write-Host "    3. Installez Android SDK et NDK" -ForegroundColor White
    Write-Host "    4. Configurez ANDROID_HOME et ANDROID_NDK_HOME" -ForegroundColor White
    Write-Host ""
    $errors++
    return $false
}

# VÃ©rifier Rust
Write-Host "VÃ©rification Rust..." -ForegroundColor Yellow
$rustVersion = rustc --version 2>$null
if ($rustVersion) {
    Write-Host "  âœ“ Rust installÃ©" -ForegroundColor Green
} else {
    Write-Host "  âœ— Rust non installÃ©" -ForegroundColor Red
    
    if ($autoInstall) {
        if (Install-Rust) {
            Write-Host "  âš ï¸  RedÃ©marrez le terminal et rÃ©exÃ©cutez ce script" -ForegroundColor Yellow
            $errors++
        } else {
            $errors++
        }
    } else {
        Write-Host "    Installez Rust depuis: https://rustup.rs/" -ForegroundColor Yellow
        Write-Host "    Ou rÃ©exÃ©cutez ce script avec l'option d'installation automatique" -ForegroundColor Yellow
        $errors++
    }
}

# VÃ©rifier les dÃ©pendances
$javaOk = Test-Java
$androidOk = Test-AndroidSDK

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan

if ($errors -eq 0) {
    Write-Host "âœ“ Toutes les dÃ©pendances sont installÃ©es !" -ForegroundColor Green
    
    if ($warnings -gt 0) {
        Write-Host ""
        Write-Host "âš ï¸  $warnings avertissement(s) - Variables d'environnement Ã  configurer:" -ForegroundColor Yellow
        Write-Host ""
        
        if (-not $env:JAVA_HOME) {
            Write-Host "  JAVA_HOME" -ForegroundColor White
        }
        if (-not $env:ANDROID_HOME -and -not $env:ANDROID_SDK_ROOT) {
            Write-Host "  ANDROID_HOME" -ForegroundColor White
        }
        if (-not $env:ANDROID_NDK_HOME) {
            Write-Host "  ANDROID_NDK_HOME" -ForegroundColor White
        }
        
        Write-Host ""
        Write-Host "  Pour configurer les variables d'environnement:" -ForegroundColor Cyan
        Write-Host "  1. Ouvrez 'Variables d'environnement' dans Windows" -ForegroundColor White
        Write-Host "  2. Ajoutez les variables systÃ¨me ou utilisateur" -ForegroundColor White
        Write-Host "  3. RedÃ©marrez le terminal" -ForegroundColor White
        Write-Host ""
    }
    
    Write-Host ""
    $response = Read-Host "Voulez-vous initialiser l'environnement Android Tauri maintenant ? (O/N)"
    if ($response -eq "O" -or $response -eq "o" -or $response -eq "Y" -or $response -eq "y") {
        Write-Host ""
        Write-Host "Initialisation de l'environnement Android Tauri..." -ForegroundColor Cyan
        Write-Host ""
        
        try {
            $output = npx tauri android init 2>&1
            if ($LASTEXITCODE -eq 0) {
                Write-Host ""
                Write-Host "âœ… Configuration Android terminÃ©e !" -ForegroundColor Green
                Write-Host ""
                Write-Host "Vous pouvez maintenant construire l'application Android:" -ForegroundColor Cyan
                Write-Host "  npm run tauri:build:android         - Build Android standard" -ForegroundColor White
                Write-Host "  npm run tauri:build:android-tv      - Build Android TV" -ForegroundColor White
                Write-Host "  npm run tauri:build:android-mobile  - Build Android Mobile" -ForegroundColor White
            } else {
                Write-Host ""
                Write-Host "âŒ Erreur lors de l'initialisation:" -ForegroundColor Red
                Write-Host $output -ForegroundColor Red
                Write-Host ""
                Write-Host "VÃ©rifiez que:" -ForegroundColor Yellow
                Write-Host "  1. Java est installÃ© et JAVA_HOME est configurÃ©" -ForegroundColor White
                Write-Host "  2. Android SDK et NDK sont installÃ©s" -ForegroundColor White
                Write-Host "  3. Les variables d'environnement sont correctement dÃ©finies" -ForegroundColor White
                Write-Host ""
                Write-Host "Consultez INSTALLATION_ANDROID.md pour plus de dÃ©tails" -ForegroundColor Cyan
                exit 1
            }
        } catch {
            Write-Host ""
            Write-Host "âŒ Erreur lors de l'initialisation:" -ForegroundColor Red
            Write-Host $_.Exception.Message -ForegroundColor Red
            exit 1
        }
    } else {
        Write-Host ""
        Write-Host "Initialisation annulÃ©e. Vous pouvez l'exÃ©cuter plus tard avec:" -ForegroundColor Yellow
        Write-Host "  npx tauri android init" -ForegroundColor White
    }
    
    exit 0
} else {
    Write-Host "âœ— $errors erreur(s) dÃ©tectÃ©e(s)" -ForegroundColor Red
    Write-Host ""
    Write-Host "Veuillez installer les dÃ©pendances manquantes avant de continuer." -ForegroundColor Yellow
    exit 1
}
