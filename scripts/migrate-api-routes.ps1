# Script pour migrer toutes les routes API du backend vers le client
# Usage: .\scripts\migrate-api-routes.ps1

$serverApiPath = "..\popcorn-server\src\pages\api"
$clientApiPath = "src\pages\api"

Write-Host "🚀 Migration des routes API du backend vers le client..." -ForegroundColor Cyan

# Fonction pour copier un fichier en adaptant les imports
function Copy-ApiFile {
    param(
        [string]$SourceFile,
        [string]$DestFile
    )
    
    $content = Get-Content $SourceFile -Raw
    
    # Adapter les imports relatifs
    # De: ../../../lib/... vers: ../../../../lib/... (car on est dans api/v1/...)
    $content = $content -replace 'from ''\.\.\/\.\.\/\.\.\/lib\/', 'from ''../../../../lib/'
    $content = $content -replace 'from ''\.\.\/\.\.\/\.\.\/\.\.\/lib\/', 'from ''../../../../../lib/'
    
    # Créer le répertoire de destination si nécessaire
    $destDir = Split-Path $DestFile -Parent
    if (-not (Test-Path $destDir)) {
        New-Item -ItemType Directory -Path $destDir -Force | Out-Null
    }
    
    # Écrire le fichier
    Set-Content -Path $DestFile -Value $content -Encoding UTF8
    Write-Host "✅ Copié: $DestFile" -ForegroundColor Green
}

# Migrer les routes v1
Write-Host "`n📦 Migration des routes /api/v1/*..." -ForegroundColor Yellow
$v1Routes = Get-ChildItem -Path "$serverApiPath\v1" -Recurse -Filter "*.ts"
foreach ($route in $v1Routes) {
    $relativePath = $route.FullName.Substring($serverApiPath.Length + 4) # +4 pour "v1\"
    $destPath = Join-Path $clientApiPath "v1\$relativePath"
    Copy-ApiFile -SourceFile $route.FullName -DestFile $destPath
}

# Migrer les routes torrents
Write-Host "`n📦 Migration des routes /api/torrents/*..." -ForegroundColor Yellow
$torrentRoutes = Get-ChildItem -Path "$serverApiPath\torrents" -Recurse -Filter "*.ts"
foreach ($route in $torrentRoutes) {
    $relativePath = $route.FullName.Substring($serverApiPath.Length + 10) # +10 pour "torrents\"
    $destPath = Join-Path $clientApiPath "torrents\$relativePath"
    Copy-ApiFile -SourceFile $route.FullName -DestFile $destPath
}

# Migrer les routes admin
Write-Host "`n📦 Migration des routes /api/admin/*..." -ForegroundColor Yellow
$adminRoutes = Get-ChildItem -Path "$serverApiPath\admin" -Recurse -Filter "*.ts"
foreach ($route in $adminRoutes) {
    $relativePath = $route.FullName.Substring($serverApiPath.Length + 6) # +6 pour "admin\"
    $destPath = Join-Path $clientApiPath "admin\$relativePath"
    Copy-ApiFile -SourceFile $route.FullName -DestFile $destPath
}

# Migrer les autres routes importantes
Write-Host "`n📦 Migration des autres routes..." -ForegroundColor Yellow
$otherRoutes = @(
    "account", "cloud", "debug", "init", "invites", 
    "jackett", "local", "media", "ratio", "settings", 
    "setup", "stream", "sync", "tracker"
)

foreach ($routeType in $otherRoutes) {
    $routePath = Join-Path $serverApiPath $routeType
    if (Test-Path $routePath) {
        $routes = Get-ChildItem -Path $routePath -Recurse -Filter "*.ts"
        foreach ($route in $routes) {
            $relativePath = $route.FullName.Substring($serverApiPath.Length + $routeType.Length + 1)
            $destPath = Join-Path $clientApiPath "$routeType\$relativePath"
            Copy-ApiFile -SourceFile $route.FullName -DestFile $destPath
        }
    }
}

Write-Host "`n✅ Migration terminée!" -ForegroundColor Green
Write-Host "⚠️  N'oubliez pas de:" -ForegroundColor Yellow
Write-Host "   1. Vérifier et adapter les imports si nécessaire" -ForegroundColor Yellow
Write-Host "   2. Copier les librairies manquantes (lib/db, lib/auth, etc.)" -ForegroundColor Yellow
Write-Host "   3. Tester les routes migrées" -ForegroundColor Yellow
