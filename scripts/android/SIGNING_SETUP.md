# Configuration rapide de la signature APK

## Étapes rapides

### 1. Créer le keystore

**Mode interactif (recommandé) :**
```powershell
.\scripts\android\create-keystore.ps1
```

**Mode non-interactif (avec mots de passe) :**
```powershell
.\scripts\android\create-keystore.ps1 -StorePassword "votre_mot_de_passe" -KeyPassword "votre_mot_de_passe"
```

Le script créera le keystore dans `src-tauri\gen\android\keystore.jks`.

### 2. Créer le fichier de configuration

**Option A : Utiliser le script helper (recommandé)**
```powershell
.\scripts\android\create-keystore-properties.ps1
```

**Option B : Créer manuellement**

Créez `src-tauri\gen\android\keystore.properties` :

```properties
storeFile=keystore.jks
storePassword=votre_mot_de_passe
keyAlias=popcorn-key
keyPassword=votre_mot_de_passe
```

### 3. Build l'APK signé

```powershell
npm run android:build:mobile
```

L'APK sera automatiquement signé lors du build.

## Alternative : Variables d'environnement

Au lieu du fichier `keystore.properties`, vous pouvez utiliser :

```powershell
$env:ANDROID_KEYSTORE_PATH = "src-tauri\gen\android\keystore.jks"
$env:ANDROID_KEYSTORE_PASSWORD = "votre_mot_de_passe"
$env:ANDROID_KEY_ALIAS = "popcorn-key"
$env:ANDROID_KEY_PASSWORD = "votre_mot_de_passe"

npm run android:build:mobile
```

## Vérification

Pour vérifier que l'APK est signé :

```powershell
jarsigner -verify -verbose -certs votre-app.apk
```
