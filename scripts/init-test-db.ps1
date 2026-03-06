# Script pour initialiser la base de donnees de test et creer un code d'invitation
# Usage: .\scripts\init-test-db.ps1 [server_path] [invite_code]

param(
    [Parameter(Mandatory=$false)]
    [string]$ServerPath = "d:\Github\popcorn",
    
    [Parameter(Mandatory=$false)]
    [string]$InviteCode = "TEST123"
)

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Initialisation Base de Donnees de Test" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

$dbPath = Join-Path $ServerPath ".data\local.db"

if (-not (Test-Path $dbPath)) {
    Write-Host "[WARNING] La base de donnees n'existe pas encore: $dbPath" -ForegroundColor Yellow
    Write-Host "   Elle sera creee lors de la premiere utilisation du serveur" -ForegroundColor Yellow
    Write-Host ""
}

# Verifier si sqlite3 est disponible
$sqlite3 = Get-Command sqlite3 -ErrorAction SilentlyContinue

if (-not $sqlite3) {
    Write-Host "[WARNING] sqlite3 n'est pas disponible dans le PATH" -ForegroundColor Yellow
    Write-Host "   Vous devez installer SQLite ou utiliser l'interface web du serveur" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Pour creer un code d'invitation manuellement:" -ForegroundColor Cyan
    Write-Host "   1. Connectez-vous au serveur avec l'utilisateur admin" -ForegroundColor Gray
    Write-Host "   2. Allez dans la section Invitations" -ForegroundColor Gray
    Write-Host "   3. Creez un nouveau code d'invitation" -ForegroundColor Gray
    Write-Host ""
    exit 0
}

if (Test-Path $dbPath) {
    Write-Host "[INFO] Verification de la base de donnees..." -ForegroundColor Cyan
    
    # Verifier si l'utilisateur admin existe
    $adminCheck = sqlite3 $dbPath "SELECT COUNT(*) FROM users WHERE is_admin = 1;" 2>$null
    if ($LASTEXITCODE -eq 0 -and $adminCheck -gt 0) {
        Write-Host "   [OK] Utilisateur admin trouve" -ForegroundColor Green
        
        # Recuperer l'ID de l'admin
        $adminId = sqlite3 $dbPath "SELECT id FROM users WHERE is_admin = 1 LIMIT 1;" 2>$null
        
        if ($adminId) {
            Write-Host "   Admin ID: $adminId" -ForegroundColor Gray
            
            # Verifier si le code d'invitation existe deja
            $inviteCheck = sqlite3 $dbPath "SELECT COUNT(*) FROM invitations WHERE code = '$InviteCode';" 2>$null
            
            if ($inviteCheck -eq 0) {
                # Creer le code d'invitation
                $inviteId = [guid]::NewGuid().ToString()
                $now = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
                
                $sql = "INSERT INTO invitations (id, code, created_by, created_at) VALUES ('$inviteId', '$InviteCode', '$adminId', $now);"
                sqlite3 $dbPath $sql 2>$null
                
                if ($LASTEXITCODE -eq 0) {
                    Write-Host "   [OK] Code d'invitation cree: $InviteCode" -ForegroundColor Green
                } else {
                    Write-Host "   [ERROR] Erreur lors de la creation du code d'invitation" -ForegroundColor Red
                }
            } else {
                Write-Host "   [INFO] Le code d'invitation existe deja: $InviteCode" -ForegroundColor Cyan
            }
        }
    } else {
        Write-Host "   [WARNING] Aucun utilisateur admin trouve" -ForegroundColor Yellow
        Write-Host "   La base de donnees doit etre initialisee via le serveur" -ForegroundColor Yellow
    }
} else {
    Write-Host "[WARNING] La base de donnees n'existe pas encore" -ForegroundColor Yellow
    Write-Host "   Elle sera creee lors de la premiere utilisation du serveur" -ForegroundColor Yellow
}

Write-Host ""
