# Encoder le keystore en base64
$projectRoot = Get-Location
$keystorePath = Join-Path $projectRoot "src-tauri\gen\android\keystore.jks"

if (-not (Test-Path $keystorePath)) {
    Write-Host "[ERREUR] Keystore introuvable: $keystorePath" -ForegroundColor Red
    exit 1
}

Write-Host "Encodage du keystore en base64..." -ForegroundColor Cyan
$bytes = [System.IO.File]::ReadAllBytes($keystorePath)
$base64 = [Convert]::ToBase64String($bytes)

$base64File = Join-Path $projectRoot "keystore-base64.txt"
$base64 | Out-File -FilePath $base64File -Encoding utf8 -NoNewline

Write-Host "[OK] Base64 sauvegarde dans: $base64File" -ForegroundColor Green
Write-Host ""
Write-Host "Valeurs pour GitHub Secrets (repo popcorn-client):" -ForegroundColor Cyan
Write-Host "  ANDROID_KEYSTORE_BASE64 = (contenu de $base64File)" -ForegroundColor Yellow
Write-Host "  ANDROID_KEYSTORE_PASSWORD = Qs-T++l646464" -ForegroundColor Yellow
Write-Host "  ANDROID_KEY_PASSWORD = Qs-T++l646464" -ForegroundColor Yellow
Write-Host "  ANDROID_KEY_ALIAS = popcorn-key" -ForegroundColor Yellow
Write-Host ""
Write-Host "[ATTENTION] Ne commitez JAMAIS keystore-base64.txt dans Git!" -ForegroundColor Red
