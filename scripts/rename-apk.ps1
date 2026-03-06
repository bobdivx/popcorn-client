# Script pour renommer les APK avec le nouveau format (sans -android-mobile/-android-tv)
# Usage: .\scripts\rename-apk.ps1 [path/to.apk]

param(
    [Parameter(Mandatory=$false)]
    [string]$ApkPath = ""
)

$ErrorActionPreference = "Stop"

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Renommage des APK vers le nouveau format" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Trouver les APK si le chemin n'est pas fourni
if ([string]::IsNullOrWhiteSpace($ApkPath)) {
    $destDir = Resolve-Path (Join-Path $PSScriptRoot "..\..\popcorn-web\app") -ErrorAction SilentlyContinue
    if ($destDir) {
        $apks = Get-ChildItem -Path $destDir -Filter "*.apk" -File | Where-Object { 
            $_.Name -like "*-android-*.apk" 
        } | Sort-Object LastWriteTime -Descending
        
        if ($apks -and $apks.Count -gt 0) {
            Write-Host "[INFO] APK(s) trouvé(s) avec l'ancien format:" -ForegroundColor Cyan
            foreach ($apk in $apks) {
                Write-Host "  - $($apk.Name)" -ForegroundColor Gray
            }
            Write-Host ""
            
            foreach ($apk in $apks) {
                # Extraire le nom et la version
                if ($apk.Name -match "^(Popcorn_(?:Mobile|TV))-v([\d\.]+)-android-(?:mobile|tv)\.apk$") {
                    $productName = $matches[1]
                    $version = $matches[2]
                    $newName = "$productName-v$version.apk"
                    $newPath = Join-Path $apk.DirectoryName $newName
                    
                    Write-Host "[RENOMMAGE] $($apk.Name)" -ForegroundColor Yellow
                    Write-Host "  -> $newName" -ForegroundColor Green
                    
                    if (Test-Path $newPath) {
                        Write-Host "  [WARN] Le fichier $newName existe déjà, suppression..." -ForegroundColor Yellow
                        Remove-Item $newPath -Force
                    }
                    
                    Rename-Item -Path $apk.FullName -NewName $newName -Force
                    Write-Host "  [OK] Renommé avec succès" -ForegroundColor Green
                    Write-Host ""
                } else {
                    Write-Host "[WARN] Format non reconnu: $($apk.Name)" -ForegroundColor Yellow
                }
            }
        } else {
            Write-Host "[INFO] Aucun APK avec l'ancien format trouvé" -ForegroundColor Cyan
        }
    } else {
        Write-Host "[ERREUR] Chemin de l'APK non fourni et popcorn-web/app introuvable" -ForegroundColor Red
        exit 1
    }
} else {
    # Renommer un APK spécifique
    if (-not (Test-Path $ApkPath)) {
        Write-Host "[ERREUR] APK introuvable: $ApkPath" -ForegroundColor Red
        exit 1
    }
    
    $apk = Get-Item $ApkPath
    if ($apk.Name -match "^(Popcorn_(?:Mobile|TV))-v([\d\.]+)-android-(?:mobile|tv)\.apk$") {
        $productName = $matches[1]
        $version = $matches[2]
        $newName = "$productName-v$version.apk"
        $newPath = Join-Path $apk.DirectoryName $newName
        
        Write-Host "[RENOMMAGE] $($apk.Name)" -ForegroundColor Yellow
        Write-Host "  -> $newName" -ForegroundColor Green
        
        if (Test-Path $newPath) {
            Write-Host "  [WARN] Le fichier $newName existe déjà, suppression..." -ForegroundColor Yellow
            Remove-Item $newPath -Force
        }
        
        Rename-Item -Path $apk.FullName -NewName $newName -Force
        Write-Host "  [OK] Renommé avec succès" -ForegroundColor Green
    } else {
        Write-Host "[WARN] Format non reconnu: $($apk.Name)" -ForegroundColor Yellow
        Write-Host "  Format attendu: Popcorn_Mobile-vX.Y.Z-android-mobile.apk" -ForegroundColor Gray
    }
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "[OK] Renommage terminé" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
