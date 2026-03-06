# Fonctions utilitaires communes pour les scripts Android
# Importé par tous les scripts Android via: . "$PSScriptRoot\..\_common\functions.ps1"

# Fonctions de logging standardisées
function Write-Info { 
    param([string]$Message) 
    Write-Host "[INFO] $Message" -ForegroundColor Cyan 
}

function Write-Ok { 
    param([string]$Message) 
    Write-Host "[OK] $Message" -ForegroundColor Green 
}

function Write-Err { 
    param([string]$Message) 
    Write-Host "[ERREUR] $Message" -ForegroundColor Red 
}

function Write-Warn { 
    param([string]$Message) 
    Write-Host "[WARN] $Message" -ForegroundColor Yellow 
}

function Write-Section {
    param([string]$Title)
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host $Title -ForegroundColor Cyan
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host ""
}

# Fonction pour vérifier si une commande existe
function Test-Command {
    param([string]$Command)
    $null -ne (Get-Command $Command -ErrorAction SilentlyContinue)
}

# Fonction pour obtenir le chemin de configuration Tauri selon la variante
function Get-TauriConfigPath {
    param([string]$Variant)
    
    . "$PSScriptRoot\variables.ps1"
    
    if ($script:TauriConfigPaths.ContainsKey($Variant)) {
        return $script:TauriConfigPaths[$Variant]
    }
    return $script:TauriConfigPaths["standard"]
}

# Fonction pour obtenir le package ID selon la variante
function Get-PackageId {
    param([string]$Variant)
    
    . "$PSScriptRoot\variables.ps1"
    
    if ($script:PackageIds.ContainsKey($Variant)) {
        return $script:PackageIds[$Variant]
    }
    return $script:PackageIds["standard"]
}

# Fonction pour vérifier qu'un appareil Android est connecté
function Test-AndroidDevice {
    . "$PSScriptRoot\variables.ps1"
    
    if (-not (Test-Path $script:AdbPath)) {
        Write-Err "ADB non trouvé: $script:AdbPath"
        return $false
    }
    
    $devices = & $script:AdbPath devices 2>&1 | Select-String "device$"
    if (-not $devices) {
        Write-Err "Aucun appareil Android connecté"
        return $false
    }
    
    return $true
}

# Fonction pour trouver le dernier APK généré
function Get-LatestApk {
    param([string]$Variant = "mobile")
    
    . "$PSScriptRoot\variables.ps1"
    
    $pattern = switch ($Variant) {
        "mobile" { "Popcorn_Mobile-v*.apk" }
        "tv" { "Popcorn_TV-v*.apk" }
        default { "Popcorn*.apk" }
    }
    
    $apk = Get-ChildItem "$script:ApkDestPath\$pattern" -ErrorAction SilentlyContinue | 
        Sort-Object LastWriteTime -Descending | Select-Object -First 1
    
    return $apk
}

# Fonction pour nettoyer un nom de fichier (sécurisation Windows)
function Sanitize-FileName {
    param([string]$Name)
    if (-not $Name) { return "popcorn" }
    return ($Name -replace '[^a-zA-Z0-9._-]', '_')
}