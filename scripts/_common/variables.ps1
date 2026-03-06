# Variables partagées pour les scripts Android
# Importé par tous les scripts Android via: . "$PSScriptRoot\..\_common\variables.ps1"

# Racine du projet
$script:ProjectRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..")

# Chemins Android SDK
$script:AndroidHome = $env:ANDROID_HOME
if (-not $script:AndroidHome) { 
    $script:AndroidHome = $env:ANDROID_SDK_ROOT 
}
# Détection automatique si non défini
if (-not $script:AndroidHome -and (Test-Path "D:\SDK")) { 
    $script:AndroidHome = "D:\SDK" 
}

# Chemin ADB
$script:AdbPath = if ($script:AndroidHome) {
    Join-Path $script:AndroidHome "platform-tools\adb.exe"
} else {
    "D:\SDK\platform-tools\adb.exe"  # Fallback
}

# Chemin Java
$script:JavaHome = $env:JAVA_HOME
if (-not $script:JavaHome) {
    # Détection automatique
    $javaDirs = @("D:\Android Studio\jbr", "C:\Program Files\Java")
    foreach ($dir in $javaDirs) {
        if (Test-Path $dir) {
            $javaExe = Join-Path $dir "bin\java.exe"
            if (Test-Path $javaExe) {
                $script:JavaHome = $dir
                break
            }
        }
    }
}

# Package IDs par variante
$script:PackageIds = @{
    mobile = "com.popcorn.client.mobile"
    tv = "com.popcorn.client.tv"
    standard = "com.popcorn.client"
}

# Chemins de configuration Tauri
$script:TauriConfigPaths = @{
    mobile = Join-Path $script:ProjectRoot "src-tauri\tauri.android.mobile.conf.json"
    tv = Join-Path $script:ProjectRoot "src-tauri\tauri.android.conf.json"
    standard = Join-Path $script:ProjectRoot "src-tauri\tauri.conf.json"
}

# Chemin destination APK
$script:ApkDestPath = "d:\Github\popcorn-web\app"

# Chemin logs de debug
$script:DebugLogPath = "d:\Github\popcorn-server\.cursor\debug.log"

# URLs backend par défaut
$script:DefaultBackendUrls = @{
    emulator = "http://10.0.2.2:3000"
    physical = "http://10.1.0.86:3000"
    localhost = "http://127.0.0.1:3000"
}

# Timeouts et intervalles (secondes)
$script:Timeouts = @{
    buildMax = 3600      # 60 minutes
    install = 300        # 5 minutes
    logCapture = 60      # 1 minute
    appLaunch = 8        # 8 secondes
    checkInterval = 30   # 30 secondes
}

# Patterns pour détection progression build
$script:BuildProgressPatterns = @(
    @{ Name = "Nettoyage"; Pattern = "Caches nettoy|Cleaning|Nettoyage"; Percent = 5 },
    @{ Name = "Routes API"; Pattern = "Routes API|api-routes|Déplacement"; Percent = 10 },
    @{ Name = "Config Tauri"; Pattern = "Configuration Tauri|Tauri config"; Percent = 15 },
    @{ Name = "Build Astro"; Pattern = "Build Astro|Building static|astro build|built in|vite.*built"; Percent = 40 },
    @{ Name = "Build Rust"; Pattern = "Compiling|Building.*rust|cargo build|Finished.*release"; Percent = 60 },
    @{ Name = "Build Gradle"; Pattern = "Task :|Gradle|BUILD SUCCESSFUL|assemble.*Release"; Percent = 90 },
    @{ Name = "Signature APK"; Pattern = "Signing|apksigner|signed\.apk"; Percent = 95 }
)

# Patterns pour filtrage logs
$script:LogFilterPatterns = @(
    "popcorn-debug",
    "native-fetch",
    "Command",
    "Tauri",
    "Rust",
    "tauri",
    "invoke",
    "diag",
    "backend",
    "http",
    "network",
    "error",
    "Error",
    "ERROR"
)