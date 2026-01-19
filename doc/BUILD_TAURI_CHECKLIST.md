# ✅ Checklist Build Tauri Windows & Android

## 📋 Vérifications effectuées

### ✅ Configuration Tauri
- [x] `tauri.conf.json` configuré pour Windows
- [x] `tauri.android.conf.json` configuré pour Android TV
- [x] `tauri.android.mobile.conf.json` configuré pour Android Mobile
- [x] Scripts de build présents dans `package.json`
- [x] Icons présents pour toutes les plateformes

### ✅ Routes API
- [x] Script `build-tauri.js` déplace les routes API avant le build
- [x] Routes API exclues du build Tauri (mode static)
- [x] Configuration Astro en mode `output: 'static'` pour Tauri

### ✅ Modules Node.js
- [x] Stubs créés pour `crypto`, `fs`, `path`
- [x] Alias configurés dans `astro.config.mjs` pour rediriger vers les stubs
- [x] `uuid.ts` utilise Web Crypto API (compatible Tauri)
- [x] Polyfills configurés pour `process` uniquement

### ✅ Dépendances
- [x] `@libsql/client` - Utilisé uniquement dans les routes API (exclues)
- [x] `bcryptjs` - Utilisé uniquement dans les routes API (exclues)
- [x] `jsonwebtoken` - Utilisé uniquement dans `src/lib/auth/jwt.ts` (routes API serveur)
- [x] `jwt-client.ts` - Utilise Web Crypto API (compatible navigateur et Tauri)

## ⚠️ Points d'attention

### Modules Node.js dans les librairies
Les librairies suivantes utilisent des modules Node.js mais sont **uniquement importées dans les routes API** qui sont **exclues du build Tauri** :

- `src/lib/db/client.ts` - **SUPPRIMÉ** (plus d'accès DB côté client)
- `src/lib/db/turso-client.ts` - **SUPPRIMÉ** (plus d'accès DB côté client)
- `src/lib/auth/jwt.ts` - Utilise `jsonwebtoken` (Node.js) - **Uniquement dans routes API**
- `src/lib/auth/password.ts` - Utilise `bcryptjs` (bindings natifs) - **Uniquement dans routes API**

**✅ Solution** : Ces librairies ne sont jamais importées dans le code client (hors routes API), donc elles ne seront pas incluses dans le build Tauri.

**✅ JWT Client** : `server-api.ts` importe `jwt-client.ts` (Web Crypto API) au lieu de `jwt.ts` (jsonwebtoken), garantissant la compatibilité navigateur et Tauri.

### Stubs créés
Des stubs ont été créés pour éviter les erreurs d'import si ces modules étaient référencés indirectement :
- `src/lib/stubs/node-crypto.ts`
- `src/lib/stubs/node-fs.ts`
- `src/lib/stubs/node-path.ts`

## 🚀 Commandes de build

### Windows
```bash
npm run tauri:build:windows
```

### Android TV
```bash
npm run tauri:build:android-tv
```

### Android Mobile
```bash
npm run tauri:build:android-mobile
```

## 🔍 Vérifications avant build

1. **Routes API exclues** : Vérifier que `src/pages/api` est bien déplacé avant le build
2. **Pas d'imports Node.js** : Vérifier qu'aucun composant client n'importe les librairies Node.js
3. **Polyfills configurés** : Vérifier que les polyfills sont correctement configurés

## 📝 Notes importantes

- Les routes API sont **uniquement pour le build web** (serveur Astro)
- Le build Tauri est **100% statique** (pas de routes serveur)
- Tous les appels API se font vers le **backend Rust** ou le **serveur distant**
- Les modules Node.js ne sont **jamais exécutés** dans Tauri

## ✅ Conclusion

**Le build Tauri devrait fonctionner correctement** car :
1. Les routes API sont exclues du build
2. Les librairies Node.js ne sont utilisées que dans les routes API
3. Les tokens JWT côté client utilisent Web Crypto API (compatible Tauri)
4. Des stubs sont en place pour éviter les erreurs d'import
5. Web Crypto API est utilisé pour la génération d'IDs et les tokens JWT (compatible Tauri)
