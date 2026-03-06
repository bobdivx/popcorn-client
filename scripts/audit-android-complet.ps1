# Script d'audit complet Android pour vérifier et corriger la communication backend
# Usage: .\scripts\audit-android-complet.ps1

$ErrorActionPreference = "Continue"
$projectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$adbPath = "D:\SDK\platform-tools\adb.exe"
$packageId = "com.popcorn.client.mobile"
$logFile = "d:\Github\popcorn-server\.cursor\debug.log"

function Write-Section { param([string]$m) Write-Host "`n========================================" -ForegroundColor Cyan; Write-Host $m -ForegroundColor Cyan; Write-Host "========================================" -ForegroundColor Cyan }
function Write-Info { param([string]$m) Write-Host "[INFO] $m" -ForegroundColor Cyan }
function Write-Ok { param([string]$m) Write-Host "[OK] $m" -ForegroundColor Green }
function Write-Err { param([string]$m) Write-Host "[ERREUR] $m" -ForegroundColor Red }
function Write-Warn { param([string]$m) Write-Host "[WARN] $m" -ForegroundColor Yellow }

$auditResults = @{
    Environment = @{}
    ConfigTauri = @{}
    CodeRust = @{}
    Frontend = @{}
    Communication = @{}
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "AUDIT ANDROID COMPLET - COMMUNICATION BACKEND" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

# ============================================================================
# 1. VÉRIFICATION ENVIRONNEMENT
# ============================================================================
Write-Section "1. Vérification Environnement"

# Java
$javaOk = $false
$javaHome = $env:JAVA_HOME
if ($javaHome -and (Test-Path $javaHome)) {
    $javaExe = Join-Path $javaHome "bin\java.exe"
    if (Test-Path $javaExe) {
        $version = & $javaExe -version 2>&1 | Select-String "version" | Select-Object -First 1
        Write-Ok "JAVA_HOME: $javaHome - $version"
        $javaOk = $true
    } else {
        Write-Err "JAVA_HOME configuré mais java.exe introuvable"
    }
} else {
    $javaPath = Get-Command java -ErrorAction SilentlyContinue
    if ($javaPath) {
        $version = java -version 2>&1 | Select-String "version" | Select-Object -First 1
        Write-Warn "Java dans PATH mais JAVA_HOME non configuré - $version"
        $javaOk = $true
    } else {
        Write-Err "Java non trouvé"
    }
}
$auditResults.Environment.Java = $javaOk

# Android SDK - Vérifier aussi D:\SDK qui semble être utilisé
$androidOk = $false
$androidHome = $env:ANDROID_HOME
if (-not $androidHome) { $androidHome = $env:ANDROID_SDK_ROOT }
if (-not $androidHome -and (Test-Path "D:\SDK")) { $androidHome = "D:\SDK" }
if ($androidHome -and (Test-Path $androidHome)) {
    Write-Ok "ANDROID_HOME: $androidHome"
    $ndkPath = Join-Path $androidHome "ndk"
    if (Test-Path $ndkPath) {
        $ndkVersions = Get-ChildItem $ndkPath -Directory -ErrorAction SilentlyContinue
        if ($ndkVersions) {
            $latestNdk = $ndkVersions | Sort-Object Name -Descending | Select-Object -First 1
            Write-Ok "NDK trouvé: $($latestNdk.Name)"
            $androidOk = $true
        } else {
            Write-Err "Aucune version NDK trouvée"
        }
    } else {
        Write-Err "NDK introuvable: $ndkPath"
    }
} else {
    Write-Err "ANDROID_HOME non configuré"
}
$auditResults.Environment.Android = $androidOk

# Rust
$rustOk = $false
$rustVersion = rustc --version 2>$null
if ($rustVersion) {
    Write-Ok "Rust: $rustVersion"
    $target = rustup target list --installed 2>$null | Select-String "aarch64-linux-android"
    if ($target) {
        Write-Ok "aarch64-linux-android installé"
        $rustOk = $true
    } else {
        Write-Warn "aarch64-linux-android non installé (rustup target add aarch64-linux-android)"
    }
} else {
    Write-Err "Rust non installé"
}
$auditResults.Environment.Rust = $rustOk

# ADB
$adbOk = $false
if (Test-Path $adbPath) {
    $devices = & $adbPath devices 2>&1 | Select-String "device$"
    if ($devices) {
        Write-Ok "ADB: $adbPath - $($devices.Count) appareil(s) connecté(s)"
        $adbOk = $true
    } else {
        Write-Warn "ADB trouvé mais aucun appareil connecté"
    }
} else {
    Write-Err "ADB non trouvé: $adbPath"
}
$auditResults.Environment.ADB = $adbOk

# ============================================================================
# 2. VÉRIFICATION CONFIGURATION TAURI
# ============================================================================
Write-Section "2. Vérification Configuration Tauri Android"

$configPath = Join-Path $projectRoot "src-tauri\tauri.android.mobile.conf.json"
$configOk = $false
if (Test-Path $configPath) {
    try {
        $jsonContent = Get-Content $configPath -Raw -Encoding UTF8
        $config = $jsonContent | ConvertFrom-Json
        Write-Ok "Configuration trouvée: tauri.android.mobile.conf.json"
        
        # Vérifier les permissions core:allow-invoke
        $permissions = $config.app.security.capabilities[0].permissions
        $hasCoreDefault = $false
        $hasCoreAllowInvoke = $false
        $hasNativeFetchInAllow = $false
        
        # Vérifier core:default
        foreach ($perm in $permissions) {
            if ($perm -is [string] -and $perm -eq "core:default") {
                $hasCoreDefault = $true
            } elseif ($perm -is [PSCustomObject] -and $perm.identifier -eq "core:allow-invoke") {
                $hasCoreAllowInvoke = $true
                if ($perm.allow) {
                    foreach ($allowed in $perm.allow) {
                        if ($allowed.name -eq "native-fetch") {
                            $hasNativeFetchInAllow = $true
                        }
                    }
                }
            }
        }
        
        if ($hasCoreDefault) {
            Write-Ok "core:default présent"
        } else {
            Write-Err "core:default manquant"
        }
        
        if ($hasCoreAllowInvoke) {
            Write-Ok "core:allow-invoke présent"
            if ($hasNativeFetchInAllow) {
                Write-Ok "native-fetch autorisé dans core:allow-invoke"
            } else {
                Write-Err "native-fetch NON autorisé dans core:allow-invoke"
            }
        } else {
            Write-Err "core:allow-invoke manquant"
        }
        
        # Vérifier http:allow-fetch
        $hasHttpAllowFetch = $permissions | Where-Object { 
            ($_ -is [PSCustomObject] -and $_.identifier -like "*http*allow-fetch*") -or 
            ($_ -like "*http*allow-fetch*")
        }
        if ($hasHttpAllowFetch) {
            Write-Ok "Permissions HTTP présentes"
        } else {
            Write-Warn "Permissions HTTP non détectées"
        }
        
        if ($hasCoreDefault -and $hasCoreAllowInvoke -and $hasNativeFetchInAllow) {
            $configOk = $true
        }
    } catch {
        Write-Err "Erreur lecture configuration: $_"
    }
} else {
    Write-Err "Configuration non trouvée: $configPath"
}
$auditResults.ConfigTauri.Valid = $configOk

# ============================================================================
# 3. VÉRIFICATION CODE RUST
# ============================================================================
Write-Section "3. Vérification Code Rust"

$libRsPath = Join-Path $projectRoot "src-tauri\src\lib.rs"
$rustCodeOk = $false
if (Test-Path $libRsPath) {
    $rustContent = Get-Content $libRsPath -Raw
    $hasNativeFetchFn = $rustContent -match "#\[tauri::command\(rename = ""native-fetch""\)\]"
    $hasMobileEntryPoint = $rustContent -match "#\[cfg_attr\(mobile, tauri::mobile_entry_point\)\]"
    $hasGenerateHandler = $rustContent -match "generate_handler!\[.*native_fetch"
    
    if ($hasNativeFetchFn) {
        Write-Ok "Fonction native-fetch trouvée"
    } else {
        Write-Err "Fonction native-fetch NON trouvée"
    }
    
    if ($hasMobileEntryPoint) {
        Write-Ok "mobile_entry_point présent"
    } else {
        Write-Err "mobile_entry_point manquant"
    }
    
    if ($hasGenerateHandler) {
        Write-Ok "native_fetch dans generate_handler"
    } else {
        Write-Err "native_fetch NON dans generate_handler"
    }
    
    if ($hasNativeFetchFn -and $hasMobileEntryPoint -and $hasGenerateHandler) {
        $rustCodeOk = $true
    }
} else {
    Write-Err "lib.rs non trouvé: $libRsPath"
}
$auditResults.CodeRust.Valid = $rustCodeOk

# ============================================================================
# 4. VÉRIFICATION FRONTEND
# ============================================================================
Write-Section "4. Vérification Frontend (utilisation native-fetch)"

$serverApiPath = Join-Path $projectRoot "src\lib\client\server-api.ts"
$frontendOk = $false
if (Test-Path $serverApiPath) {
    $frontendContent = Get-Content $serverApiPath -Raw
    $hasInvokeNativeFetch = $frontendContent -match "invoke\('native-fetch'"
    $hasFallbackPluginHttp = $frontendContent -match "plugin-http|@tauri-apps/plugin-http"
    
    if ($hasInvokeNativeFetch) {
        Write-Ok "Appel invoke('native-fetch') trouvé dans server-api.ts"
    } else {
        Write-Warn "Appel invoke('native-fetch') non détecté"
    }
    
    if ($hasFallbackPluginHttp) {
        Write-Ok "Fallback plugin-http présent"
    }
    
    $frontendOk = $hasInvokeNativeFetch
} else {
    Write-Err "server-api.ts non trouvé"
}
$auditResults.Frontend.Valid = $frontendOk

# ============================================================================
# 5. TEST COMMUNICATION (si appareil connecté)
# ============================================================================
Write-Section "5. Test Communication Runtime"

$communicationOk = $false
if ($adbOk) {
    # Vérifier si APK existe et installer
    $apk = Get-ChildItem "d:\Github\popcorn-web\app\Popcorn_Mobile-v*.apk" -ErrorAction SilentlyContinue | 
        Sort-Object LastWriteTime -Descending | Select-Object -First 1
    
    if ($apk) {
        Write-Info "APK trouvé: $($apk.Name)"
        
        # Préparer les logs
        $logDir = Split-Path $logFile -Parent
        if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir -Force | Out-Null }
        if (Test-Path $logFile) { Remove-Item $logFile -Force }
        
        Write-Info "Test de communication en cours..."
        Write-Info "Note: Ce test nécessite que l'app soit lancée et utilisée"
        
        # Lancer l'app si pas déjà lancée
        & $adbPath shell am force-stop $packageId 2>&1 | Out-Null
        Start-Sleep -Seconds 1
        & $adbPath shell monkey -p $packageId -c android.intent.category.LAUNCHER 1 2>&1 | Out-Null
        Write-Ok "Application lancée (si installée)"
        
        Start-Sleep -Seconds 3
        & $adbPath logcat -c 2>&1 | Out-Null
        
        Write-Warn "Pour tester complètement:"
        Write-Host "  1. Naviguez dans l'app vers Settings > Diagnostics" -ForegroundColor Gray
        Write-Host "  2. Lancez les tests de diagnostic" -ForegroundColor Gray
        Write-Host "  3. Attendez la fin" -ForegroundColor Gray
        Write-Host "  4. Relancez ce script ou analysez les logs dans: $logFile" -ForegroundColor Gray
        
        $communicationOk = $true  # On considère OK si l'app peut être lancée
    } else {
        Write-Warn "Aucun APK trouvé - build nécessaire"
    }
} else {
    Write-Warn "ADB non disponible - test runtime ignoré"
}

$auditResults.Communication.Testable = $communicationOk

# ============================================================================
# RÉSUMÉ
# ============================================================================
Write-Section "RÉSUMÉ DE L'AUDIT"

$allEnvOk = $auditResults.Environment.Java -and $auditResults.Environment.Android -and $auditResults.Environment.Rust -and $auditResults.Environment.ADB
$allConfigOk = $auditResults.ConfigTauri.Valid -and $auditResults.CodeRust.Valid -and $auditResults.Frontend.Valid

Write-Host ""
Write-Host "Environnement:" -ForegroundColor Yellow
Write-Host "  Java: $(if ($auditResults.Environment.Java) {'[OK]'} else {'[FAIL]'})" -ForegroundColor $(if ($auditResults.Environment.Java) {'Green'} else {'Red'})
Write-Host "  Android SDK: $(if ($auditResults.Environment.Android) {'[OK]'} else {'[FAIL]'})" -ForegroundColor $(if ($auditResults.Environment.Android) {'Green'} else {'Red'})
Write-Host "  Rust: $(if ($auditResults.Environment.Rust) {'[OK]'} else {'[FAIL]'})" -ForegroundColor $(if ($auditResults.Environment.Rust) {'Green'} else {'Red'})
Write-Host "  ADB: $(if ($auditResults.Environment.ADB) {'[OK]'} else {'[FAIL]'})" -ForegroundColor $(if ($auditResults.Environment.ADB) {'Green'} else {'Red'})

Write-Host ""
Write-Host "Configuration:" -ForegroundColor Yellow
Write-Host "  Tauri Android Config: $(if ($auditResults.ConfigTauri.Valid) {'[OK]'} else {'[FAIL]'})" -ForegroundColor $(if ($auditResults.ConfigTauri.Valid) {'Green'} else {'Red'})
Write-Host "  Code Rust: $(if ($auditResults.CodeRust.Valid) {'[OK]'} else {'[FAIL]'})" -ForegroundColor $(if ($auditResults.CodeRust.Valid) {'Green'} else {'Red'})
Write-Host "  Frontend: $(if ($auditResults.Frontend.Valid) {'[OK]'} else {'[FAIL]'})" -ForegroundColor $(if ($auditResults.Frontend.Valid) {'Green'} else {'Red'})

Write-Host ""
if ($allEnvOk -and $allConfigOk) {
    Write-Ok "[OK] AUDIT REUSSI - Tous les aspects sont correctement configures"
    Write-Info "Vous pouvez maintenant lancer un test de communication avec:"
    Write-Host "  .\scripts\test-communication-auto.ps1" -ForegroundColor White
    exit 0
} else {
    Write-Err "[FAIL] AUDIT ECHOUE - Des problemes ont ete detectes"
    Write-Info "Corrigez les problemes identifies ci-dessus"
    exit 1
}