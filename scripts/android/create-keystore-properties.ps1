# Script pour créer le fichier keystore.properties
# Usage: .\scripts\android\create-keystore-properties.ps1

param(
    [string]$KeystorePath = "src-tauri\gen\android\keystore.jks",
    [string]$KeyAlias = "popcorn-key",
    [string]$StorePassword = "",
    [string]$KeyPassword = ""
)

$scriptRoot = Split-Path -Parent $PSScriptRoot
$projectRoot = Split-Path -Parent $scriptRoot

# Convertir le chemin relatif en chemin absolu
if (-not [System.IO.Path]::IsPathRooted($KeystorePath)) {
    $KeystorePath = Join-Path $projectRoot $KeystorePath
}

$propertiesPath = Join-Path (Split-Path -Parent $KeystorePath) "keystore.properties"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Création du fichier keystore.properties" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Vérifier si le keystore existe
if (-not (Test-Path $KeystorePath)) {
    Write-Host "[ERREUR] Le keystore n'existe pas: $KeystorePath" -ForegroundColor Red
    Write-Host "Créez d'abord le keystore avec: .\scripts\android\create-keystore.ps1" -ForegroundColor Yellow
    exit 1
}

# Demander les mots de passe si non fournis
if ([string]::IsNullOrEmpty($StorePassword)) {
    try {
        $securePassword = Read-Host "Entrez le mot de passe du keystore" -AsSecureString
        if ($securePassword) {
            $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
            $StorePassword = [Runtime.InteropServices.Marshal]::PtrToStringAuto($bstr)
            [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
        }
    } catch {
        Write-Host "[ERREUR] Mode non-interactif. Utilisez: -StorePassword 'mot_de_passe' -KeyPassword 'mot_de_passe'" -ForegroundColor Red
        exit 1
    }
}

if ([string]::IsNullOrEmpty($KeyPassword)) {
    try {
        $keyPasswordInput = Read-Host "Entrez le mot de passe de la clé (laissez vide pour utiliser le même que le keystore)"
        if ([string]::IsNullOrEmpty($keyPasswordInput)) {
            $KeyPassword = $StorePassword
        } else {
            $KeyPassword = $keyPasswordInput
        }
    } catch {
        $KeyPassword = $StorePassword
    }
}

# Vérifier que les mots de passe sont définis
if ([string]::IsNullOrEmpty($StorePassword) -or [string]::IsNullOrEmpty($KeyPassword)) {
    Write-Host "[ERREUR] Les mots de passe sont requis" -ForegroundColor Red
    exit 1
}

# Obtenir le nom relatif du keystore
$keystoreDir = Split-Path -Parent $KeystorePath
$keystoreFileName = Split-Path -Leaf $KeystorePath
$relativeKeystorePath = if ($keystoreDir -eq (Split-Path -Parent $propertiesPath)) {
    $keystoreFileName
} else {
    $KeystorePath
}

# Créer le contenu du fichier
$propertiesContent = @"
# Configuration du keystore pour la signature de l'APK
# ⚠️ NE COMMITEZ JAMAIS CE FICHIER (déjà dans .gitignore)

# Chemin relatif au fichier build.gradle.kts
storeFile=$keystoreFileName

# Mot de passe du keystore
storePassword=$StorePassword

# Alias de la clé
keyAlias=$KeyAlias

# Mot de passe de la clé
keyPassword=$KeyPassword
"@

# Écrire le fichier
try {
    Set-Content -Path $propertiesPath -Value $propertiesContent -Encoding UTF8
    Write-Host "[OK] Fichier keystore.properties créé: $propertiesPath" -ForegroundColor Green
    Write-Host ""
    Write-Host "Le fichier contient vos mots de passe. Assurez-vous qu'il n'est pas commité !" -ForegroundColor Yellow
    Write-Host "(Il est déjà dans .gitignore)" -ForegroundColor Gray
} catch {
    Write-Host "[ERREUR] Impossible de créer le fichier: $_" -ForegroundColor Red
    exit 1
}
