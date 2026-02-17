# 🚀 Build Android avec Tauri

Ce guide explique comment builder l'application Android avec Tauri.

## 📋 Prérequis

Avant de builder l'application Android, vous devez installer :

1. **Java JDK 17+**
   - Téléchargez depuis [Adoptium](https://adoptium.net/) ou [Oracle](https://www.oracle.com/java/technologies/downloads/)
   - Configurez la variable d'environnement `JAVA_HOME`

2. **Android Studio**
   - Téléchargez depuis [developer.android.com/studio](https://developer.android.com/studio)
   - Installez Android SDK et Android NDK via le SDK Manager
   - Configurez les variables d'environnement :
     - `ANDROID_HOME` (ou `ANDROID_SDK_ROOT`)
     - `ANDROID_NDK_HOME`

3. **Rust**
   - Installez depuis [rustup.rs](https://rustup.rs/)
   - Ajoutez la cible Android : `rustup target add aarch64-linux-android`

## 🔧 Configuration automatique

Le moyen le plus simple est d'utiliser le script de configuration automatique :

```powershell
npm run android:setup
```

Ce script :
- Vérifie les prérequis installés
- Peut installer automatiquement Java et Rust via winget (si disponible)
- Guide l'installation d'Android Studio
- Initialise l'environnement Android Tauri

## ✅ Vérification de l'environnement

Pour vérifier que tout est correctement configuré :

```powershell
npm run android:check
```

## 🏗️ Build de l'application

### Méthode 1 : Script PowerShell (recommandé)

Le script vérifie automatiquement l'environnement et initialise Tauri si nécessaire :

```powershell
# Build standard
npm run android:build

# Build pour Android Mobile
npm run android:build:mobile

# Build pour Android TV
npm run android:build:tv
```

### Méthode 2 : Commandes npm directes

Si l'environnement Android Tauri est déjà initialisé :

```powershell
# Build standard
npm run tauri:build:android

# Build pour Android Mobile
npm run tauri:build:android-mobile

# Build pour Android TV
npm run tauri:build:android-tv
```

### Méthode 3 : Commande Tauri directe

```powershell
# Initialiser l'environnement Android (première fois uniquement)
npx tauri android init

# Builder
npx tauri build --target aarch64-linux-android
```

## 📦 Fichiers générés

Après le build, l'APK sera généré dans :
- **Release** : `src-tauri/target/aarch64-linux-android/release/app/build/outputs/apk/release/app-release.apk`
- **Debug** : `src-tauri/target/aarch64-linux-android/debug/app/build/outputs/apk/debug/app-debug.apk`

## 🔍 Dépannage

### Erreur : "Android SDK not found"
- Vérifiez que `ANDROID_HOME` est configuré
- Assurez-vous que Android SDK et NDK sont installés via Android Studio

### Erreur : "Java not found"
- Vérifiez que `JAVA_HOME` pointe vers le JDK (pas le JRE)
- Redémarrez le terminal après configuration

### Erreur : "Rust target not installed"
- Exécutez : `rustup target add aarch64-linux-android`

### Erreur : "Android environment not initialized"
- Exécutez : `npx tauri android init`
- Ou utilisez le script : `npm run android:build` (initialise automatiquement)

## 📝 Variantes de build

Le projet supporte trois variantes Android :

1. **Standard** (`tauri.android.conf.json` par défaut)
   - Configuration par défaut
   - Identifier : `com.popcorn.client`

2. **Mobile** (`tauri.android.mobile.conf.json`)
   - Optimisé pour smartphones
   - Identifier : `com.popcorn.client.mobile`
   - Fenêtre : 400x800

3. **TV** (`tauri.android.conf.json`)
   - Optimisé pour Android TV
   - Identifier : `com.popcorn.client.tv`
   - Fenêtre : 1920x1080, plein écran

## 🎯 Prochaines étapes

Après le build :
1. Transférez l'APK sur votre appareil Android
2. Activez "Sources inconnues" dans les paramètres Android
3. Installez l'APK
4. Testez l'application

Pour publier sur le Play Store, vous devrez :
- Signer l'APK avec une clé de release
- Configurer les permissions dans `AndroidManifest.xml`
- Respecter les politiques du Play Store
