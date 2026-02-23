# Documentation popcorn-client

Ce dossier regroupe toute la documentation du projet.

## Contenu principal

| Catégorie | Fichiers |
|-----------|----------|
| **Build & déploiement** | BUILD_INSTRUCTIONS.md, BUILD_ANDROID.md, BUILD_TAURI_*, QUICK_START_DESKTOP.md, README-DESKTOP.md |
| **Android** | ANDROID_SIGNING.md, CONFIGURATION_ANDROID_BACKEND.md, INSTALLATION_ANDROID.md, PLAY_STORE_PUBLICATION.md, TROUBLESHOOTING_APK*.md |
| **WebOS** | WEBOS_QA_LG_CORRECTIONS.md (voir aussi dossier `popcorn-tauri/webos/`) |
| **Lucie (player)** | LUCIE_*.md |
| **Environnement** | README-ENV.md |
| **Scripts** | scripts/README-TEST-PLAY-CONSOLE.md (test Play Console) |

## Docker

Le **Dockerfile** et les fichiers associés (nginx, entrypoint) sont dans **`docker/`** à la racine du projet. Build depuis la racine : `docker build -f docker/Dockerfile .`

## Scripts

Les scripts (Android, WebOS, keystore, etc.) sont dans **`scripts/`**. Exemples depuis la racine :
- `npm run create:keystore` — créer un keystore Android
- `npm run encode:keystore` — encoder le keystore en base64
- `npm run android:build` — build APK Android
