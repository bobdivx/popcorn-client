# Popcorn Client - Application Client Léger

Application client légère pour se connecter au serveur Popcorn distant. **Aucun backend intégré, aucune dépendance Docker.**

## 🎯 Architecture

Cette application est un **client léger pur** qui :

- ✅ Affiche l'interface utilisateur (Astro + Preact)
- ✅ Communique avec le serveur Popcorn via API REST
- ✅ Gère l'authentification et les tokens JWT
- ✅ Chiffre/déchiffre les métadonnées sensibles (E2E côté client)
- ❌ **NE contient PAS** de logique métier (torrents, indexers, streaming)
- ❌ **NE contient PAS** de backend intégré
- ❌ **NE nécessite PAS** Docker

Toute la logique métier est gérée par le serveur `popcorn` distant.

## 📦 Formats de déploiement

- **Desktop** : Application Tauri (Windows, Linux, macOS)
- **Web** : Site Astro déployable sur Vercel
- **Android** : Application Tauri (TV et Mobile)
- **WebOS** : Application WebOS (téléviseurs LG)

## 🚀 Installation

```bash
npm install
```

## 🔧 Configuration

### Variables d'environnement

Créez un fichier `.env` à la racine :

```env
# URL du serveur Popcorn (OBLIGATOIRE)
PUBLIC_SERVER_URL=http://10.1.0.86:8080
```

**Note** : Vous pouvez aussi configurer l'URL du serveur dans l'interface (page Paramètres).

### Ports par défaut

- **Serveur Popcorn (backend)** : Port `8080` (par défaut)
- **Client Astro (dev web)** : Port `4321` (uniquement pour le développement web)

## 💻 Développement

### Mode développement web

```bash
npm run dev
```

Ouvre `http://localhost:4321`

### Mode développement desktop (Tauri)

```bash
npm run tauri:dev
```

Ouvre l'application desktop avec hot reload.

## 🏗️ Build

### Desktop (Windows)

```bash
npm run tauri:build:windows
```

L'application sera générée dans :
- `src-tauri/target/x86_64-pc-windows-msvc/release/bundle/msi/`
- `src-tauri/target/x86_64-pc-windows-msvc/release/bundle/nsis/`

### Web (Vercel)

```bash
npm run build
```

Déployez le dossier `dist/` sur Vercel.

### Android

```bash
# Android TV
npm run tauri:build:android-tv

# Android Mobile
npm run tauri:build:android-mobile
```

### WebOS

```bash
# Préparer l'application WebOS (sans créer l'IPK)
npm run webos:build

# Builder l'IPK (nécessite WebOS SDK ou Docker)
npm run webos:package
```

**Note** : Pour créer l'IPK, vous devez avoir installé WebOS SDK ou utiliser Docker. Le workflow GitHub Actions crée automatiquement l'IPK lors des pushes sur `main` ou les tags `v*`.

#### Installation sur TV WebOS

1. Activez le mode développeur sur votre TV LG WebOS
2. Installez l'application Developer Mode depuis le LG Content Store
3. Téléchargez le fichier `.ipk` depuis les releases GitHub
4. Installez l'IPK via Developer Mode ou via l'application Homebrew Channel

## 📁 Structure

```
popcorn-vercel/
├── src-tauri/          # Configuration Tauri (desktop/mobile)
│   ├── src/main.rs     # Point d'entrée Rust (minimal)
│   └── tauri.conf.json # Configuration Tauri
├── webos/              # Application WebOS
│   ├── appinfo.json    # Configuration WebOS
│   ├── frontend/       # Frontend Astro buildé
│   └── icon.png        # Icône de l'application
├── src/
│   ├── lib/
│   │   ├── client/     # Client API REST (server-api.ts)
│   │   ├── encryption/ # Chiffrement E2E (e2e.ts)
│   │   └── storage/    # Stockage local (storage.ts)
│   ├── components/     # Composants Preact
│   └── pages/          # Pages Astro
└── package.json
```

## 🔐 Sécurité

- **Authentification** : JWT (access + refresh tokens)
- **Chiffrement E2E** : WebCrypto API pour les métadonnées sensibles
- **Stockage local** : localStorage pour les tokens et préférences

## ⚠️ Important

- **Connexion serveur requise** : L'application doit se connecter au serveur `popcorn` distant
- **Pas de backend** : Aucune logique serveur dans ce projet
- **Taille réduite** : ~30-50MB (vs ~100MB+ pour le serveur complet)

## 📚 Documentation

- [Configuration des variables d'environnement](./README-ENV.md)
- [Instructions de build desktop](./BUILD_INSTRUCTIONS.md)
- [Guide de démarrage rapide desktop](./QUICK_START_DESKTOP.md)

## 🆚 Différences avec popcorn (serveur)

| Aspect | popcorn (serveur) | popcorn-vercel (client) |
|--------|-------------------|-------------------------|
| Backend intégré | ✅ Oui (librqbit) | ❌ Non |
| Docker requis | ✅ Oui | ❌ Non |
| Base de données | ✅ Turso/SQLite | ❌ Non |
| Authentification serveur | ✅ Oui | ❌ Non |
| Taille | ~100MB+ | ~30-50MB |
| Usage | Serveur complet | Client léger uniquement |
