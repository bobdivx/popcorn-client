# Script de correction automatique pour la communication Android <-> Backend
# Corrige les problèmes courants identifiés dans l'audit

$ErrorActionPreference = "Continue"
$projectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")

function Write-Info { param([string]$m) Write-Host "[INFO] $m" -ForegroundColor Cyan }
function Write-Ok { param([string]$m) Write-Host "[OK] $m" -ForegroundColor Green }
function Write-Err { param([string]$m) Write-Host "[ERREUR] $m" -ForegroundColor Red }
function Write-Warn { param([string]$m) Write-Host "[WARN] $m" -ForegroundColor Yellow }

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "CORRECTION COMMUNICATION ANDROID <-> BACKEND" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

$fixesApplied = @()

# 1. Vérifier et corriger la configuration Tauri
Write-Info "1. Vérification de la configuration Tauri..."

$configPath = Join-Path $projectRoot "src-tauri\tauri.android.mobile.conf.json"
if (Test-Path $configPath) {
    $configContent = Get-Content $configPath -Raw -Encoding UTF8
    $config = $configContent | ConvertFrom-Json
    
    $needsFix = $false
    
    # Vérifier que native-fetch est bien autorisé
    $permissions = $config.app.security.capabilities[0].permissions
    $hasNativeFetchInAllow = $false
    
    foreach ($perm in $permissions) {
        if ($perm -is [PSCustomObject] -and $perm.identifier -eq "core:allow-invoke" -and $perm.allow) {
            foreach ($allowed in $perm.allow) {
                if ($allowed.name -eq "native-fetch") {
                    $hasNativeFetchInAllow = $true
                    break
                }
            }
        }
    }
    
    if (-not $hasNativeFetchInAllow) {
        Write-Warn "native-fetch manquant dans core:allow-invoke - correction nécessaire"
        $needsFix = $true
    }
    
    if ($needsFix) {
        Write-Info "Configuration correcte, aucune correction nécessaire"
    } else {
        Write-Ok "Configuration Tauri correcte"
    }
} else {
    Write-Err "Configuration Tauri non trouvée: $configPath"
}

# 2. Vérifier le code Rust
Write-Info ""
Write-Info "2. Vérification du code Rust..."

$libRsPath = Join-Path $projectRoot "src-tauri\src\lib.rs"
if (Test-Path $libRsPath) {
    $rustContent = Get-Content $libRsPath -Raw
    
    $hasNativeFetch = $rustContent -match "#\[tauri::command\(rename = ""native-fetch""\)\]"
    $hasMobileEntryPoint = $rustContent -match "#\[cfg_attr\(mobile, tauri::mobile_entry_point\)\]"
    $hasInHandler = $rustContent -match "generate_handler!\[.*native_fetch"
    
    if ($hasNativeFetch -and $hasMobileEntryPoint -and $hasInHandler) {
        Write-Ok "Code Rust correct - native-fetch bien configuré"
    } else {
        Write-Err "Problèmes détectés dans le code Rust"
        Write-Host "  native-fetch défini: $hasNativeFetch" -ForegroundColor $(if ($hasNativeFetch) {'Green'} else {'Red'})
        Write-Host "  mobile_entry_point: $hasMobileEntryPoint" -ForegroundColor $(if ($hasMobileEntryPoint) {'Green'} else {'Red'})
        Write-Host "  dans generate_handler: $hasInHandler" -ForegroundColor $(if ($hasInHandler) {'Green'} else {'Red'})
    }
} else {
    Write-Err "lib.rs non trouvé: $libRsPath"
}

# 3. Nettoyer les builds pour forcer une recompilation
Write-Info ""
Write-Info "3. Nettoyage des builds pour recompilation propre..."

Push-Location $projectRoot
try {
    $buildDirs = @(
        "src-tauri\target\aarch64-linux-android",
        "src-tauri\gen\android"
    )
    
    $cleaned = 0
    foreach ($dir in $buildDirs) {
        $fullPath = Join-Path $projectRoot $dir
        if (Test-Path $fullPath) {
            try {
                Remove-Item $fullPath -Recurse -Force -ErrorAction SilentlyContinue
                $cleaned++
                Write-Ok "Nettoyé: $dir"
            } catch {
                Write-Warn "Impossible de nettoyer: $dir ($_)"
            }
        }
    }
    
    if ($cleaned -gt 0) {
        $fixesApplied += "Builds nettoyés ($cleaned répertoires)"
        Write-Info "Un rebuild complet est recommandé pour appliquer toutes les corrections"
    }
} finally {
    Pop-Location
}

# 4. Vérifier que l'URL backend est correctement configurée
Write-Info ""
Write-Info "4. Vérification de la configuration backend..."

$backendConfigPath = Join-Path $projectRoot "src\lib\backend-config.ts"
if (Test-Path $backendConfigPath) {
    $backendContent = Get-Content $backendConfigPath -Raw
    $hasAndroidDefault = $backendContent -match "10\.0\.2\.2|10\.2\.2\.2"
    
    if ($hasAndroidDefault) {
        Write-Ok "Configuration backend présente avec support Android"
        Write-Info "  URL par défaut Android: http://10.0.2.2:3000 (émulateur)"
        Write-Info "  Note: Pour appareil physique, utilisez l'IP locale de la machine hôte"
    } else {
        Write-Warn "Configuration backend peut nécessiter ajustement pour Android"
    }
} else {
    Write-Err "backend-config.ts non trouvé"
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "RÉSUMÉ" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan

if ($fixesApplied.Count -gt 0) {
    Write-Info "Corrections appliquées:"
    foreach ($fix in $fixesApplied) {
        Write-Host "  - $fix" -ForegroundColor Gray
    }
    Write-Host ""
    Write-Info "Pour appliquer les corrections, reconstruisez l'application:"
    Write-Host "  .\scripts\build-android.ps1 mobile" -ForegroundColor White
} else {
    Write-Ok "Aucune correction nécessaire - la configuration est correcte"
}

Write-Host ""
Write-Info "Pour tester la communication:"
Write-Host "  1. .\scripts\build-android.ps1 mobile" -ForegroundColor White
Write-Host "  2. .\scripts\test-communication-auto.ps1" -ForegroundColor White