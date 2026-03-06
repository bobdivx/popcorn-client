# Configuration de la signature APK Android

Pour installer un APK sur un appareil Android, il doit être signé. Ce document explique comment configurer la signature native de l'APK.

## Méthode 1 : Utiliser un fichier keystore.properties (Recommandé)

### 1. Créer un keystore

Exécutez le script PowerShell pour créer un keystore :

```powershell
.\scripts\android\create-keystore.ps1
```

Le script vous demandera :
- Le chemin du keystore (par défaut: `src-tauri\gen\android\keystore.jks`)
- L'alias de la clé (par défaut: `popcorn-key`)
- Le mot de passe du keystore
- Le mot de passe de la clé (peut être le même)

### 2. Créer le fichier keystore.properties

Créez le fichier `src-tauri\gen\android\keystore.properties` :

```properties
storeFile=keystore.jks
storePassword=votre_mot_de_passe_keystore
keyAlias=popcorn-key
keyPassword=votre_mot_de_passe_cle
```

**⚠️ IMPORTANT** : Ce fichier contient des informations sensibles. Il est déjà dans `.gitignore` et ne sera pas commité.

### 3. Rebuild l'APK

Le build appliquera automatiquement la signature :

```powershell
npm run android:build:mobile
```

## Méthode 2 : Utiliser des variables d'environnement

Si vous préférez ne pas créer de fichier `keystore.properties`, vous pouvez utiliser des variables d'environnement :

```powershell
$env:ANDROID_KEYSTORE_PATH = "src-tauri\gen\android\keystore.jks"
$env:ANDROID_KEYSTORE_PASSWORD = "votre_mot_de_passe"
$env:ANDROID_KEY_ALIAS = "popcorn-key"
$env:ANDROID_KEY_PASSWORD = "votre_mot_de_passe"

npm run android:build:mobile
```

## Vérification de la signature

Pour vérifier qu'un APK est signé :

```powershell
# Utiliser apksigner (inclus dans Android SDK)
$env:ANDROID_HOME\build-tools\*\apksigner verify --verbose votre-app.apk
```

Ou avec jarsigner :

```powershell
jarsigner -verify -verbose -certs votre-app.apk
```

## Notes importantes

1. **Conservez votre keystore en sécurité** : Si vous perdez le keystore ou le mot de passe, vous ne pourrez plus mettre à jour l'application sur le Play Store.

2. **Ne commitez jamais** :
   - `keystore.jks` ou `*.keystore`
   - `keystore.properties`
   - Les mots de passe

3. **Pour la production** : Utilisez un keystore dédié avec un mot de passe fort et stockez-le de manière sécurisée (gestionnaire de mots de passe, coffre-fort, etc.).

4. **Validité** : Le keystore créé par le script est valide 25 ans par défaut. Vous pouvez modifier cette durée avec le paramètre `-ValidityYears`.

## Dépannage

### L'APK n'est pas signé

Vérifiez que :
- Le fichier `keystore.properties` existe et contient les bonnes valeurs
- OU les variables d'environnement sont définies
- Le keystore existe au chemin spécifié

### Erreur "keystore was tampered with, or password was incorrect"

- Vérifiez que le mot de passe est correct
- Vérifiez que le keystore n'est pas corrompu

### L'APK ne s'installe pas

- Vérifiez que l'APK est bien signé (voir section "Vérification")
- Sur Android, activez "Sources inconnues" dans les paramètres de sécurité
- Vérifiez que vous installez un APK signé avec la même clé que la version précédente (si vous mettez à jour)
