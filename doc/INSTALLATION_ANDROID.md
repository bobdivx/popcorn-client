# Guide d'installation pour le build Android

Ce guide vous aidera à configurer votre environnement pour construire l'application Android avec Tauri.

## Prérequis

### 1. Java JDK (version 17 ou supérieure)

**Option A : Installer Java séparément**
- Téléchargez depuis [Adoptium](https://adoptium.net/) (recommandé)
- Ou depuis [Oracle](https://www.oracle.com/java/technologies/downloads/)
- Installez le JDK (pas seulement le JRE)
- Configurez la variable d'environnement `JAVA_HOME` :
  - Exemple : `C:\Program Files\Eclipse Adoptium\jdk-17.0.x-hotspot`

**Option B : Installer via Android Studio (recommandé)**
- Android Studio inclut Java JDK
- Plus simple et tout-en-un

### 2. Android Studio et SDK

1. **Téléchargez Android Studio**
   - https://developer.android.com/studio
   - Installez Android Studio

2. **Configurez le SDK**
   - Ouvrez Android Studio
   - Allez dans `File > Settings > Appearance & Behavior > System Settings > Android SDK`
   - Ou utilisez le SDK Manager depuis l'écran d'accueil
   - Installez :
     - Android SDK Platform (dernière version)
     - Android SDK Build-Tools
     - Android NDK (Native Development Kit) - **IMPORTANT**

3. **Configurez les variables d'environnement**

   Ouvrez "Variables d'environnement" dans Windows :
   - Appuyez sur `Win + R`
   - Tapez `sysdm.cpl` et appuyez sur Entrée
   - Onglet "Avancé" > "Variables d'environnement"

   Ajoutez ces variables système :

   ```
   JAVA_HOME = C:\Program Files\Android\Android Studio\jbr
   (ou le chemin vers votre installation Java)
   
   ANDROID_HOME = C:\Users\VotreNom\AppData\Local\Android\Sdk
   (ou le chemin vers votre SDK Android)
   
   ANDROID_NDK_HOME = C:\Users\VotreNom\AppData\Local\Android\Sdk\ndk\25.1.8937393
   (remplacez par votre version NDK installée)
   ```

   Ajoutez aussi au PATH :
   ```
   %JAVA_HOME%\bin
   %ANDROID_HOME%\platform-tools
   %ANDROID_HOME%\tools
   ```

### 3. Rust (si pas déjà installé)

- Installez Rust depuis https://rustup.rs/
- Ou via : `winget install Rustlang.Rustup`

### 4. Tauri Android Tools

Une fois Java et Android SDK configurés, exécutez :

```powershell
cd d:\Github\popcorn-vercel
.\scripts\setup-android.ps1
```

Ou manuellement :
```powershell
npx tauri android init
```

## Vérification

Vérifiez que tout est configuré :

```powershell
# Vérifier Java
java -version

# Vérifier Android SDK
$env:ANDROID_HOME
$env:ANDROID_NDK_HOME

# Vérifier Rust
rustc --version
```

## Build Android

Une fois tout configuré, vous pouvez construire :

```powershell
# Build Android standard
npm run tauri:build:android

# Build Android TV
npm run tauri:build:android-tv

# Build Android Mobile
npm run tauri:build:android-mobile
```

Les fichiers APK/AAB seront générés dans `src-tauri/target/aarch64-linux-android/release/`

## Dépannage

### Erreur "Java not found"
- Vérifiez que `JAVA_HOME` est configuré
- Redémarrez le terminal après avoir configuré les variables
- Vérifiez avec `java -version`

### Erreur "NDK not found"
- Installez le NDK via Android Studio SDK Manager
- Configurez `ANDROID_NDK_HOME` avec le chemin exact vers le NDK
- Le chemin doit pointer vers le dossier de version spécifique, ex: `...\ndk\25.1.8937393`

### Erreur "aarch64-linux-android-clang not found"
- Le NDK n'est pas correctement configuré
- Vérifiez que `ANDROID_NDK_HOME` pointe vers la bonne version du NDK
- Réinstallez le NDK si nécessaire

### Erreur de compilation Rust
- Assurez-vous d'avoir Rust installé et à jour
- Exécutez `rustup update`
- Ajoutez la cible Android : `rustup target add aarch64-linux-android`

## Ressources

- [Documentation Tauri Android](https://tauri.app/v1/guides/building/android)
- [Documentation Android NDK](https://developer.android.com/ndk)
- [Guide Android Studio](https://developer.android.com/studio/intro)
