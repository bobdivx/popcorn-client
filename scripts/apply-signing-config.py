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

# Vérifier et ajouter l'import Properties si nécessaire
if 'import java.util.Properties' not in content and 'import java.util.*' not in content:
    # Chercher où insérer l'import (après les autres imports)
    import_pattern = r'(import\s+[^\n]+\n)'
    imports = list(re.finditer(import_pattern, content))
    if imports:
        last_import = imports[-1]
        insert_pos = last_import.end()
        content = content[:insert_pos] + 'import java.util.Properties\n' + content[insert_pos:]
    else:
        # Insérer au début du fichier après les plugins si présents
        plugins_pattern = r'(plugins\s*\{[^}]*\})'
        plugins_match = re.search(plugins_pattern, content)
        if plugins_match:
            insert_pos = plugins_match.end()
            content = content[:insert_pos] + '\nimport java.util.Properties\n' + content[insert_pos:]
        else:
            # Insérer au tout début
            content = 'import java.util.Properties\n' + content

# Configuration de signature à insérer
signing_config = '''    // Configuration de la signature
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

# Chercher buildTypes dans le bloc android
# Pattern 1: chercher buildTypes avec son indentation
buildtypes_pattern = r'(\s+)(buildTypes\s*\{)'
buildtypes_match = re.search(buildtypes_pattern, content)

if not buildtypes_match:
    print("❌ Impossible de trouver le bloc buildTypes dans le fichier")
    print("Contenu du fichier (premiers 500 caractères):")
    print(content[:500])
    sys.exit(1)

# Trouver l'indentation de buildTypes
indent = buildtypes_match.group(1)
buildtypes_pos = buildtypes_match.start()

# Vérifier qu'on est bien dans le bloc android (chercher android { avant buildTypes)
before_buildtypes = content[:buildtypes_pos]
android_match = re.search(r'android\s*\{', before_buildtypes)
if not android_match:
    print("⚠️  buildTypes trouvé mais pas dans un bloc android, insertion quand même...")

# Insérer signingConfigs juste avant buildTypes avec la même indentation
new_content = content[:buildtypes_pos] + indent + signing_config + '\n' + buildtypes_match.group(0) + content[buildtypes_match.end():]

# Ajouter signingConfig au buildType release
release_pattern = r'(getByName\("release"\)\s*\{[^}]*?)(isMinifyEnabled\s*=)'
release_match = re.search(release_pattern, new_content, re.DOTALL)
if release_match:
    release_replacement = release_match.group(1) + '\n            signingConfig = signingConfigs.getByName("release")\n            ' + release_match.group(2)
    new_content = new_content[:release_match.start()] + release_replacement + new_content[release_match.end():]
else:
    # Essayer un pattern plus simple
    release_pattern2 = r'(getByName\("release"\)\s*\{)'
    release_match2 = re.search(release_pattern2, new_content)
    if release_match2:
        # Insérer signingConfig juste après l'ouverture du bloc release
        insert_pos = release_match2.end()
        new_content = new_content[:insert_pos] + '\n            signingConfig = signingConfigs.getByName("release")' + new_content[insert_pos:]

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(new_content)

# Vérifier que la configuration a bien été ajoutée
with open(file_path, 'r', encoding='utf-8') as f:
    verify_content = f.read()
    if 'signingConfigs' not in verify_content:
        print("❌ ERREUR: signingConfigs n'a pas été ajouté au fichier!")
        sys.exit(1)
    if 'create("release")' not in verify_content:
        print("❌ ERREUR: signingConfigs.create(\"release\") n'a pas été ajouté!")
        sys.exit(1)
    if 'signingConfig = signingConfigs.getByName("release")' not in verify_content:
        print("⚠️  ATTENTION: signingConfig n'a pas été ajouté au buildType release")
        print("   Vérifiez que le pattern getByName(\"release\") correspond")

print("✅ Configuration de signature appliquée")
print(f"   - signingConfigs créé")
print(f"   - signingConfig ajouté au buildType release")
