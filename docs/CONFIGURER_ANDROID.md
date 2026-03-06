# 🔧 Configuration manuelle de Java et Android SDK

## 📍 Où sont installés Java et Android SDK ?

Pour builder l'application Android, nous devons connaître les chemins d'installation de :

1. **Java JDK 17+** (pas JRE, il faut le JDK complet)
2. **Android SDK** (généralement installé avec Android Studio)

## 🔍 Comment trouver les chemins

### Pour Java JDK :

1. **Si installé via Android Studio :**
   - Chemin typique : `C:\Users\VOTRE_NOM\AppData\Local\Android\AndroidStudio\jbr`
   - Ou : `C:\Program Files\Android\Android Studio\jbr`

2. **Si installé séparément (Adoptium, Oracle, etc.) :**
   - Cherchez dans : `C:\Program Files\Java\` ou `C:\Program Files\Eclipse Adoptium\`
   - Le dossier doit contenir `bin\java.exe`

### Pour Android SDK :

1. **Emplacement standard :**
   - `C:\Users\VOTRE_NOM\AppData\Local\Android\Sdk`

2. **Si installé ailleurs :**
   - Ouvrez Android Studio
   - Allez dans **File > Settings** (ou **Android Studio > Preferences** sur Mac)
   - **Appearance & Behavior > System Settings > Android SDK**
   - Le chemin du SDK est affiché en haut

## ⚙️ Configuration des variables d'environnement

Une fois que vous avez trouvé les chemins, configurez les variables d'environnement :

### Méthode 1 : Via PowerShell (temporaire pour cette session)

```powershell
# Remplacez les chemins par vos vrais chemins
$env:JAVA_HOME = "C:\Program Files\Java\jdk-17"
$env:ANDROID_HOME = "C:\Users\VOTRE_NOM\AppData\Local\Android\Sdk"
$env:ANDROID_NDK_HOME = "C:\Users\VOTRE_NOM\AppData\Local\Android\Sdk\ndk\VERSION_NDK"
```

### Méthode 2 : Via l'interface Windows (permanent)

1. Appuyez sur **Windows + R**
2. Tapez `sysdm.cpl` et appuyez sur Entrée
3. Onglet **Avancé** > **Variables d'environnement**
4. Dans **Variables système**, cliquez sur **Nouveau**
5. Ajoutez :
   - **Nom** : `JAVA_HOME`
   - **Valeur** : Le chemin vers votre JDK (ex: `C:\Program Files\Java\jdk-17`)
6. Répétez pour :
   - `ANDROID_HOME` : Chemin vers le SDK Android
   - `ANDROID_NDK_HOME` : Chemin vers le NDK (dans le dossier `ndk` du SDK)

### Méthode 3 : Via ligne de commande (permanent)

```powershell
# Remplacez les chemins par vos vrais chemins
setx JAVA_HOME "C:\Program Files\Java\jdk-17"
setx ANDROID_HOME "C:\Users\VOTRE_NOM\AppData\Local\Android\Sdk"
setx ANDROID_NDK_HOME "C:\Users\VOTRE_NOM\AppData\Local\Android\Sdk\ndk\VERSION_NDK"
```

**Important :** Après avoir configuré les variables, **fermez et rouvrez** votre terminal PowerShell.

## ✅ Vérification

Après configuration, vérifiez avec :

```powershell
npm run android:check
```

Ou manuellement :

```powershell
# Vérifier Java
$env:JAVA_HOME
Test-Path "$env:JAVA_HOME\bin\java.exe"

# Vérifier Android SDK
$env:ANDROID_HOME
Test-Path "$env:ANDROID_HOME\platform-tools\adb.exe"

# Vérifier NDK
$env:ANDROID_NDK_HOME
Test-Path "$env:ANDROID_NDK_HOME"
```

## 🚀 Une fois configuré

Lancez le build :

```powershell
npm run android:build
```

## 📝 Note importante

Si vous avez installé Android Studio mais pas encore configuré le SDK :

1. Ouvrez Android Studio
2. Allez dans **Tools > SDK Manager**
3. Installez :
   - **Android SDK Platform** (dernière version)
   - **Android SDK Build-Tools**
   - **Android NDK (Native Development Kit)** - **ESSENTIEL pour Tauri**

Le SDK sera généralement installé dans : `%LOCALAPPDATA%\Android\Sdk`
