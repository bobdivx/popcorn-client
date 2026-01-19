# Dépannage - Installation APK Android

## Problème : "Package non valide" ou "Impossible d'installer l'application"

Si vous recevez une erreur indiquant que le package n'est pas valide lors de l'installation sur votre mobile, suivez ces étapes :

### 1. Vérifier l'APK

Exécutez le script de diagnostic pour vérifier que l'APK est valide :

```powershell
.\scripts\diagnose-apk.ps1
```

Cela vérifiera :
- La signature de l'APK
- L'alignement de l'APK
- Les informations du manifest
- La structure de l'APK

### 2. Activer les "Sources inconnues"

Sur Android, vous devez autoriser l'installation d'applications depuis des sources inconnues :

1. Allez dans **Paramètres** > **Sécurité**
2. Activez **Sources inconnues** ou **Installer des applications inconnues**
3. Si vous utilisez Android 8+, vous devrez peut-être autoriser l'application de gestion de fichiers que vous utilisez

### 3. Désinstaller l'ancienne version

Si une version précédente de l'application est installée avec une signature différente, vous devez la désinstaller d'abord :

```powershell
# Via ADB (si votre mobile est connecté)
adb uninstall com.popcorn.client.mobile

# Ou manuellement depuis le mobile
Paramètres > Applications > Popcorn Mobile > Désinstaller
```

### 4. Vérifier l'architecture

L'APK est compilé pour **arm64-v8a** (64-bit). Vérifiez que votre appareil supporte cette architecture :

- La plupart des appareils Android modernes (2017+) supportent arm64
- Si votre appareil est 32-bit uniquement, vous devrez compiler pour une autre architecture

### 5. Re-signer l'APK

Si l'APK semble corrompu ou mal signé, vous pouvez le re-signer :

```powershell
.\scripts\fix-apk-signature.ps1
```

Ou avec un chemin spécifique :

```powershell
.\scripts\fix-apk-signature.ps1 -ApkPath "D:\Github\popcorn-web\app\Popcorn_Mobile-v0.1.0_69-android-mobile.apk"
```

### 6. Vérifier l'espace de stockage

Assurez-vous que votre appareil a suffisamment d'espace libre (au moins 50 MB).

### 7. Transférer l'APK correctement

Si vous transférez l'APK via USB ou réseau :

- Utilisez le mode de transfert de fichiers (MTP)
- Évitez de modifier l'APK pendant le transfert
- Vérifiez que le fichier n'est pas corrompu après le transfert

### 8. Installation via ADB (recommandé)

Pour éviter les problèmes de transfert, utilisez ADB directement :

```powershell
# Connecter votre mobile via USB avec le débogage USB activé
.\scripts\android\install\install.ps1 mobile
```

### 9. Vérifier les logs Android

Si le problème persiste, vérifiez les logs Android pour plus de détails :

```powershell
adb logcat | Select-String -Pattern "PackageManager|INSTALL"
```

### 10. Rebuild l'APK

Si rien ne fonctionne, reconstruisez l'APK depuis le début :

```powershell
.\scripts\build-android.ps1 mobile
```

## Erreurs courantes

### "INSTALL_FAILED_INVALID_APK"
- L'APK est corrompu ou mal signé
- Solution : Re-signer l'APK avec `fix-apk-signature.ps1`

### "INSTALL_FAILED_UPDATE_INCOMPATIBLE"
- Une version avec une signature différente est déjà installée
- Solution : Désinstaller l'ancienne version d'abord

### "INSTALL_FAILED_INSUFFICIENT_STORAGE"
- Pas assez d'espace de stockage
- Solution : Libérer de l'espace sur l'appareil

### "INSTALL_PARSE_FAILED_NO_CERTIFICATES"
- L'APK n'est pas signé
- Solution : Re-signer l'APK avec `fix-apk-signature.ps1`

## Scripts utiles

- `diagnose-apk.ps1` : Diagnostic complet de l'APK
- `fix-apk-signature.ps1` : Re-signer un APK
- `scripts\android\install\install.ps1` : Installation automatique via ADB
