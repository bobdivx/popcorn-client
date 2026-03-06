# Script pour créer un keystore pour signer l'APK Android
# Usage: .\scripts\android\create-keystore.ps1

param(
    [string]$KeystorePath = "src-tauri\gen\android\keystore.jks",
    [string]$KeyAlias = "popcorn-key",
    [string]$StorePassword = "",
    [string]$KeyPassword = "",
    [int]$ValidityYears = 25
)

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Création du keystore pour signature APK" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Déterminer le répertoire du projet
$scriptRoot = Split-Path -Parent $PSScriptRoot
$projectRoot = Split-Path -Parent $scriptRoot
$commonPath = Join-Path $scriptRoot "_common"

# Importer les fonctions communes pour détecter Java
if (Test-Path (Join-Path $commonPath "variables.ps1")) {
    . (Join-Path $commonPath "variables.ps1")
} else {
    # Fallback si les variables communes ne sont pas disponibles
    $script:JavaHome = $env:JAVA_HOME
    if (-not $script:JavaHome -and (Test-Path "D:\Android Studio\jbr")) {
        $script:JavaHome = "D:\Android Studio\jbr"
    }
}

# Convertir le chemin relatif en chemin absolu
if (-not [System.IO.Path]::IsPathRooted($KeystorePath)) {
    $KeystorePath = Join-Path $projectRoot $KeystorePath
}

# Trouver keytool
$keytoolPath = $null

# Essayer depuis JAVA_HOME
if ($env:JAVA_HOME -and (Test-Path $env:JAVA_HOME)) {
    $keytoolCandidate = Join-Path $env:JAVA_HOME "bin\keytool.exe"
    if (Test-Path $keytoolCandidate) {
        $keytoolPath = $keytoolCandidate
    }
}

# Essayer depuis les variables communes (Android Studio)
if (-not $keytoolPath -and $script:JavaHome) {
    $keytoolCandidate = Join-Path $script:JavaHome "bin\keytool.exe"
    if (Test-Path $keytoolCandidate) {
        $keytoolPath = $keytoolCandidate
    }
}

# Essayer depuis le PATH
if (-not $keytoolPath) {
    $keytoolCmd = Get-Command keytool -ErrorAction SilentlyContinue
    if ($keytoolCmd) {
        $keytoolPath = $keytoolCmd.Path
    }
}

if (-not $keytoolPath) {
    Write-Host "[ERREUR] keytool n'est pas trouvé" -ForegroundColor Red
    Write-Host "Assurez-vous que Java est installé et que JAVA_HOME est configuré" -ForegroundColor Yellow
    Write-Host "Ou installez Android Studio qui inclut Java" -ForegroundColor Yellow
    exit 1
}

Write-Host "[INFO] keytool trouvé: $keytoolPath" -ForegroundColor Green

# Vérifier si le keystore existe déjà
if (Test-Path $KeystorePath) {
    Write-Host "[INFO] Le keystore existe déjà: $KeystorePath" -ForegroundColor Yellow
    $overwrite = Read-Host "Voulez-vous le remplacer? (o/N)"
    if ($overwrite -ne "o" -and $overwrite -ne "O") {
        Write-Host "[INFO] Opération annulée" -ForegroundColor Yellow
        exit 0
    }
    Remove-Item $KeystorePath -Force
}

# Demander les mots de passe si non fournis
if ([string]::IsNullOrEmpty($StorePassword)) {
    # Vérifier si on est en mode interactif
    try {
        $securePassword = Read-Host "Entrez le mot de passe du keystore" -AsSecureString
        if ($securePassword) {
            $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)
            $StorePassword = [Runtime.InteropServices.Marshal]::PtrToStringAuto($bstr)
            [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)
        }
    } catch {
        Write-Host "[ERREUR] Mode non-interactif détecté. Utilisez les paramètres -StorePassword et -KeyPassword" -ForegroundColor Red
        Write-Host "Exemple: .\create-keystore.ps1 -StorePassword 'mon_mot_de_passe' -KeyPassword 'mon_mot_de_passe'" -ForegroundColor Yellow
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
        # En mode non-interactif, utiliser le même mot de passe que le keystore
        $KeyPassword = $StorePassword
    }
}

# Vérifier que les mots de passe sont définis
if ([string]::IsNullOrEmpty($StorePassword) -or [string]::IsNullOrEmpty($KeyPassword)) {
    Write-Host "[ERREUR] Les mots de passe sont requis" -ForegroundColor Red
    Write-Host "Utilisez: .\create-keystore.ps1 -StorePassword 'mot_de_passe' -KeyPassword 'mot_de_passe'" -ForegroundColor Yellow
    exit 1
}

# Créer le répertoire si nécessaire
$keystoreDir = Split-Path -Parent $KeystorePath
if (-not (Test-Path $keystoreDir)) {
    New-Item -ItemType Directory -Path $keystoreDir -Force | Out-Null
}

# Créer le keystore
Write-Host "[INFO] Création du keystore..." -ForegroundColor Cyan
$validityDays = $ValidityYears * 365

$keytoolArgs = @(
    "-genkey",
    "-v",
    "-keystore", $KeystorePath,
    "-alias", $KeyAlias,
    "-keyalg", "RSA",
    "-keysize", "2048",
    "-validity", $validityDays.ToString(),
    "-storepass", $StorePassword,
    "-keypass", $KeyPassword,
    "-dname", "CN=Popcorn Client, OU=Development, O=Popcorn, L=Unknown, ST=Unknown, C=FR"
)

try {
    & $keytoolPath $keytoolArgs
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "[OK] Keystore créé avec succès: $KeystorePath" -ForegroundColor Green
        Write-Host ""
        Write-Host "Informations du keystore:" -ForegroundColor Cyan
        Write-Host "  - Chemin: $KeystorePath" -ForegroundColor White
        Write-Host "  - Alias: $KeyAlias" -ForegroundColor White
        Write-Host "  - Validité: $ValidityYears ans" -ForegroundColor White
        Write-Host ""
        Write-Host "Prochaines étapes:" -ForegroundColor Cyan
        Write-Host "1. Créez le fichier src-tauri\gen\android\keystore.properties avec:" -ForegroundColor Yellow
        Write-Host "   storeFile=keystore.jks" -ForegroundColor Gray
        Write-Host "   storePassword=VOTRE_MOT_DE_PASSE" -ForegroundColor Gray
        Write-Host "   keyAlias=$KeyAlias" -ForegroundColor Gray
        Write-Host "   keyPassword=VOTRE_MOT_DE_PASSE" -ForegroundColor Gray
        Write-Host ""
        Write-Host "2. OU définissez les variables d'environnement:" -ForegroundColor Yellow
        Write-Host "   ANDROID_KEYSTORE_PATH=$KeystorePath" -ForegroundColor Gray
        Write-Host "   ANDROID_KEYSTORE_PASSWORD=VOTRE_MOT_DE_PASSE" -ForegroundColor Gray
        Write-Host "   ANDROID_KEY_ALIAS=$KeyAlias" -ForegroundColor Gray
        Write-Host "   ANDROID_KEY_PASSWORD=VOTRE_MOT_DE_PASSE" -ForegroundColor Gray
    } else {
        Write-Host "[ERREUR] Échec de la création du keystore" -ForegroundColor Red
        exit 1
    }
} catch {
    Write-Host "[ERREUR] Erreur lors de la création du keystore: $_" -ForegroundColor Red
    exit 1
}
