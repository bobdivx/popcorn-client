# Script pour surveiller les logs Chrome et Popcorn de l'émulateur Android en temps réel

$adbPath = "D:\SDK\platform-tools\adb.exe"

if (-not (Test-Path $adbPath)) {
    Write-Host "[ERREUR] adb non trouvé à $adbPath" -ForegroundColor Red
    Write-Host "[INFO] Veuillez mettre à jour le chemin ADB dans le script" -ForegroundColor Yellow
    exit 1
}

# Vérifier qu'un appareil/émulateur est connecté
$devices = & $adbPath devices 2>&1
$connectedDevices = $devices | Select-String -Pattern "device$" | Measure-Object

if ($connectedDevices.Count -eq 0) {
    Write-Host "[ERREUR] Aucun appareil ou émulateur Android connecté" -ForegroundColor Red
    Write-Host "[INFO] Connectez un appareil ou démarrez un émulateur, puis réessayez" -ForegroundColor Yellow
    exit 1
}

Write-Host "[INFO] Appareil(s) Android détecté(s)" -ForegroundColor Green
Write-Host "[INFO] Effacement des logs existants..." -ForegroundColor Cyan
& $adbPath logcat -c | Out-Null

Write-Host ""
Write-Host "=== SURVEILLANCE DES LOGS CHROME ET POPCORN ===" -ForegroundColor Cyan
Write-Host "[INFO] Les logs Chrome et Popcorn seront affichés en temps réel" -ForegroundColor Green
Write-Host "[INFO] Appuyez sur Ctrl+C pour arrêter" -ForegroundColor Yellow
Write-Host ""

# Filtres pour les logs Chrome sur Android
# Tags principaux pour Chrome/WebView:
# - chromium : logs principaux de Chromium
# - chromium_net : logs réseau
# - cr_* : divers logs Chromium
# - WebView : logs WebView Android
# - console : console JavaScript
# - libEGL : OpenGL/rendu
# - AwContents : Android WebView
# - Console : messages console

# Format de logcat : *:S pour supprimer tout, puis on ajoute ce qu'on veut voir
$chromeTags = @(
    "chromium:D",
    "chromium_net:D",
    "cr_*:D",
    "WebView:D",
    "console:D",
    "libEGL:D",
    "AwContents:D",
    "Console:D",
    "JsConsole:D",
    "RendererMain:D",
    "WebViewFactory:D",
    "popcorn:D",       # Logs de l'application Popcorn
    "popcorn-debug:D", # Logs de debug Popcorn
    "diag-debug:D",    # Logs de diagnostic
    "RustStdoutStderr:D", # Logs Tauri/Rust
    "*:E",  # Afficher aussi toutes les erreurs générales
    "*:W"   # Afficher aussi tous les avertissements généraux
)

# Construire la commande logcat avec filtres
$logcatArgs = @("logcat") + $chromeTags + "*:S"

# Ajouter des couleurs pour faciliter la lecture
function Write-LogLine {
    param([string]$line)
    
    if ($line -match "(\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3})\s+(\d+)\s+(\d+)\s+([VVDIWE])\s+([^\s:]+):\s+(.*)") {
        $timestamp = $matches[1]
        $processId = $matches[2]  # Renommé de $pid pour éviter le conflit avec la variable système
        $threadId = $matches[3]
        $level = $matches[4]
        $tag = $matches[5]
        $message = $matches[6]
        
        # Colorer selon le niveau de log
        $color = switch ($level) {
            "E" { "Red" }
            "W" { "Yellow" }
            "I" { "Cyan" }
            "D" { "White" }
            default { "Gray" }
        }
        
        # Mettre en évidence les tags Chrome importants
        if ($tag -match "chromium|WebView|cr_|Console") {
            $color = "Green"
        }
        
        # Mettre en évidence les logs Popcorn/Tauri en magenta
        if ($tag -match "popcorn|diag-debug|RustStdoutStderr|Tauri") {
            $color = "Magenta"
        }
        
        Write-Host "[$timestamp] [$level] ${tag}: $message" -ForegroundColor $color
    } else {
        # Si la ligne ne correspond pas au format, l'afficher quand même
        Write-Host $line -ForegroundColor Gray
    }
}

# Capturer les logs en temps réel
try {
    & $adbPath $logcatArgs 2>&1 | ForEach-Object {
        Write-LogLine $_
    }
} catch {
    Write-Host "[ERREUR] Erreur lors de la capture des logs: $_" -ForegroundColor Red
    exit 1
}
