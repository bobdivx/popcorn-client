# Dépannage : Installation APK Android

## Problème : "Package semble ne pas être valide"

Si vous recevez cette erreur lors de l'installation de l'APK sur votre appareil Android, suivez ce guide de dépannage.

## Diagnostic automatique

Utilisez le script de diagnostic pour vérifier l'APK :

```powershell
.\scripts\diagnose-apk.ps1
```

Ce script vérifie :
- ✅ La signature de l'APK
- ✅ L'alignement de l'APK
- ✅ Les informations du manifest
- ✅ La structure de l'APK
- ✅ Les certificats de signature

## Solutions possibles

### 1. Certificat DEBUG

**Problème** : L'APK est signé avec un certificat DEBUG, ce qui peut être rejeté par certains appareils.

**Solution** :
- Pour les tests locaux, c'est normal d'utiliser un certificat DEBUG
- Si votre appareil rejette les certificats DEBUG, vous pouvez :
  - Activer le mode développeur sur votre appareil
  - Utiliser un émulateur Android
  - Créer un certificat de release (voir ci-dessous)

### 2. Sources inconnues non activées

**Problème** : Android bloque l'installation d'APK provenant de sources inconnues.

**Solution** :
1. Allez dans **Paramètres** > **Sécurité**
2. Activez **Sources inconnues** ou **Installer des applications inconnues**
3. Sélectionnez votre navigateur/application de fichiers
4. Réessayez l'installation

### 3. Conflit avec une version précédente

**Problème** : Une version précédente de l'application est installée avec un certificat différent.

**Solution** :
```powershell
# Désinstaller l'ancienne version
adb uninstall com.popcorn.client.mobile

# Puis réinstaller le nouvel APK
adb install "D:\Github\popcorn-web\app\Popcorn_Mobile-v1.0.3.apk"
```

### 4. Architecture incompatible

**Problème** : L'APK est compilé pour arm64 mais votre appareil est 32-bit.

**Vérification** :
- Le diagnostic affiche `Native code: arm64-v8a`
- Votre appareil doit supporter arm64

**Solution** : Si votre appareil est 32-bit, vous devez compiler pour arm32.

### 5. Utiliser Android Studio Analyze APK

Pour une analyse complète de l'APK (recommandé par Google) :

1. Ouvrez **Android Studio**
2. Allez dans **Build** > **Analyze APK**
3. Sélectionnez votre APK : `D:\Github\popcorn-web\app\Popcorn_Mobile-v1.0.3.apk`
4. Vérifiez :
   - La taille des fichiers
   - Les certificats de signature
   - Les fichiers DEX
   - Les bibliothèques natives

### 6. Re-signer l'APK

Si l'APK semble corrompu, re-signez-le :

```powershell
.\scripts\fix-apk-signature.ps1 -ApkPath "D:\Github\popcorn-web\app\Popcorn_Mobile-v1.0.3.apk"
```

### 7. Vérifier avec adb

Installez l'APK via `adb` pour voir les erreurs détaillées :

```powershell
adb install "D:\Github\popcorn-web\app\Popcorn_Mobile-v1.0.3.apk"
```

Si l'installation échoue, `adb` affichera l'erreur exacte.

## Créer un certificat de release

Pour créer un certificat de release (nécessaire pour la production) :

```powershell
# Créer un keystore de release
keytool -genkeypair -v -keystore release.keystore -alias release -keyalg RSA -keysize 2048 -validity 10000

# Signer l'APK avec le certificat de release
# (nécessite de modifier les scripts de build pour utiliser ce keystore)
```

## Vérifications finales

Avant de signaler un problème, vérifiez :

- [ ] L'APK est signé (voir diagnostic section 1)
- [ ] L'APK est aligné (voir diagnostic section 2)
- [ ] Le package name est valide (voir diagnostic section 3)
- [ ] L'architecture correspond à votre appareil (arm64)
- [ ] Les "Sources inconnues" sont activées
- [ ] Aucune version précédente n'est installée avec un certificat différent
- [ ] Le certificat DEBUG est accepté par votre appareil (ou utilisez un certificat de release)

## Outils recommandés

- **Android Studio Analyze APK** : Analyse complète de l'APK
- **apkanalyzer** : Outil en ligne de commande (disponible dans build-tools 26.0.0+)
- **apksigner** : Vérification de la signature
- **adb** : Installation et diagnostic via USB

## Références

- [Analyser votre build avec l'analyseur d'APK](https://developer.android.com/studio/debug/apk-analyzer?hl=fr)
- [Signer votre application](https://developer.android.com/studio/publish/app-signing)
