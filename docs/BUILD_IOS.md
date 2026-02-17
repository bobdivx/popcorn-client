# Build iOS (iPhone / iPad)

Ce document décrit comment construire l’application Popcorn pour **iOS (iPhone / iPad)** en mode **production** ou **démo** (validation stores). **Apple TV (tvOS)** n’est pas supporté par Tauri et n’est pas couvert ici.

## Prérequis

- **macOS** : le build iOS nécessite Xcode et ne peut pas être exécuté sous Windows ou Linux.
- **Xcode** : installé depuis l’App Store, avec les outils en ligne de commande (`xcode-select --install` si besoin).
- **Node.js** (LTS, ex. 20) et **npm**.
- **Rust** : `rustup` avec la cible `aarch64-apple-ios` (`rustup target add aarch64-apple-ios`).
- **Compte Apple Developer** : requis pour la signature et la distribution sur l’App Store / TestFlight (optionnel pour un build local ou simulateur).

## Configuration

- La config Tauri iOS est dans **`src-tauri/tauri.ios.conf.json`** (identifiant `com.popcorn.client.ios`, capabilities `main` et `mobile`).
- La version est synchronisée avec **`VERSION.json`** (et éventuellement `tauri.ios.conf.json` / `bundle.iOS.bundleVersion`).

## Commandes de build (local, sur Mac)

Depuis la racine du projet :

| Commande | Description |
|----------|-------------|
| `npm run ios:build` | Build **production** (pas de backend démo). |
| `npm run ios:build:demo` | Build **démo** (backend de validation `https://popcorn-vercel.vercel.app`). |
| `npm run tauri:build:ios` | Même chose que `ios:build` (alias). |

Le script `build-tauri.js` (utilisé par `beforeBuildCommand`) reconnaît `TAURI_PLATFORM=ios` et construit le frontend Astro en mode static comme pour Android.

## Où trouver l’IPA

- **En local** : après `npm run ios:build` ou `npm run ios:build:demo`, l’IPA est généré par Tauri (souvent sous `src-tauri/gen/apple/` ou équivalent). Consulter la sortie de `tauri ios build` pour le chemin exact.
- **En CI (GitHub Actions)** : lancer le workflow **« iOS Build (IPA) »** (déclenchement manuel). L’IPA est publié en **artifact** nommé **`popcorn-ios-ipa`** (téléchargeable depuis la page du run).

## Workflow GitHub Actions

- **Fichier** : `.github/workflows/ios-build.yml`
- **Runner** : `macos-latest`
- **Déclenchement** : manuel uniquement (`workflow_dispatch`).
- **Paramètre** : **`build_mode`** = `production` ou `demo` (même logique qu’Android).
- **Étapes** : checkout, Node, lecture de la version, sync `tauri.ios.conf.json`, `npm ci`, build Astro (avec ou sans `PUBLIC_DEMO_BACKEND_URL`), installation de Rust + cible iOS, `tauri ios init` si besoin, `tauri ios build`, recherche de l’IPA, upload artifact.

La **signature** (certificats, provisioning) pour App Store / TestFlight n’est pas décrite ici ; à configurer plus tard via secrets GitHub et la doc Tauri [iOS Code Signing](https://v2.tauri.app/distribute/sign/ios).

## Rappel

- **Apple TV (tvOS)** : non supporté par Tauri ; à traiter plus tard (app native ou autre approche).
