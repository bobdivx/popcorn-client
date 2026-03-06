# Script pour créer un code d'invitation dans la base de données
# Usage: .\scripts\create-invite.ps1 [code] [created_by_user_id]

param(
    [Parameter(Mandatory=$false)]
    [string]$Code = "TEST123",
    
    [Parameter(Mandatory=$false)]
    [string]$CreatedBy = "admin"
)

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Création d'un code d'invitation" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Code: $Code" -ForegroundColor Yellow
Write-Host "Créé par: $CreatedBy" -ForegroundColor Yellow
Write-Host ""
Write-Host "⚠️  Ce script nécessite d'accéder directement à la base de données." -ForegroundColor Yellow
Write-Host "Pour créer un code d'invitation, utilisez l'interface web du serveur" -ForegroundColor Yellow
Write-Host "ou créez-le directement dans la base de données SQLite du serveur:" -ForegroundColor Yellow
Write-Host ""
Write-Host "⚠️  La base de données est maintenant dans popcorn-server/.data/local.db" -ForegroundColor Yellow
Write-Host ""
Write-Host "# Depuis popcorn-server:" -ForegroundColor Cyan
Write-Host "sqlite3 .data/local.db \"INSERT INTO invitations (id, code, created_by, created_at) VALUES ('$(New-Guid)', '$Code', '$CreatedBy', $(Get-Date -UFormat %s));\"" -ForegroundColor Gray
Write-Host ""
Write-Host "# Depuis popcorn-client:" -ForegroundColor Cyan
Write-Host "sqlite3 ../popcorn-server/.data/local.db \"INSERT INTO invitations (id, code, created_by, created_at) VALUES ('$(New-Guid)', '$Code', '$CreatedBy', $(Get-Date -UFormat %s));\"" -ForegroundColor Gray
Write-Host ""
