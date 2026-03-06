# Nettoie les workflow runs termines (completed) dans les repos GitHub.
# Garde uniquement les runs in_progress et queued.

$repos = @(
    "bobdivx/popcorn-client",
    "bobdivx/popcorn-server",
    "bobdivx/popcorn-tauri",
    "bobdivx/popcorn-web"
)

$perPage = 100
$totalDeleted = 0

foreach ($repo in $repos) {
    Write-Host "`n=== $repo ===" -ForegroundColor Cyan
    $page = 1
    $repoDeleted = 0

    do {
        $uri = "repos/$repo/actions/runs?per_page=$perPage&page=$page"
        $json = gh api $uri 2>$null
        if (-not $json) { break }

        $data = $json | ConvertFrom-Json
        $runs = $data.workflow_runs
        if (-not $runs -or $runs.Count -eq 0) { break }

        $completed = $runs | Where-Object { $_.status -eq "completed" }
        $toDelete = $completed | ForEach-Object { $_.id }

        foreach ($id in $toDelete) {
            gh run delete $id -R $repo 2>&1 | Out-Null
            $repoDeleted++
            $totalDeleted++
        }

        $page++
    } while ($runs.Count -eq $perPage)

    Write-Host "  Supprimes: $repoDeleted"
}

Write-Host "`nTotal runs supprimes: $totalDeleted" -ForegroundColor Green
Remove-Item D:\Github\popcorn-client\tmp-runs.json -ErrorAction SilentlyContinue
