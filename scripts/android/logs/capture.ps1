# Script générique de capture de logs Android
# Usage: .\scripts\android\logs\capture.ps1 [--duration 60] [--output path/to/log.txt]

param(
    [Parameter()]
    [int]$Duration = 60,
    [Parameter()]
    [string]$OutputPath = ""
)

$ErrorActionPreference = "Continue"

# Importer les fonctions et variables communes
. "$PSScriptRoot\..\..\_common\variables.ps1"
. "$PSScriptRoot\..\..\_common\functions.ps1"

# Utiliser le chemin de debug par défaut si non spécifié
if ([string]::IsNullOrWhiteSpace($OutputPath)) {
    $OutputPath = $script:DebugLogPath
}

# Préparer le répertoire de logs
$logDir = Split-Path $OutputPath -Parent
if (-not (Test-Path $logDir)) { 
    New-Item -ItemType Directory -Path $logDir -Force | Out-Null 
}

# Effacer les anciens logs
if (Test-Path $OutputPath) { 
    Remove-Item $OutputPath -Force 
}

Write-Info "Capture des logs pendant $Duration secondes..."
Write-Info "Destination: $OutputPath"

# Effacer logcat
& $script:AdbPath logcat -c 2>&1 | Out-Null

# Capture continue
$allLogs = @()
$endTime = (Get-Date).AddSeconds($Duration)

while ((Get-Date) -lt $endTime) {
    $logs = & $script:AdbPath logcat -d 2>&1
    if ($logs) { $allLogs += $logs }
    
    $remaining = [math]::Round(($endTime - (Get-Date)).TotalSeconds)
    Write-Host "." -NoNewline -ForegroundColor DarkGray
    Start-Sleep -Seconds 5
}

Write-Host ""

# Capture finale
$finalLogs = & $script:AdbPath logcat -d 2>&1
if ($finalLogs) { $allLogs += $finalLogs }

# Filtrer et sauvegarder (utiliser les patterns de filtrage communs + logs Rust + erreurs)
$pattern = $script:LogFilterPatterns -join "|"
$patternRust = "RustStdoutStderr|popcorn-debug|native-fetch|Command.*not found|TauriError|invoke"
$combinedPattern = "$pattern|$patternRust"
$filtered = $allLogs | Select-String -Pattern $combinedPattern -CaseSensitive:$false | Sort-Object -Unique
$filtered | Out-File -FilePath $OutputPath -Encoding utf8 -Force

Write-Ok "$($filtered.Count) lignes sauvegardées dans $OutputPath"

return $OutputPath