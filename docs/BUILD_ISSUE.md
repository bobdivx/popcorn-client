# Problème de Build Tauri

## Problème

Lors du build Astro pour Tauri, l'erreur suivante apparaît :
```
[NoAdapterInstalled] Cannot use server-rendered pages without an adapter.
```

## Cause

Astro détecte des pages serveur même en mode `output: 'static'`. Cela peut être dû à :
1. Des routes API dans `src/pages/api/` qui sont détectées par Astro
2. Un cache Astro qui garde les anciennes routes
3. Des imports ou fonctionnalités serveur dans certaines pages

## Solutions tentées

1. ✅ Masquage des routes API avant le build
2. ✅ Configuration Tauri séparée (`astro.config.tauri.mjs`)
3. ✅ Nettoyage du cache Astro
4. ✅ Variable d'environnement `TAURI_PLATFORM=desktop`

## Solution recommandée

Le problème semble venir du fait qu'Astro scanne les fichiers avant que le masquage ne soit effectué, ou qu'il y a un cache quelque part.

### Option 1 : Utiliser un dossier séparé pour les routes API

Déplacer les routes API dans un dossier qui n'est pas scanné par Astro en mode Tauri :
- Créer `src/api-routes/` (hors du dossier `pages`)
- Les routes API ne seront pas détectées par Astro

### Option 2 : Utiliser `.astroignore`

Créer un fichier `.astroignore` qui exclut les routes API du build Tauri.

### Option 3 : Build conditionnel dans `astro.config.mjs`

Utiliser une fonction de configuration qui exclut dynamiquement les routes API.

## État actuel

- ✅ Script de build créé (`scripts/build-tauri.js`)
- ✅ Configuration Tauri créée (`astro.config.tauri.mjs`)
- ✅ Masquage des routes API fonctionnel
- ❌ Build Astro échoue toujours avec l'erreur d'adapter

## Prochaines étapes

1. Vérifier s'il y a d'autres fichiers qui utilisent des fonctionnalités serveur
2. Essayer de déplacer les routes API hors du dossier `pages`
3. Utiliser une approche différente pour exclure les routes API
