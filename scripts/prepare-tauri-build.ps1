# Script pour préparer le build Tauri en masquant les routes API
# Les routes API ne sont pas nécessaires pour le client Tauri

$apiPath = "src\pages\api"
$apiBackupPath = "src\pages\api.backup"

if (Test-Path $apiPath) {
    Write-Host "Masquage des routes API pour le build Tauri..." -ForegroundColor Yellow
    if (Test-Path $apiBackupPath) {
        Remove-Item -Recurse -Force $apiBackupPath
    }
    Rename-Item -Path $apiPath -NewName "api.backup"
    Write-Host "Routes API masquees" -ForegroundColor Green
} else {
    Write-Host "Aucune route API trouvee" -ForegroundColor Gray
}
