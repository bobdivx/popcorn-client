#!/usr/bin/env python3
"""Script pour appliquer la configuration de signature au build.gradle.kts"""
import re
import sys

file_path = sys.argv[1]

with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# Vérifier si signingConfigs existe déjà
if 'signingConfigs' in content:
    print("Configuration déjà présente")
    sys.exit(0)

# Configuration de signature à insérer
signing_config = '''
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
    '''

# Insérer après compileOptions et avant buildTypes
pattern = r'(compileOptions \{[^}]*\})\s*(buildTypes)'
replacement = r'\1' + signing_config + r'\n    \2'

new_content = re.sub(pattern, replacement, content)

# Ajouter signingConfig au buildType release
release_pattern = r'(getByName\("release"\) \{[^}]*)(isMinifyEnabled = true)'
release_replacement = r'\1\n            signingConfig = signingConfigs.getByName("release")\n            \2'

new_content = re.sub(release_pattern, release_replacement, new_content)

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(new_content)

print("✅ Configuration de signature appliquée")
