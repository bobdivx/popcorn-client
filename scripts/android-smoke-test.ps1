param(
  [Parameter(Mandatory = $true)]
  [string]$BackendUrl,

  [Parameter(Mandatory = $false)]
  [ValidateSet("mobile", "tv")]
  [string]$Variant = "mobile",

  [Parameter(Mandatory = $false)]
  [string]$DeviceId = ""
)

$ErrorActionPreference = "Stop"

function Get-AdbArgs {
  if ([string]::IsNullOrWhiteSpace($DeviceId)) { return @() }
  return @("-s", $DeviceId)
}

function Fail($msg) {
  Write-Host "[ERREUR] $msg" -ForegroundColor Red
  exit 1
}

function Info($msg) {
  Write-Host "[INFO] $msg" -ForegroundColor Cyan
}

function Ok($msg) {
  Write-Host "[OK] $msg" -ForegroundColor Green
}

$projectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$backend = $BackendUrl.Trim().TrimEnd("/")

Info "Smoke backend (depuis le PC): $backend"
node (Join-Path $projectRoot "scripts\smoke-backend.mjs") --backend $backend
if ($LASTEXITCODE -ne 0) {
  Fail "Le smoke test backend a échoué (exit=$LASTEXITCODE). Corrige le backend/réseau avant de tester Android."
}
Ok "Smoke backend OK"

if (-not (Get-Command adb -ErrorAction SilentlyContinue)) {
  Fail "adb introuvable dans PATH. Installe Android platform-tools ou ajoute-les au PATH."
}

$apkNamePattern = if ($Variant -eq "tv") { "Popcorn_TV-v*-android-tv*.apk" } else { "Popcorn_Mobile-v*-android-mobile*.apk" }
$apkDir = Resolve-Path (Join-Path $projectRoot "..\popcorn-web\app") -ErrorAction SilentlyContinue
if (-not $apkDir) { Fail "Impossible de trouver popcorn-web/app à côté de popcorn-client" }

$apk = Get-ChildItem -Path $apkDir -File -Filter $apkNamePattern | Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (-not $apk) { Fail "APK introuvable dans $apkDir (pattern: $apkNamePattern). Lance d'abord android:build:$Variant" }

$packageId = if ($Variant -eq "tv") { "com.popcorn.client.tv" } else { "com.popcorn.client.mobile" }

Info "Install APK: $($apk.FullName)"
& adb @((Get-AdbArgs)) install -r $apk.FullName | Out-Null
if ($LASTEXITCODE -ne 0) { Fail "adb install a échoué" }
Ok "APK installé"

Info "Clear logcat"
& adb @((Get-AdbArgs)) logcat -c | Out-Null

Info "Lancement app: $packageId"
& adb @((Get-AdbArgs)) shell monkey -p $packageId -c android.intent.category.LAUNCHER 1 | Out-Null
if ($LASTEXITCODE -ne 0) { Fail "Impossible de lancer l'app via adb/monkey" }

Info "Attente 15s (boot + 1ers appels réseau)"
Start-Sleep -Seconds 15

Info "Extraction logcat (filtre)"
$logs = & adb @((Get-AdbArgs)) logcat -d
$outPath = Join-Path $projectRoot ("android-smoke-logcat-" + $Variant + ".txt")
$logs | Out-File -FilePath $outPath -Encoding utf8

# Heuristique simple: on cherche des erreurs réseau récurrentes
$bad = $logs | Select-String -SimpleMatch -Pattern "NetworkError", "Timeout: le serveur ne répond pas", "CLEARTEXT communication", "ERR_CLEARTEXT_NOT_PERMITTED"
if ($bad) {
  Write-Host "[WARN] Signaux d'erreur trouvés dans logcat. Voir: $outPath" -ForegroundColor Yellow
  exit 2
}

Ok "Smoke Android OK (aucune erreur évidente dans logcat). Rapport: $outPath"
exit 0

