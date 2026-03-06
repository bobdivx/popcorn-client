# Script pour lancer le test Play Console localement
# Guide l'utilisateur à travers les étapes nécessaires

param(
    [Parameter(Mandatory=$false)]
    [string]$AabPath = "",
    
    [Parameter(Mandatory=$false)]
    [string]$ServiceAccountJsonPath = "",
    
    [Parameter(Mandatory=$false)]
    [string]$PackageName = "com.popcorn.client.mobile"
)

Write-Host "🔍 Test des prérequis Play Console - Configuration" -ForegroundColor Cyan
Write-Host ""

# Vérifier Python
$pythonCmd = $null
if (Get-Command python -ErrorAction SilentlyContinue) {
    $pythonCmd = "python"
} elseif (Get-Command python3 -ErrorAction SilentlyContinue) {
    $pythonCmd = "python3"
} else {
    Write-Host "❌ Python n'est pas installé ou pas dans le PATH" -ForegroundColor Red
    Write-Host ""
    Write-Host "📦 Installation de Python:" -ForegroundColor Yellow
    Write-Host "   1. Téléchargez Python depuis: https://www.python.org/downloads/"
    Write-Host "   2. Cochez 'Add Python to PATH' lors de l'installation"
    Write-Host "   3. Redémarrez PowerShell après l'installation"
    Write-Host ""
    Write-Host "   Ou installez via Microsoft Store:"
    Write-Host "   → Ouvrez Microsoft Store"
    Write-Host "   → Recherchez 'Python 3.11' ou 'Python 3.12'"
    Write-Host "   → Installez"
    Write-Host ""
    exit 1
}

Write-Host "✅ Python trouvé: $pythonCmd" -ForegroundColor Green
$pythonVersion = & $pythonCmd --version
Write-Host "   Version: $pythonVersion"
Write-Host ""

# Vérifier les dépendances Python
Write-Host "📦 Vérification des dépendances Python..." -ForegroundColor Cyan
$hasGoogleAuth = & $pythonCmd -c "import google.auth" 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "⚠️  Modules Google API non installés" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "📥 Installation des dépendances..." -ForegroundColor Cyan
    & $pythonCmd -m pip install --user google-auth google-auth-oauthlib google-auth-httplib2 google-api-python-client
    
    if ($LASTEXITCODE -ne 0) {
        Write-Host "❌ Erreur lors de l'installation des dépendances" -ForegroundColor Red
        Write-Host "   Essayez manuellement: pip install google-auth google-auth-oauthlib google-auth-httplib2 google-api-python-client"
        exit 1
    }
    Write-Host "✅ Dépendances installées" -ForegroundColor Green
} else {
    Write-Host "✅ Dépendances Python déjà installées" -ForegroundColor Green
}
Write-Host ""

# Demander le chemin de l'AAB si non fourni
if ([string]::IsNullOrWhiteSpace($AabPath)) {
    Write-Host "📦 Chemin vers le fichier AAB:" -ForegroundColor Cyan
    Write-Host "   Exemple: .\artifacts\Popcorn-v1.0.66.aab"
    Write-Host "   Ou: C:\path\to\your\app.aab"
    Write-Host ""
    $AabPath = Read-Host "Entrez le chemin vers le fichier AAB"
}

if (-not (Test-Path $AabPath)) {
    Write-Host "❌ ERREUR: Le fichier AAB n'existe pas: $AabPath" -ForegroundColor Red
    Write-Host ""
    Write-Host "💡 Vous devez d'abord construire l'AAB:" -ForegroundColor Yellow
    Write-Host "   - Via le workflow GitHub Actions"
    Write-Host "   - Ou localement avec: npm run build:android:aab"
    Write-Host ""
    exit 1
}

Write-Host "✅ AAB trouvé: $AabPath" -ForegroundColor Green
Write-Host ""

# Demander le service account JSON si non fourni
if ([string]::IsNullOrWhiteSpace($ServiceAccountJsonPath)) {
    Write-Host "🔑 Service Account JSON:" -ForegroundColor Cyan
    Write-Host "   Option 1: Chemin vers un fichier JSON"
    Write-Host "   Option 2: Coller le JSON directement (sera sauvegardé temporairement)"
    Write-Host ""
    $choice = Read-Host "Fichier (f) ou JSON direct (j)? [f/j]"
    
    if ($choice -eq "j" -or $choice -eq "J") {
        Write-Host ""
        Write-Host "📋 Collez le JSON du service account (appuyez sur Entrée après avoir collé tout le JSON):" -ForegroundColor Yellow
        $jsonContent = ""
        $line = ""
        do {
            $line = Read-Host
            if ($line) {
                $jsonContent += $line + "`n"
            }
        } while ($line -ne "")
        
        $ServiceAccountJsonPath = [System.IO.Path]::GetTempFileName() + ".json"
        $jsonContent | Out-File -FilePath $ServiceAccountJsonPath -Encoding utf8
        Write-Host "✅ JSON sauvegardé temporairement" -ForegroundColor Green
    } else {
        $ServiceAccountJsonPath = Read-Host "Entrez le chemin vers le fichier JSON"
    }
}

# Vérifier le service account JSON
if (-not (Test-Path $ServiceAccountJsonPath)) {
    Write-Host "❌ ERREUR: Le fichier JSON n'existe pas: $ServiceAccountJsonPath" -ForegroundColor Red
    exit 1
}

try {
    $jsonContent = Get-Content $ServiceAccountJsonPath -Raw | ConvertFrom-Json
    if (-not $jsonContent.project_id) {
        throw "JSON invalide"
    }
    Write-Host "✅ Service Account JSON valide" -ForegroundColor Green
    Write-Host "   Project ID: $($jsonContent.project_id)"
    Write-Host "   Email: $($jsonContent.client_email)"
} catch {
    Write-Host "❌ ERREUR: Le fichier JSON n'est pas valide" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "🚀 Lancement du test..." -ForegroundColor Cyan
Write-Host ""

# Lire le contenu JSON
$serviceAccountJson = Get-Content $ServiceAccountJsonPath -Raw

# Exécuter le script de test
if (Test-Path "scripts\test-play-console-upload.ps1") {
    & .\scripts\test-play-console-upload.ps1 `
        -AabPath $AabPath `
        -ServiceAccountJson $serviceAccountJson `
        -PackageName $PackageName
} else {
    Write-Host "❌ Script de test non trouvé: scripts\test-play-console-upload.ps1" -ForegroundColor Red
    exit 1
}

# Nettoyer le fichier temporaire si créé
if ($ServiceAccountJsonPath -match "Temp") {
    Remove-Item $ServiceAccountJsonPath -ErrorAction SilentlyContinue
}
