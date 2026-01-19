# Système de Versioning

## Format de version

Le système utilise un format **X.Y.Z** (ex: `1.0.1`) pour les versions principales, avec un numéro de build séparé.

- **X** : Version majeure (changements incompatibles)
- **Y** : Version mineure (nouvelles fonctionnalités)
- **Z** : Version patch (corrections de bugs)
- **Build** : Numéro de build incrémenté à chaque compilation

## Fichiers de version

### Client (`popcorn-client/VERSION.json`)
```json
{
  "client": {
    "version": "1.0.1",
    "build": 1
  },
  "server": {
    "version": "1.0.1",
    "build": 1
  }
}
```

### Serveur (`popcorn-server/VERSION.json`)
Même structure que le client.

## Incrémentation automatique

### À chaque build Android
- Le numéro de **build** est automatiquement incrémenté
- La version principale (X.Y.Z) reste la même
- Format dans l'APK : `1.0.1` (version) avec `versionCode: 1` (build)

### Incrémentation manuelle de la version
Pour incrémenter la version principale (X.Y.Z), utilisez :
```powershell
# Dans popcorn-client/scripts/
. .\version-manager.ps1
Update-VersionMinor -Component "client"
```

## Fichiers mis à jour automatiquement

Lors d'un build Android, les fichiers suivants sont mis à jour :
- `src-tauri/tauri.android.mobile.conf.json` : `version` et `versionCode`
- `src-tauri/tauri.android.conf.json` : `version` et `versionCode`
- `VERSION.json` : `client.build` est incrémenté

## Variables d'environnement

Pendant le build, les variables suivantes sont définies :
- `PUBLIC_APP_VERSION` : Version principale (ex: `1.0.1`)
- `PUBLIC_APP_VERSION_CODE` : Numéro de build (ex: `1`)
- `PUBLIC_APP_VARIANT` : Variante (ex: `mobile` ou `tv`)

## Affichage dans l'application

La version est affichée dans :
- Le composant `Settings.tsx` : Version principale
- Le composant `Wizard.tsx` : Version principale + build

## Migration depuis l'ancien système

L'ancien format `0.1.0+73` a été remplacé par `1.0.1` (version) avec `versionCode: 1` (build).

Le nouveau système commence à **1.0.1** pour marquer la première version stable.
