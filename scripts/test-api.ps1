# Script de test complet pour vérifier toutes les communications entre le client et le serveur
# Usage: .\scripts\test-api.ps1 [server_url] [email] [password]

param(
    [Parameter(Mandatory=$false)]
    [string]$ServerUrl = "http://10.1.0.86:4321",
    
    [Parameter(Mandatory=$false)]
    [string]$Email = "test@example.com",
    
    [Parameter(Mandatory=$false)]
    [string]$Password = "testpassword123",
    
    [Parameter(Mandatory=$false)]
    [string]$InviteCode = "TEST123"
)

$ErrorActionPreference = "Continue"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Test API Client-Serveur Popcorn" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Serveur: $ServerUrl" -ForegroundColor Yellow
Write-Host "Email: $Email" -ForegroundColor Yellow
Write-Host ""

$global:accessToken = $null
$global:refreshToken = $null
$global:userId = $null

function Test-Endpoint {
    param(
        [string]$Name,
        [string]$Method = "GET",
        [string]$Endpoint,
        [object]$Body = $null,
        [hashtable]$Headers = @{},
        [bool]$RequireAuth = $false
    )
    
    Write-Host "`n[TEST] $Name" -ForegroundColor Cyan
    Write-Host "  $Method $Endpoint" -ForegroundColor Gray
    
    $url = "$ServerUrl$Endpoint"
    $requestHeaders = @{
        "Content-Type" = "application/json"
    }
    
    if ($RequireAuth -and $global:accessToken) {
        $requestHeaders["Authorization"] = "Bearer $global:accessToken"
    }
    
    foreach ($key in $Headers.Keys) {
        $requestHeaders[$key] = $Headers[$key]
    }
    
    try {
        $params = @{
            Uri = $url
            Method = $Method
            Headers = $requestHeaders
            ErrorAction = "Stop"
        }
        
        if ($Body) {
            $params.Body = ($Body | ConvertTo-Json -Depth 10)
        }
        
        $response = Invoke-RestMethod @params
        $statusCode = 200
        
        Write-Host "  ✅ Succès (200)" -ForegroundColor Green
        if ($response) {
            $responseJson = $response | ConvertTo-Json -Depth 5 -Compress
            if ($responseJson.Length -gt 200) {
                Write-Host "  Réponse: $($responseJson.Substring(0, 200))..." -ForegroundColor Gray
            } else {
                Write-Host "  Réponse: $responseJson" -ForegroundColor Gray
            }
        }
        
        return @{ Success = $true; Data = $response; StatusCode = $statusCode }
    }
    catch {
        $statusCode = $_.Exception.Response.StatusCode.value__
        $errorMessage = $_.Exception.Message
        
        try {
            $errorStream = $_.Exception.Response.GetResponseStream()
            $reader = New-Object System.IO.StreamReader($errorStream)
            $errorBody = $reader.ReadToEnd()
            $errorJson = $errorBody | ConvertFrom-Json -ErrorAction SilentlyContinue
            if ($errorJson) {
                if ($errorJson.message) { $errorMessage = $errorJson.message }
                elseif ($errorJson.error) { $errorMessage = $errorJson.error }
                Write-Host "  Détails: $errorBody" -ForegroundColor DarkRed
            }
        } catch {
            # Ignore
        }
        
        Write-Host "  ❌ Erreur ($statusCode): $errorMessage" -ForegroundColor Red
        return @{ Success = $false; Error = $errorMessage; StatusCode = $statusCode; ErrorBody = $errorBody }
    }
}

# Test 0: Initialisation (optionnel)
Write-Host "`n========================================" -ForegroundColor Magenta
Write-Host "0. INITIALISATION" -ForegroundColor Magenta
Write-Host "========================================" -ForegroundColor Magenta
Write-Host "  💡 Pour créer un code d invitation, exécutez:" -ForegroundColor Cyan
Write-Host "     .\scripts\init-test-db.ps1 -InviteCode  $InviteCode " -ForegroundColor Gray
Write-Host ""

# Test 1: Health Check
Write-Host "`n========================================" -ForegroundColor Magenta
Write-Host "1. HEALTH CHECK" -ForegroundColor Magenta
Write-Host "========================================" -ForegroundColor Magenta
$healthResult = Test-Endpoint -Name "Health Check" -Endpoint "/api/v1/health"
if (-not $healthResult.Success) {
    Write-Host "`n❌ Le serveur n est pas accessible. Vérifiez l URL et que le serveur est démarré." -ForegroundColor Red
    exit 1
}

# Test 2: Register (si nécessaire)
Write-Host "`n========================================" -ForegroundColor Magenta
Write-Host "2. INSCRIPTION" -ForegroundColor Magenta
Write-Host "========================================" -ForegroundColor Magenta
$registerResult = Test-Endpoint -Name "Inscription" -Method "POST" -Endpoint "/api/v1/auth/register" -Body @{
    email = $Email
    password = $Password
    inviteCode = $InviteCode
}

if ($registerResult.Success -and $registerResult.Data.success) {
    Write-Host "  ✅ Compte créé avec succès" -ForegroundColor Green
    $global:accessToken = $registerResult.Data.data.accessToken
    $global:refreshToken = $registerResult.Data.data.refreshToken
    $global:userId = $registerResult.Data.data.user.id
    Write-Host "  Access Token: $($global:accessToken.Substring(0, 20))..." -ForegroundColor Gray
} else {
    if ($registerResult.StatusCode -eq 400) {
        if ($registerResult.Error -like "*déjà utilisé*" -or $registerResult.Error -like "*EmailExists*") {
            Write-Host "  ⚠️  Compte déjà existant, on continue avec la connexion..." -ForegroundColor Yellow
        } elseif ($registerResult.Error -like "*invitation*" -or $registerResult.Error -like "*InviteCode*") {
            Write-Host "  ⚠️  Code d invitation invalide: $($registerResult.Error)" -ForegroundColor Yellow
            Write-Host "  💡 Pour créer un code d invitation, utilisez l interface web du serveur" -ForegroundColor Cyan
            Write-Host "  💡 Ou créez-le directement dans la base de données SQLite" -ForegroundColor Cyan
        } else {
            Write-Host "  ⚠️  Échec de l inscription: $($registerResult.Error)" -ForegroundColor Yellow
        }
    } else {
        Write-Host "  ⚠️  Échec de l inscription: $($registerResult.Error)" -ForegroundColor Yellow
    }
}

# Test 3: Login
Write-Host "`n========================================" -ForegroundColor Magenta
Write-Host "3. CONNEXION" -ForegroundColor Magenta
Write-Host "========================================" -ForegroundColor Magenta
$loginResult = Test-Endpoint -Name "Connexion" -Method "POST" -Endpoint "/api/v1/auth/login" -Body @{
    email = $Email
    password = $Password
}

if ($loginResult.Success -and $loginResult.Data.success) {
    Write-Host "  ✅ Connexion réussie" -ForegroundColor Green
    $global:accessToken = $loginResult.Data.data.accessToken
    $global:refreshToken = $loginResult.Data.data.refreshToken
    $global:userId = $loginResult.Data.data.user.id
    Write-Host "  User ID: $global:userId" -ForegroundColor Gray
    Write-Host "  Access Token: $($global:accessToken.Substring(0, 20))..." -ForegroundColor Gray
} else {
    Write-Host "`n❌ ÉCHEC DE LA CONNEXION" -ForegroundColor Red
    Write-Host "  Erreur: $($loginResult.Error)" -ForegroundColor Red
    Write-Host "  Code: $($loginResult.StatusCode)" -ForegroundColor Red
    Write-Host "`nVérifiez que:" -ForegroundColor Yellow
    Write-Host "  1. l utilisateur existe dans la base de données" -ForegroundColor Yellow
    Write-Host "  2. Le mot de passe est correct" -ForegroundColor Yellow
    Write-Host "  3. La base de données est correctement configurée" -ForegroundColor Yellow
    exit 1
}

# Test 4: Get Me
Write-Host "`n========================================" -ForegroundColor Magenta
Write-Host "4. INFORMATIONS UTILISATEUR (/me)" -ForegroundColor Magenta
Write-Host "========================================" -ForegroundColor Magenta
$meResult = Test-Endpoint -Name "Get Me" -Endpoint "/api/v1/auth/me" -RequireAuth $true
if (-not $meResult.Success) {
    Write-Host "  ❌ Échec de récupération des informations utilisateur" -ForegroundColor Red
}

# Test 5: Refresh Token
Write-Host "`n========================================" -ForegroundColor Magenta
Write-Host "5. RAFRAÎCHISSEMENT DU TOKEN" -ForegroundColor Magenta
Write-Host "========================================" -ForegroundColor Magenta
if ($global:refreshToken) {
    $refreshResult = Test-Endpoint -Name "Refresh Token" -Method "POST" -Endpoint "/api/v1/auth/refresh" -Body @{
        refreshToken = $global:refreshToken
    }
    if ($refreshResult.Success -and $refreshResult.Data.success) {
        Write-Host "  ✅ Token rafraîchi avec succès" -ForegroundColor Green
        $global:accessToken = $refreshResult.Data.data.accessToken
        $global:refreshToken = $refreshResult.Data.data.refreshToken
    }
} else {
    Write-Host "  ⚠️  Pas de refresh token disponible" -ForegroundColor Yellow
}

# Test 6: Library
Write-Host "`n========================================" -ForegroundColor Magenta
Write-Host "6. BIBLIOTHÈQUE" -ForegroundColor Magenta
Write-Host "========================================" -ForegroundColor Magenta
$libraryResult = Test-Endpoint -Name "Get Library" -Endpoint "/api/v1/library" -RequireAuth $true
if ($libraryResult.Success) {
    $itemCount = if ($libraryResult.Data.data) { $libraryResult.Data.data.Count } else { 0 }
    Write-Host "  📚 $itemCount élément(s) dans la bibliothèque" -ForegroundColor Cyan
}

# Test 7: Favorites
Write-Host "`n========================================" -ForegroundColor Magenta
Write-Host "7. FAVORIS" -ForegroundColor Magenta
Write-Host "========================================" -ForegroundColor Magenta
$favoritesResult = Test-Endpoint -Name "Get Favorites" -Endpoint "/api/v1/favorites" -RequireAuth $true
if ($favoritesResult.Success) {
    $favCount = if ($favoritesResult.Data.data) { $favoritesResult.Data.data.Count } else { 0 }
    Write-Host "  ⭐ $favCount favori(s)" -ForegroundColor Cyan
}

# Test 8: Settings
Write-Host "`n========================================" -ForegroundColor Magenta
Write-Host "8. PARAMÈTRES" -ForegroundColor Magenta
Write-Host "========================================" -ForegroundColor Magenta
$settingsResult = Test-Endpoint -Name "Get Settings" -Endpoint "/api/v1/settings" -RequireAuth $true

# Test 9: Search
Write-Host "`n========================================" -ForegroundColor Magenta
Write-Host "9. RECHERCHE" -ForegroundColor Magenta
Write-Host "========================================" -ForegroundColor Magenta
$searchResult = Test-Endpoint -Name "Search" -Method "GET" -Endpoint "/api/v1/search?q=test" -RequireAuth $true
if ($searchResult.Success) {
    $resultCount = if ($searchResult.Data.data) { $searchResult.Data.data.Count } else { 0 }
    Write-Host "  [OK] $resultCount resultat(s) trouve(s)" -ForegroundColor Cyan
}

# Test 10: Indexers (si la route existe)
Write-Host "`n========================================" -ForegroundColor Magenta
Write-Host "10. INDEXERS" -ForegroundColor Magenta
Write-Host "========================================" -ForegroundColor Magenta
$indexersResult = Test-Endpoint -Name "Get Indexers" -Endpoint "/api/v1/indexers" -RequireAuth $true
if ($indexersResult.Success) {
    $indexerCount = if ($indexersResult.Data.data) { $indexersResult.Data.data.Count } else { 0 }
    Write-Host "  [OK] $indexerCount indexer(s) configure(s)" -ForegroundColor Cyan
} elseif ($indexersResult.StatusCode -eq 404) {
    Write-Host "  [INFO] Route /api/v1/indexers non trouvee (peut-etre pas encore implementee)" -ForegroundColor Yellow
}

# Résumé
Write-Host "`n========================================" -ForegroundColor Green
Write-Host "RESUME DES TESTS" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "[OK] Tests termines" -ForegroundColor Green
Write-Host ""

if ($global:accessToken) {
    Write-Host "Tokens stockes:" -ForegroundColor Cyan
    Write-Host "  Access Token: $($global:accessToken.Substring(0, 30))..." -ForegroundColor Gray
    if ($global:refreshToken) {
        Write-Host "  Refresh Token: $($global:refreshToken.Substring(0, 30))..." -ForegroundColor Gray
    }
    Write-Host ""
    Write-Host "Pour tester manuellement:" -ForegroundColor Yellow
    Write-Host "  curl -H  Authorization: Bearer $global:accessToken  $ServerUrl/api/v1/auth/me" -ForegroundColor Gray
} else {
    Write-Host "[WARNING] Aucun token d acces disponible" -ForegroundColor Yellow
    Write-Host "  La connexion a echoue. Verifiez:" -ForegroundColor Yellow
    Write-Host "  1. Que l utilisateur existe dans la base de donnees" -ForegroundColor Gray
    Write-Host "  2. Que le mot de passe est correct" -ForegroundColor Gray
    Write-Host "  3. Qu un code d invitation valide existe pour l inscription" -ForegroundColor Gray
}

Write-Host ""
Write-Host "Routes API testees:" -ForegroundColor Cyan
Write-Host "  - GET  /api/v1/health" -ForegroundColor Gray
Write-Host "  - POST /api/v1/auth/register" -ForegroundColor Gray
Write-Host "  - POST /api/v1/auth/login" -ForegroundColor Gray
Write-Host "  - GET  /api/v1/auth/me" -ForegroundColor Gray
Write-Host "  - POST /api/v1/auth/refresh" -ForegroundColor Gray
Write-Host "  - GET  /api/v1/library" -ForegroundColor Gray
Write-Host "  - GET  /api/v1/favorites" -ForegroundColor Gray
Write-Host "  - GET  /api/v1/settings" -ForegroundColor Gray
Write-Host "  - GET  /api/v1/search" -ForegroundColor Gray
Write-Host "  - GET  /api/v1/indexers" -ForegroundColor Gray
Write-Host ""
