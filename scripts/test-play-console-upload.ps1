# Script de test pour vérifier les prérequis avant l'upload vers Play Console
# Utilise l'API Google Play Developer pour vérifier l'existence de l'application, les permissions, etc.

param(
    [Parameter(Mandatory=$true)]
    [string]$AabPath,
    
    [Parameter(Mandatory=$true)]
    [string]$ServiceAccountJson,
    
    [Parameter(Mandatory=$false)]
    [string]$PackageName = "com.popcorn.client.mobile"
)

$ErrorActionPreference = "Stop"

Write-Host "🔍 Test des prérequis pour l'upload vers Google Play Console" -ForegroundColor Cyan
Write-Host ""

# Vérifier que l'AAB existe
if (-not (Test-Path $AabPath)) {
    Write-Host "❌ ERREUR: Le fichier AAB n'existe pas: $AabPath" -ForegroundColor Red
    exit 1
}

Write-Host "✅ AAB trouvé: $AabPath" -ForegroundColor Green

# Écrire le service account JSON dans un fichier temporaire
$jsonFile = New-TemporaryFile
$jsonFile = Rename-Item -Path $jsonFile -NewName "$($jsonFile.Name).json" -PassThru
$ServiceAccountJson | Out-File -FilePath $jsonFile.FullName -Encoding utf8

try {
    # Extraire les informations du service account
    $serviceAccount = Get-Content $jsonFile.FullName | ConvertFrom-Json
    $projectId = $serviceAccount.project_id
    $clientEmail = $serviceAccount.client_email
    
    Write-Host "📋 Service Account:" -ForegroundColor Cyan
    Write-Host "   Project ID: $projectId"
    Write-Host "   Email: $clientEmail"
    Write-Host ""
    
    # Installer/Importer les modules nécessaires
    Write-Host "📦 Vérification des dépendances..." -ForegroundColor Cyan
    
    # Vérifier si gcloud est installé (optionnel, on peut utiliser l'API directement)
    $hasGcloud = Get-Command gcloud -ErrorAction SilentlyContinue
    if ($hasGcloud) {
        Write-Host "✅ gcloud CLI trouvé" -ForegroundColor Green
    } else {
        Write-Host "⚠️ gcloud CLI non trouvé (optionnel)" -ForegroundColor Yellow
    }
    
    # Vérifier si Python est disponible pour utiliser l'API Google Play
    $hasPython = Get-Command python -ErrorAction SilentlyContinue
    if (-not $hasPython) {
        $hasPython = Get-Command python3 -ErrorAction SilentlyContinue
    }
    
    if ($hasPython) {
        Write-Host "✅ Python trouvé" -ForegroundColor Green
        Write-Host ""
        Write-Host "🔍 Test de l'accès à l'API Google Play..." -ForegroundColor Cyan
        
        # Créer un script Python temporaire pour tester l'API
        $pythonScript = @"
import json
import sys
from pathlib import Path

try:
    from google.oauth2 import service_account
    from googleapiclient.discovery import build
    from googleapiclient.errors import HttpError
except ImportError:
    print("❌ ERREUR: Modules Google API non installés")
    print("   Installez avec: pip install google-auth google-auth-oauthlib google-auth-httplib2 google-api-python-client")
    sys.exit(1)

# Charger le service account
json_file = Path(r"$($jsonFile.FullName)")
package_name = "$PackageName"

try:
    credentials = service_account.Credentials.from_service_account_file(
        str(json_file),
        scopes=['https://www.googleapis.com/auth/androidpublisher']
    )
    
    service = build('androidpublisher', 'v3', credentials=credentials)
    
    # Test 1: Vérifier si l'application existe
    print("🔍 Vérification de l'existence de l'application...")
    try:
        app = service.edits().insert(packageName=package_name).execute()
        edit_id = app['id']
        print(f"✅ Application trouvée: {package_name}")
        print(f"   Edit ID créé: {edit_id}")
        
        # Nettoyer l'edit de test
        service.edits().delete(packageName=package_name, editId=edit_id).execute()
        
    except HttpError as e:
        if e.resp.status == 404:
            print(f"❌ ERREUR: L'application '{package_name}' n'existe pas dans Play Console")
            print("   SOLUTION: Créez d'abord l'application dans Play Console:")
            print(f"   → https://play.google.com/console")
            print(f"   → Créer une application avec le package: {package_name}")
            sys.exit(1)
        elif e.resp.status == 403:
            print(f"❌ ERREUR: Permissions insuffisantes pour le service account")
            print(f"   Service Account: {credentials.service_account_email}")
            print("   SOLUTION: Ajoutez le service account dans Play Console:")
            print("   → Paramètres → Accès et autorisations → Utilisateurs et autorisations")
            print("   → Permission: 'Gérer les versions de test (bêta, alpha, interne)'")
            sys.exit(1)
        else:
            print(f"❌ ERREUR API: {e}")
            sys.exit(1)
    
    # Test 2: Vérifier les versions existantes
    print("")
    print("🔍 Vérification des versions existantes...")
    try:
        tracks = service.edits().tracks().list(
            packageName=package_name,
            editId=service.edits().insert(packageName=package_name).execute()['id']
        ).execute()
        
        edit_id = service.edits().insert(packageName=package_name).execute()['id']
        
        # Vérifier le track "internal"
        try:
            internal_track = service.edits().tracks().get(
                packageName=package_name,
                editId=edit_id,
                track='internal'
            ).execute()
            
            if 'releases' in internal_track and len(internal_track['releases']) > 0:
                latest_release = internal_track['releases'][0]
                if 'versionCodes' in latest_release:
                    version_codes = latest_release['versionCodes']
                    print(f"   Versions existantes dans 'internal': {version_codes}")
                else:
                    print("   Aucune version dans le track 'internal'")
            else:
                print("   Aucune version dans le track 'internal'")
        except HttpError:
            print("   Track 'internal' n'existe pas encore (normal pour une nouvelle app)")
        
        # Nettoyer l'edit de test
        service.edits().delete(packageName=package_name, editId=edit_id).execute()
        
    except HttpError as e:
        print(f"⚠️ Impossible de vérifier les versions: {e}")
    
    print("")
    print("✅ Tous les tests de prérequis sont passés!")
    print("   L'application existe et les permissions sont correctes.")
    print("   Vous pouvez procéder à l'upload.")
    
except Exception as e:
    print(f"❌ ERREUR: {e}")
    import traceback
    traceback.print_exc()
    sys.exit(1)
"@
        
        $pythonScriptFile = New-TemporaryFile
        $pythonScriptFile = Rename-Item -Path $pythonScriptFile -NewName "$($pythonScriptFile.Name).py" -PassThru
        $pythonScript | Out-File -FilePath $pythonScriptFile.FullName -Encoding utf8
        
        try {
            $pythonCmd = if (Get-Command python -ErrorAction SilentlyContinue) { "python" } else { "python3" }
            & $pythonCmd $pythonScriptFile.FullName
            
            if ($LASTEXITCODE -ne 0) {
                Write-Host ""
                Write-Host "❌ Les tests ont échoué. Corrigez les problèmes avant de relancer le workflow." -ForegroundColor Red
                exit 1
            }
        } finally {
            Remove-Item $pythonScriptFile.FullName -ErrorAction SilentlyContinue
        }
    } else {
        Write-Host "⚠️ Python non trouvé, tests API non disponibles" -ForegroundColor Yellow
        Write-Host "   Installez Python pour activer les tests complets"
        Write-Host ""
        Write-Host "📋 Vérifications manuelles à faire:" -ForegroundColor Cyan
        Write-Host "   1. Vérifiez que l'application existe: https://play.google.com/console"
        Write-Host "   2. Vérifiez les permissions du service account"
        Write-Host "   3. Vérifiez les versions existantes"
    }
    
} finally {
    Remove-Item $jsonFile.FullName -ErrorAction SilentlyContinue
}

Write-Host ""
Write-Host "✅ Tests terminés" -ForegroundColor Green
