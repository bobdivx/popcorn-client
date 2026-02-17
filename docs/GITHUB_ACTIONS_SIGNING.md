# Configuration de la signature native pour GitHub Actions

## Vue d'ensemble

Le workflow GitHub Actions utilise maintenant la **signature native** avec votre keystore de production au lieu d'un keystore debug. Cela garantit que les APK générés par CI/CD sont signés avec la même clé que vos builds locaux.

## Configuration des secrets GitHub

Pour utiliser la signature native dans GitHub Actions, vous devez configurer les secrets suivants dans votre dépôt GitHub :

### Option 1 : Utiliser un keystore existant (recommandé)

1. **Encoder votre keystore en base64** :
   ```bash
   # Sur Windows (PowerShell)
   [Convert]::ToBase64String([IO.File]::ReadAllBytes("src-tauri\gen\android\keystore.jks")) | Out-File -Encoding ASCII keystore_base64.txt
   
   # Sur Linux/Mac
   base64 -i src-tauri/gen/android/keystore.jks -o keystore_base64.txt
   ```

2. **Ajouter les secrets dans GitHub** :
   - Allez dans votre dépôt GitHub
   - **Settings** > **Secrets and variables** > **Actions**
   - Cliquez sur **New repository secret**
   
   Ajoutez les secrets suivants :
   
   | Nom du secret | Description | Exemple |
   |--------------|-------------|---------|
   | `ANDROID_KEYSTORE_BASE64` | Keystore encodé en base64 | Contenu du fichier `keystore_base64.txt` |
   | `ANDROID_KEYSTORE_PASSWORD` | Mot de passe du keystore | `Qs-T++l646464` |
   | `ANDROID_KEY_PASSWORD` | Mot de passe de la clé (peut être identique) | `Qs-T++l646464` |

### Option 2 : Créer un nouveau keystore (pour CI uniquement)

Si vous ne configurez pas `ANDROID_KEYSTORE_BASE64`, le workflow créera automatiquement un nouveau keystore avec les mots de passe fournis dans les secrets.

⚠️ **Attention** : Si vous utilisez cette option, les APK générés par CI/CD auront une signature différente de vos builds locaux.

## Vérification

Une fois les secrets configurés :

1. **Lancez un workflow** : Le workflow utilisera automatiquement le keystore de production
2. **Vérifiez les logs** : Vous devriez voir :
   ```
   🔐 Configuration de la signature native...
   📥 Décodage du keystore depuis les secrets...
   ✅ Keystore décodé
   ✅ Fichier keystore.properties créé
   ```
3. **Vérifiez l'APK** : L'APK généré sera signé avec votre keystore de production

## Sécurité

- ⚠️ **Ne commitez JAMAIS** le keystore ou les mots de passe dans le dépôt
- ✅ Utilisez toujours les **secrets GitHub** pour stocker les informations sensibles
- ✅ Le fichier `keystore.properties` est automatiquement généré par le workflow et n'est pas commité
- ✅ Le keystore est décodé uniquement pendant l'exécution du workflow

## Dépannage

### L'APK n'est pas signé

1. Vérifiez que les secrets sont correctement configurés
2. Vérifiez les logs du workflow pour les erreurs de décodage du keystore
3. Vérifiez que le mot de passe est correct

### Erreur "keystore password was incorrect"

1. Vérifiez que `ANDROID_KEYSTORE_PASSWORD` correspond au mot de passe utilisé lors de la création du keystore
2. Vérifiez que `ANDROID_KEY_PASSWORD` est correct (peut être identique à `ANDROID_KEYSTORE_PASSWORD`)

### Le workflow crée un nouveau keystore au lieu d'utiliser l'existant

- Vérifiez que le secret `ANDROID_KEYSTORE_BASE64` est bien configuré
- Vérifiez que le contenu base64 est complet (pas de troncature)

## Migration depuis l'ancien système

Si vous utilisiez précédemment le keystore debug dans GitHub Actions :

1. **Configurez les secrets** comme décrit ci-dessus
2. **Le workflow utilisera automatiquement** la signature native
3. **Les anciens APK** signés avec le debug keystore ne seront plus générés
