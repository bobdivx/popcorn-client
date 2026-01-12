# Application Desktop Popcorn Client

Application desktop légère pour se connecter au serveur Popcorn distant.

## Architecture

Cette application est un **client léger** qui :
- ✅ Affiche l'interface utilisateur (Astro + Preact)
- ✅ Communique avec le serveur via API REST
- ✅ Gère l'authentification et les tokens
- ✅ Chiffre/déchiffre les métadonnées sensibles (E2E)
- ❌ **NE contient PAS** de logique métier (torrents, indexers, streaming)
- ❌ **NE contient PAS** de backend intégré

Toute la logique métier est gérée par le serveur `popcorn` distant.

## Prérequis

- Node.js 20+
- Rust (pour Tauri)
- Windows SDK (pour Windows)

## Installation des dépendances

```bash
npm install
```

## Développement

### Mode développement (avec hot reload)

```bash
npm run tauri:dev
```

L'application s'ouvrira automatiquement avec hot reload.

## Build

### Windows (MSI/NSIS)

```bash
npm run tauri:build:windows
```

L'application sera générée dans :
- `src-tauri/target/x86_64-pc-windows-msvc/release/bundle/msi/`
- `src-tauri/target/x86_64-pc-windows-msvc/release/bundle/nsis/`

### Linux

```bash
npm run tauri:build
```

### macOS

```bash
npm run tauri:build
```

## Configuration du serveur

L'application doit être configurée pour se connecter au serveur Popcorn :

1. **Via variable d'environnement** :
   - Créer un fichier `.env` avec :
     ```
     PUBLIC_SERVER_URL=http://votre-serveur:8080
     ```

2. **Via l'interface** :
   - L'utilisateur peut configurer l'URL du serveur dans les paramètres

## Structure

```
popcorn-vercel/
├── src-tauri/          # Configuration Tauri
│   ├── src/
│   │   └── main.rs     # Point d'entrée (sans backend)
│   ├── Cargo.toml      # Dépendances Rust minimales
│   └── tauri.conf.json # Configuration desktop
├── src/
│   ├── lib/
│   │   ├── client/     # Client API REST
│   │   ├── encryption/ # Chiffrement E2E
│   │   └── storage/    # Stockage local minimal
│   ├── components/     # Composants Preact
│   └── pages/          # Pages Astro
└── package.json
```

## Différences avec popcorn (serveur)

| Aspect | popcorn (serveur) | popcorn-vercel (client) |
|--------|-------------------|-------------------------|
| Backend intégré | ✅ Oui (librqbit) | ❌ Non |
| Taille | ~100MB+ | ~30-50MB |
| Dépendances Rust | Nombreuses | Minimales |
| Usage | Serveur complet | Client léger uniquement |

## Support

Pour toute question, consultez la documentation dans `/docs`.
