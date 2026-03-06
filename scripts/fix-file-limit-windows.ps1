# Script pour diagnostiquer et résoudre le problème "too many open files" sur Windows
# Ce problème peut survenir avec Astro/Vite sur Windows

Write-Host "=== Diagnostic du problème 'too many open files' ===" -ForegroundColor Cyan
Write-Host ""

# Vérifier les processus Node.js en cours
$nodeProcesses = Get-Process -Name "node" -ErrorAction SilentlyContinue
Write-Host "Processus Node.js actifs: $($nodeProcesses.Count)" -ForegroundColor Yellow

if ($nodeProcesses.Count -gt 0) {
    Write-Host "Processus trouvés:" -ForegroundColor Yellow
    $nodeProcesses | ForEach-Object {
        Write-Host "  - PID: $($_.Id) | Mémoire: $([math]::Round($_.WorkingSet64 / 1MB, 2)) MB" -ForegroundColor Gray
    }
    Write-Host ""
    Write-Host "Conseil: Fermez les processus Node.js inutiles pour libérer des ressources." -ForegroundColor Green
}

Write-Host ""
Write-Host "=== Solutions recommandées ===" -ForegroundColor Cyan
Write-Host ""
Write-Host "1. Redémarrer le serveur dev Astro:" -ForegroundColor Yellow
Write-Host "   npm run dev" -ForegroundColor Gray
Write-Host ""
Write-Host "2. Vérifier que la configuration Astro exclut les répertoires volumineux" -ForegroundColor Yellow
Write-Host "   (déjà configuré dans astro.config.mjs et .astroignore)" -ForegroundColor Gray
Write-Host ""
Write-Host "3. Fermer d'autres applications qui utilisent beaucoup de fichiers" -ForegroundColor Yellow
Write-Host ""
Write-Host "4. Sur Windows, la limite est définie par le système." -ForegroundColor Yellow
Write-Host "   Pour l'augmenter, vous pouvez utiliser des outils comme:" -ForegroundColor Gray
Write-Host "   - ulimit (via Git Bash ou WSL)" -ForegroundColor Gray
Write-Host "   - Ou utiliser WSL2 pour le développement" -ForegroundColor Gray
Write-Host ""

# Optionnel: Fermer les processus Node.js si demandé
$response = Read-Host "Voulez-vous fermer tous les processus Node.js? (O/N)"
if ($response -eq "O" -or $response -eq "o") {
    $nodeProcesses | ForEach-Object {
        try {
            Stop-Process -Id $_.Id -Force
            Write-Host "Processus $($_.Id) fermé" -ForegroundColor Green
        } catch {
            Write-Host "Impossible de fermer le processus $($_.Id): $_" -ForegroundColor Red
        }
    }
    Write-Host ""
    Write-Host "Tous les processus Node.js ont été fermés." -ForegroundColor Green
    Write-Host "Vous pouvez maintenant redémarrer avec: npm run dev" -ForegroundColor Cyan
}
