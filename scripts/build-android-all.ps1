# Build Android Mobile + Android TV et copie les APK dans popcorn-web/app
# Usage: .\scripts\build-android-all.ps1

$ErrorActionPreference = "Stop"

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$buildScript = Join-Path $scriptDir "android\build\build.ps1"

if (-not (Test-Path $buildScript)) {
    Write-Host "[ERREUR] build-android.ps1 introuvable: $buildScript" -ForegroundColor Red
    exit 1
}

function Clean-PopcornWebApkArtifacts {
    # Dossier de destination: ../.. /popcorn-web/app (à côté de popcorn-client)
    $popcornWebDir = Resolve-Path (Join-Path $scriptDir "..\..\popcorn-web") -ErrorAction SilentlyContinue
    if (-not $popcornWebDir) {
        Write-Host "[WARN] Impossible de resoudre le chemin vers popcorn-web. Clean des APK ignore." -ForegroundColor Yellow
        return
    }

    $appDir = Join-Path $popcornWebDir "app"
    if (-not (Test-Path $appDir)) {
        return
    }

    # On ne supprime que les APK Popcorn (mobile/tv) et artefacts associés (.aligned/.signed/.idsig)
    $toDelete = Get-ChildItem -Path $appDir -File -ErrorAction SilentlyContinue | Where-Object {
        ($_.Name -like "Popcorn_*-android-*.apk*") -or ($_.Name -like "Popcorn_*-android-*.aab*")
    }

    if ($toDelete -and $toDelete.Count -gt 0) {
        Write-Host "-> Suppression des anciennes versions dans popcorn-web/app ($($toDelete.Count) fichier(s))" -ForegroundColor Yellow
        $toDelete | ForEach-Object {
            try {
                Remove-Item -Force -Path $_.FullName -ErrorAction Stop
            } catch {
                Write-Host "  [WARN] Suppression echouee: $($_.FullName) : $($_.Exception.Message)" -ForegroundColor Yellow
            }
        }
    }
}

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Build Android (mobile + tv)" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

Clean-PopcornWebApkArtifacts
Write-Host ""

Write-Host "-> Build variante: mobile" -ForegroundColor Yellow
& $buildScript "mobile"
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host ""
Write-Host "-> Build variante: tv" -ForegroundColor Yellow
& $buildScript "tv"
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "[OK] Builds Android terminés (mobile + tv)" -ForegroundColor Green
Write-Host "Les APK sont dans popcorn-web/app" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan

