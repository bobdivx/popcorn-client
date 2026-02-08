# Script pour appliquer la configuration de signature au build.gradle.kts
# Ce script doit être exécuté après que Tauri ait généré les fichiers Android

param(
    [string]$BuildGradlePath = "src-tauri\gen\android\app\build.gradle.kts"
)

Write-Host "[INFO] Application de la configuration de signature..." -ForegroundColor Cyan

if (-not (Test-Path $BuildGradlePath)) {
    Write-Host "[ERREUR] Fichier build.gradle.kts non trouvé: $BuildGradlePath" -ForegroundColor Red
    exit 1
}

$content = Get-Content $BuildGradlePath -Raw

# Vérifier si la configuration de signature existe déjà
if ($content -match "signingConfigs") {
    Write-Host "[INFO] La configuration de signature existe déjà" -ForegroundColor Yellow
    exit 0
}

# Trouver la section android et ajouter la configuration de signature
$signingConfig = @"

    // Configuration de la signature
    signingConfigs {
        create("release") {
            val keystorePropertiesFile = rootProject.file("keystore.properties")
            if (keystorePropertiesFile.exists()) {
                val keystoreProperties = Properties()
                keystoreProperties.load(keystorePropertiesFile.inputStream())
                // Résoudre le chemin du keystore depuis la racine du projet (rootProject)
                val keystoreFileName = keystoreProperties["storeFile"] as String
                storeFile = rootProject.file(keystoreFileName)
                storePassword = keystoreProperties["storePassword"] as String
                keyAlias = keystoreProperties["keyAlias"] as String
                keyPassword = keystoreProperties["keyPassword"] as String
            } else {
                // Utiliser les variables d'environnement si le fichier n'existe pas
                val keystorePath = System.getenv("ANDROID_KEYSTORE_PATH") ?: ""
                val keystorePassword = System.getenv("ANDROID_KEYSTORE_PASSWORD") ?: ""
                val keyAlias = System.getenv("ANDROID_KEY_ALIAS") ?: "popcorn-key"
                val keyPassword = System.getenv("ANDROID_KEY_PASSWORD") ?: keystorePassword
                
                if (keystorePath.isNotEmpty() && keystorePassword.isNotEmpty()) {
                    // Vérifier si le chemin est absolu (Windows: contient ':', Unix: commence par '/')
                    val isAbsolute = keystorePath.contains(":") || keystorePath.startsWith("/")
                    val keystoreFile = if (isAbsolute) {
                        file(keystorePath)
                    } else {
                        rootProject.file(keystorePath)
                    }
                    if (keystoreFile.exists()) {
                        storeFile = keystoreFile
                        storePassword = keystorePassword
                        this.keyAlias = keyAlias
                        this.keyPassword = keyPassword
                    }
                }
            }
        }
    }
    
"@

# Insérer la configuration après compileOptions et avant buildTypes
$pattern = '(compileOptions \{[^}]*\})\s*(buildTypes)'
$replacement = "`$1`n$signingConfig`n    `$2"

$newContent = $content -replace $pattern, $replacement

# Ajouter signingConfig au buildType release
$releasePattern = '(getByName\("release"\) \{[^}]*)(isMinifyEnabled = true)'
$releaseReplacement = "`$1`n            signingConfig = signingConfigs.getByName(`"release`")`n            `$2"

$newContent = $newContent -replace $releasePattern, $releaseReplacement

# Écrire le fichier modifié
try {
    Set-Content -Path $BuildGradlePath -Value $newContent -NoNewline -Encoding UTF8
    Write-Host "[OK] Configuration de signature appliquée avec succès" -ForegroundColor Green
} catch {
    Write-Host "[ERREUR] Impossible d'écrire le fichier: $_" -ForegroundColor Red
    exit 1
}
