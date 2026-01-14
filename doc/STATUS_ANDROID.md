# 📱 État de la Configuration Android

## ✅ Ce qui est prêt

1. **Rust installé** ✓
   - Version: 1.92.0
   - Cible Android installée: `aarch64-linux-android` ✓

2. **Scripts de build créés** ✓
   - `scripts/build-android.ps1` - Script de build automatique
   - Commandes npm disponibles:
     - `npm run android:build` - Build standard
     - `npm run android:build:mobile` - Build mobile
     - `npm run android:build:tv` - Build TV

3. **Configurations Tauri Android** ✓
   - `src-tauri/tauri.android.conf.json` - Configuration TV
   - `src-tauri/tauri.android.mobile.conf.json` - Configuration mobile

## ❌ Ce qui manque

Pour builder l'application Android, vous devez installer :

### 1. Java JDK 17+

**Options d'installation :**

**Option A : Via winget (recommandé)**
```powershell
winget install --id EclipseAdoptium.Temurin.17.JDK
```

**Option B : Téléchargement manuel**
- Téléchargez depuis [Adoptium](https://adoptium.net/)
- Ou depuis [Oracle](https://www.oracle.com/java/technologies/downloads/)

**Configuration :**
Après installation, configurez la variable d'environnement `JAVA_HOME` :
- Ouvrez "Variables d'environnement" dans Windows
- Ajoutez `JAVA_HOME` pointant vers le dossier d'installation du JDK
- Exemple : `C:\Program Files\Eclipse Adoptium\jdk-17.0.x-hotspot`

### 2. Android Studio avec SDK et NDK

**Installation :**

**Option A : Via winget**
```powershell
winget install --id Google.AndroidStudio
```

**Option B : Téléchargement manuel**
- Téléchargez depuis [developer.android.com/studio](https://developer.android.com/studio)

**Configuration après installation :**

1. Ouvrez Android Studio
2. Allez dans **Tools > SDK Manager**
3. Installez :
   - **Android SDK Platform** (dernière version recommandée)
   - **Android SDK Build-Tools**
   - **Android NDK (Native Development Kit)** - **IMPORTANT pour Tauri**

4. Configurez les variables d'environnement :
   - `ANDROID_HOME` ou `ANDROID_SDK_ROOT` : Chemin vers le SDK
     - Par défaut : `%LOCALAPPDATA%\Android\Sdk`
   - `ANDROID_NDK_HOME` : Chemin vers le NDK
     - Par défaut : `%LOCALAPPDATA%\Android\Sdk\ndk\<version>`

## 🚀 Prochaines étapes

Une fois Java et Android Studio installés :

1. **Vérifier la configuration :**
   ```powershell
   npm run android:check
   ```

2. **Builder l'application :**
   ```powershell
   npm run android:build
   ```

Le script va automatiquement :
- Vérifier tous les prérequis
- Initialiser l'environnement Android Tauri (si nécessaire)
- Builder l'application Android
- Générer l'APK dans `src-tauri/target/aarch64-linux-android/release/app/build/outputs/apk/release/app-release.apk`

## 📝 Alternative : Script de configuration automatique

Vous pouvez utiliser le script de configuration qui peut installer automatiquement certains prérequis :

```powershell
npm run android:setup
```

Ce script peut :
- Installer Java via winget (si disponible)
- Installer Rust via winget (si disponible)
- Guider l'installation d'Android Studio
- Initialiser l'environnement Android Tauri

## ⚠️ Note importante

L'environnement Android Tauri (`src-tauri/android`) sera créé automatiquement lors du premier build ou en exécutant :
```powershell
npx tauri android init
```

Mais cette commande nécessite que Java soit installé et configuré.
