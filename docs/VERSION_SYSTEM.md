# Système de Gestion des Versions

## 📋 Vue d'ensemble

Le système de versions affiche la version du client (Android, Web, Desktop) et du backend (Docker, local) sur la page Settings.

## 🔄 Flux de versions

### 1. Source de vérité : `VERSION.json`

Le fichier `VERSION.json` à la racine du projet est la source de vérité pour les versions :

```json
{
  "client": {
    "version": "1.0.29",
    "build": 29
  },
  "server": {
    "version": "1.0.2",
    "build": 2
  }
}
```

### 2. Workflow GitHub Actions

#### Étape 1 : Incrémentation automatique
- **Quand** : Sur push vers main/master (pas sur PR ni tags)
- **Action** : Incrémente `client.version` (patch) et `client.build` dans `VERSION.json`
- **Synchronisation** : Met à jour `src-tauri/tauri.android.mobile.conf.json` avec la nouvelle version

#### Étape 2 : Injection dans variables d'environnement
- **Action** : Lit `VERSION.json` et définit `PUBLIC_APP_VERSION` et `PUBLIC_APP_VERSION_CODE`
- **Utilisation** : Ces variables sont injectées dans le build Astro

#### Étape 3 : Copie dans public/
- **Action** : Copie `VERSION.json` dans `public/VERSION.json`
- **Résultat** : Accessible via `/VERSION.json` dans l'application

#### Étape 4 : Build Astro
- **Commande** : `npm run build`
- **Pré-build** : `prebuild` exécute `copy-version.js` (sécurité supplémentaire)
- **Variables** : `PUBLIC_APP_VERSION` et `PUBLIC_APP_VERSION_CODE` sont injectées

#### Étape 5 : Build Tauri
- **Commande** : `npm run tauri:build:android-mobile`
- **Config** : Utilise `tauri.android.mobile.conf.json` (version synchronisée)
- **Résultat** : L'APK/AAB contient la version correcte

## 📱 Récupération de la version client

### Ordre de priorité (dans VersionInfo.tsx)

1. **`/VERSION.json`** (depuis `public/VERSION.json`)
   - ✅ Source de vérité après build
   - ✅ Contient version ET build number
   - ✅ Disponible en production

2. **Commande Tauri `get-app-version`** (pour Android/Desktop)
   - ✅ Lit depuis `tauri.android.mobile.conf.json` (synchronisé avec VERSION.json)
   - ✅ Version exacte utilisée dans l'APK
   - ⚠️ Build number récupéré depuis `/VERSION.json` si disponible

3. **Variables d'environnement** (`import.meta.env.PUBLIC_APP_VERSION`)
   - ✅ Injectées pendant le build GitHub Actions
   - ✅ Fallback si VERSION.json n'est pas accessible
   - ⚠️ Disponibles seulement si injectées pendant le build

## 🔧 Récupération de la version backend

### Source : API Health

L'endpoint `/api/client/health` retourne maintenant :

```json
{
  "success": true,
  "data": {
    "status": "OK",
    "version": "1.0.2",
    "build": 2
  }
}
```

### Lecture depuis VERSION.json (backend)

Le backend Rust lit `VERSION.json` dans plusieurs emplacements :
- `/app/VERSION.json` (Docker - copié dans Dockerfile)
- `VERSION.json` (local - racine du projet)
- `../VERSION.json` (fallback)

### Workflow backend

1. **Build Docker** : `VERSION.json` est copié dans l'image
2. **Runtime** : L'endpoint health lit `VERSION.json` et retourne `server.version` et `server.build`
3. **Frontend** : Affiche la version depuis la réponse de l'API health

## ✅ Garanties de cohérence

### Pour le client Android

1. **Workflow GitHub** :
   - ✅ Incrémente `VERSION.json`
   - ✅ Synchronise vers `tauri.android.mobile.conf.json`
   - ✅ Copie `VERSION.json` dans `public/`
   - ✅ Injecte variables d'environnement

2. **Build Tauri** :
   - ✅ Utilise `tauri.android.mobile.conf.json` (version synchronisée)
   - ✅ Version dans l'APK = version dans VERSION.json

3. **Runtime** :
   - ✅ Commande `get-app-version` lit depuis config Tauri
   - ✅ `/VERSION.json` disponible depuis public/
   - ✅ Variables d'environnement disponibles si injectées

### Pour le backend Docker

1. **Build Docker** :
   - ✅ `VERSION.json` copié dans l'image (`/app/VERSION.json`)

2. **Runtime** :
   - ✅ Endpoint health lit `/app/VERSION.json`
   - ✅ Retourne `server.version` et `server.build`

## 🧪 Tests de validation

### Test 1 : Version client en production Android
- ✅ `/VERSION.json` doit être accessible
- ✅ Commande `get-app-version` doit retourner la version correcte
- ✅ Version affichée = version dans `tauri.android.mobile.conf.json`

### Test 2 : Version backend en production Docker
- ✅ Endpoint `/api/client/health` doit retourner version et build
- ✅ Version affichée = version dans `VERSION.json` du backend

### Test 3 : Cohérence workflow
- ✅ Version incrémentée dans workflow = version dans APK
- ✅ Version dans APK = version affichée dans Settings

## 📝 Notes importantes

1. **VERSION.json est la source de vérité** : Toutes les versions sont synchronisées depuis ce fichier
2. **Workflow GitHub incrémente automatiquement** : Pas besoin d'incrémenter manuellement
3. **Pour Android** : La version dans `tauri.android.mobile.conf.json` est synchronisée avec `VERSION.json` pendant le workflow
4. **Pour le backend** : `VERSION.json` est copié dans l'image Docker pour être accessible en runtime
5. **Fallback multiple** : Le composant VersionInfo essaie plusieurs sources pour garantir l'affichage

## 🔍 Dépannage

### Version client non affichée

1. Vérifier que `/VERSION.json` est accessible (dans `public/`)
2. Vérifier que `copy-version.js` a été exécuté (via `prebuild`)
3. Vérifier que les variables d'environnement sont injectées (workflow GitHub)
4. Pour Android : Vérifier que `get-app-version` fonctionne

### Version backend non affichée

1. Vérifier que le backend est accessible
2. Vérifier que `/api/client/health` retourne version et build
3. Vérifier que `VERSION.json` est présent dans l'image Docker (`/app/VERSION.json`)
