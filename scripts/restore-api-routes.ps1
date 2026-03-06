# Script pour restaurer les routes API après le build Tauri

$apiPath = "src\pages\api"
$apiBackupPath = "src\pages\api.backup"

if (Test-Path $apiBackupPath) {
    Write-Host "Restauration des routes API..." -ForegroundColor Yellow
    if (Test-Path $apiPath) {
        Remove-Item -Recurse -Force $apiPath
    }
    Rename-Item -Path $apiBackupPath -NewName "api"
    Write-Host "Routes API restaurees" -ForegroundColor Green
} else {
    Write-Host "Aucune sauvegarde de routes API trouvee" -ForegroundColor Gray
}
