# Gestion centralisée des versions pour client et serveur
# Format: X.Y.Z (ex: 1.0.1)

# Trouver la racine du projet (où se trouve VERSION.json)
# Le script est dans scripts/, donc VERSION.json est à la racine (un niveau au-dessus)
$scriptDir = if ($PSScriptRoot) { $PSScriptRoot } else { Split-Path -Parent $MyInvocation.MyCommand.Path }
$projectRoot = Split-Path $scriptDir -Parent
$VERSION_FILE = Join-Path $projectRoot "VERSION.json"

function Get-VersionInfo {
    param(
        [Parameter(Mandatory=$false)][string]$Component = "client"
    )
    
    if (-not (Test-Path $VERSION_FILE)) {
        Write-Host "  [WARN] Fichier VERSION.json introuvable, création avec version par défaut" -ForegroundColor Yellow
        $defaultVersion = @{
            client = @{
                version = "1.0.1"
                build = 1
            }
            server = @{
                version = "1.0.1"
                build = 1
            }
        } | ConvertTo-Json -Depth 3
        Set-Content -Path $VERSION_FILE -Value $defaultVersion -Encoding UTF8
    }
    
    try {
        $content = Get-Content $VERSION_FILE -Raw | ConvertFrom-Json
        if ($Component -eq "client") {
            return @{
                Version = $content.client.version
                Build = $content.client.build
            }
        } elseif ($Component -eq "server") {
            return @{
                Version = $content.server.version
                Build = $content.server.build
            }
        }
    } catch {
        Write-Host "  [ERROR] Erreur lors de la lecture de VERSION.json: $($_.Exception.Message)" -ForegroundColor Red
        return $null
    }
}

function Update-VersionBuild {
    param(
        [Parameter(Mandatory=$true)][string]$Component,
        [Parameter(Mandatory=$false)][switch]$IncrementBuild
    )
    
    if (-not (Test-Path $VERSION_FILE)) {
        Get-VersionInfo -Component $Component | Out-Null
    }
    
    try {
        $content = Get-Content $VERSION_FILE -Raw | ConvertFrom-Json
        
        if ($Component -eq "client") {
            if ($IncrementBuild) {
                $content.client.build = [int]$content.client.build + 1
            }
            $version = $content.client.version
            $build = $content.client.build
        } elseif ($Component -eq "server") {
            if ($IncrementBuild) {
                $content.server.build = [int]$content.server.build + 1
            }
            $version = $content.server.version
            $build = $content.server.build
        } else {
            Write-Host "  [ERROR] Composant invalide: $Component (doit être 'client' ou 'server')" -ForegroundColor Red
            return $null
        }
        
        # Sauvegarder
        $json = $content | ConvertTo-Json -Depth 3
        Set-Content -Path $VERSION_FILE -Value $json -Encoding UTF8
        
        return @{
            Version = $version
            Build = $build
            FullVersion = "$version.$build"
        }
    } catch {
        Write-Host "  [ERROR] Erreur lors de la mise à jour de VERSION.json: $($_.Exception.Message)" -ForegroundColor Red
        return $null
    }
}

function Update-VersionMinor {
    param(
        [Parameter(Mandatory=$true)][string]$Component
    )
    
    if (-not (Test-Path $VERSION_FILE)) {
        Get-VersionInfo -Component $Component | Out-Null
    }
    
    try {
        $content = Get-Content $VERSION_FILE -Raw | ConvertFrom-Json
        
        if ($Component -eq "client") {
            $parts = $content.client.version -split '\.'
            $major = [int]$parts[0]
            $minor = [int]$parts[1]
            $patch = [int]$parts[2]
            $patch = $patch + 1
            if ($patch -ge 100) {
                $patch = 0
                $minor = $minor + 1
            }
            if ($minor -ge 100) {
                $minor = 0
                $major = $major + 1
            }
            $content.client.version = "$major.$minor.$patch"
            $content.client.build = 1
            $version = $content.client.version
            $build = $content.client.build
        } elseif ($Component -eq "server") {
            $parts = $content.server.version -split '\.'
            $major = [int]$parts[0]
            $minor = [int]$parts[1]
            $patch = [int]$parts[2]
            $patch = $patch + 1
            if ($patch -ge 100) {
                $patch = 0
                $minor = $minor + 1
            }
            if ($minor -ge 100) {
                $minor = 0
                $major = $major + 1
            }
            $content.server.version = "$major.$minor.$patch"
            $content.server.build = 1
            $version = $content.server.version
            $build = $content.server.build
        } else {
            Write-Host "  [ERROR] Composant invalide: $Component" -ForegroundColor Red
            return $null
        }
        
        # Sauvegarder
        $json = $content | ConvertTo-Json -Depth 3
        Set-Content -Path $VERSION_FILE -Value $json -Encoding UTF8
        
        return @{
            Version = $version
            Build = $build
            FullVersion = "$version.$build"
        }
    } catch {
        Write-Host "  [ERROR] Erreur lors de la mise à jour de version: $($_.Exception.Message)" -ForegroundColor Red
        return $null
    }
}

# Les fonctions sont disponibles après le chargement du script avec: . $versionScript
# Pas besoin d'Export-ModuleMember car ce n'est pas un module PowerShell
