# Nettoie les artifacts GitHub Actions du dépôt (plus vieux que N jours).
# Nécessite: GitHub CLI (gh) installé et authentifié: gh auth login
#
# Usage:
#   .\scripts\cleanup-artifacts.ps1
#   .\scripts\cleanup-artifacts.ps1 -RetentionDays 7
#   .\scripts\cleanup-artifacts.ps1 -Repo owner/repo -RetentionDays 14
#   .\scripts\cleanup-artifacts.ps1 -DryRun  # affiche sans supprimer

param(
    [int]$RetentionDays = 14,
    [string]$Repo = "",
    [switch]$DryRun
)

$ErrorActionPreference = "Stop"

# Détecter la racine du repo (parent de scripts/)
$scriptDir = if ($PSScriptRoot) { $PSScriptRoot } else { Split-Path -Parent $MyInvocation.MyCommand.Path }
$projectRoot = Split-Path $scriptDir -Parent

# Repo: si non fourni, utiliser le remote par défaut
if (-not $Repo) {
    Push-Location $projectRoot
    try {
        $remote = git remote get-url origin 2>$null
        if (-not $remote) {
            Write-Host "Erreur: pas de remote 'origin'. Indiquez -Repo owner/repo" -ForegroundColor Red
            exit 1
        }
        # https://github.com/owner/repo ou git@github.com:owner/repo.git
        if ($remote -match 'github\.com[:/]([^/]+)/([^/]+?)(\.git)?$') {
            $Repo = "$($Matches[1])/$($Matches[2])"
        } else {
            Write-Host "Erreur: impossible d'extraire owner/repo de: $remote" -ForegroundColor Red
            exit 1
        }
    } finally {
        Pop-Location
    }
}

# Vérifier que gh est disponible
if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
    Write-Host "Erreur: GitHub CLI (gh) requis. Installez: https://cli.github.com/" -ForegroundColor Red
    Write-Host "  winget install GitHub.cli" -ForegroundColor Gray
    exit 1
}

$env:GH_PAGER = "cat"
$cutoffDate = (Get-Date).AddDays(-$RetentionDays)
Write-Host "Nettoyage des artifacts du depot: $Repo (plus vieux que $RetentionDays jours, avant $($cutoffDate.ToString('u')))" -ForegroundColor Cyan
if ($DryRun) { Write-Host "[DRY RUN] Aucune suppression." -ForegroundColor Yellow }
Write-Host ""

$totalDeleted = 0
$page = 1
$perPage = 100

do {
    $err = $null
    $json = gh api "repos/$Repo/actions/artifacts" --method GET -f "per_page=$perPage" -f "page=$page" 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Erreur API: $json" -ForegroundColor Red
        exit 1
    }
    $data = $json | ConvertFrom-Json
    $artifacts = $data.artifacts
    if (-not $artifacts -or $artifacts.Count -eq 0) { break }

    foreach ($a in $artifacts) {
        $created = [DateTime]::Parse($a.created_at)
        if ($created -lt $cutoffDate) {
            $age = [int](New-TimeSpan -Start $created -End (Get-Date)).TotalDays
            $sizeMb = [math]::Round($a.size_in_bytes / 1MB, 2)
            Write-Host "  Supprime: $($a.name) (id $($a.id), $age j, $sizeMb Mo)"
            if (-not $DryRun) {
                gh api -X DELETE "repos/$Repo/actions/artifacts/$($a.id)" 2>$null
                if ($LASTEXITCODE -ne 0) {
                    Write-Host "    Echec suppression id $($a.id)" -ForegroundColor Red
                } else {
                    $totalDeleted++
                }
            } else {
                $totalDeleted++
            }
        }
    }

    if ($artifacts.Count -lt $perPage) { break }
    $page++
} while ($true)

Write-Host ""
Write-Host "Termine: $totalDeleted artifact(s) supprime(s) ou a supprimer (plus vieux que $RetentionDays jours)." -ForegroundColor Green
