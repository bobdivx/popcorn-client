#!/usr/bin/env python3
"""Script pour appliquer la configuration de signature au build.gradle.kts (TV)"""
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
                val keystoreFileName = keystoreProperties["storeFile"] as String
                storeFile = rootProject.file(keystoreFileName)
                storePassword = keystoreProperties["storePassword"] as String
                keyAlias = keystoreProperties["keyAlias"] as String
                keyPassword = keystoreProperties["keyPassword"] as String
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
