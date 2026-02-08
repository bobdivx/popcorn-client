# 🔧 Installation du NDK et des Command Line Tools

## ✅ Ce qui est déjà configuré

- ✅ Java JDK 21 : `D:\Android Studio\jbr`
- ✅ Android SDK : `D:\SDK`
- ✅ Variables d'environnement configurées pour cette session

## ❌ Ce qui manque

1. **Android NDK (Native Development Kit)** - Requis pour Tauri
2. **Android Studio Command Line Tools** - Requis pour Tauri

## 📥 Installation via Android Studio

### Étape 1 : Installer le NDK

1. Ouvrez **Android Studio**
2. Allez dans **Tools > SDK Manager** (ou **File > Settings > Appearance & Behavior > System Settings > Android SDK**)
3. Cliquez sur l'onglet **SDK Tools**
4. Cochez **"NDK (Side by side)"** 
5. Cochez aussi **"CMake"** (recommandé)
6. Cliquez sur **Apply** et attendez l'installation
7. Le NDK sera installé dans : `D:\SDK\ndk\<version>`

### Étape 2 : Installer les Command Line Tools

1. Dans le même **SDK Manager** > **SDK Tools**
2. Cochez **"Android SDK Command-line Tools (latest)"**
3. Cliquez sur **Apply** et attendez l'installation

## ⚙️ Configuration permanente des variables d'environnement

Après avoir installé le NDK, configurez les variables de manière permanente :

```powershell
# Ouvrez PowerShell en tant qu'administrateur
setx JAVA_HOME "D:\Android Studio\jbr"
setx ANDROID_HOME "D:\SDK"
setx ANDROID_SDK_ROOT "D:\SDK"

# Trouvez la version du NDK installée
$ndkVersion = Get-ChildItem "D:\SDK\ndk" -Directory | Sort-Object Name -Descending | Select-Object -First 1
setx ANDROID_NDK_HOME "$($ndkVersion.FullName)"
```

**Important :** Fermez et rouvrez votre terminal après avoir exécuté ces commandes.

## ✅ Vérification

Après installation, vérifiez avec :

```powershell
# Vérifier le NDK
Test-Path "D:\SDK\ndk"

# Vérifier les command line tools
Test-Path "D:\SDK\cmdline-tools"

# Vérifier les variables
$env:JAVA_HOME
$env:ANDROID_HOME
$env:ANDROID_NDK_HOME
```

## 🚀 Une fois tout installé

1. **Fermez et rouvrez votre terminal PowerShell**
2. **Configurez les variables pour cette session :**
   ```powershell
   $env:JAVA_HOME = "D:\Android Studio\jbr"
   $env:ANDROID_HOME = "D:\SDK"
   $env:ANDROID_SDK_ROOT = "D:\SDK"
   $ndkVersion = Get-ChildItem "D:\SDK\ndk" -Directory | Sort-Object Name -Descending | Select-Object -First 1
   $env:ANDROID_NDK_HOME = $ndkVersion.FullName
   ```

3. **Initialisez l'environnement Android Tauri :**
   ```powershell
   cd d:\Github\popcorn-client
   npx tauri android init
   ```

4. **Lancez le build :**
   ```powershell
   npm run android:build
   ```

## 🔍 Alternative : Installation manuelle du NDK

Si vous préférez installer le NDK manuellement :

1. Téléchargez le NDK depuis : https://developer.android.com/ndk/downloads
2. Extrayez-le dans `D:\SDK\ndk\<version>`
3. Configurez `ANDROID_NDK_HOME` vers ce dossier

## 📝 Note

Le script `scripts/setup-android-d.ps1` peut être utilisé pour configurer automatiquement les variables pour une session :

```powershell
powershell -ExecutionPolicy Bypass -File scripts/setup-android-d.ps1
```
