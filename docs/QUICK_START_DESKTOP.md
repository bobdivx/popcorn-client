# Guide de démarrage rapide - Application Desktop

## 🚀 Démarrage rapide

### 1. Installation des dépendances

```bash
cd popcorn-vercel
npm install
```

### 2. Configuration du serveur (optionnel)

Créez un fichier `.env` à la racine de `popcorn-vercel` :

```env
PUBLIC_SERVER_URL=http://localhost:8080
```

Ou configurez l'URL du serveur via l'interface de l'application.

### 3. Développement

```bash
npm run tauri:dev
```

L'application s'ouvrira automatiquement avec hot reload.

### 4. Build pour Windows

```bash
npm run tauri:build:windows
```

L'application sera générée dans :
- `src-tauri/target/x86_64-pc-windows-msvc/release/bundle/msi/` (installateur MSI)
- `src-tauri/target/x86_64-pc-windows-msvc/release/bundle/nsis/` (installateur NSIS)

## 📋 Prérequis

- **Node.js** 20+ : [nodejs.org](https://nodejs.org/)
- **Rust** : [rustup.rs](https://rustup.rs/)
- **Windows SDK** (pour Windows) : Inclus avec Visual Studio Build Tools

### Installation de Rust

```bash
# Windows (PowerShell)
winget install Rustlang.Rustup

# Ou via rustup.rs
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

### Vérification

```bash
node --version  # Doit être >= 20
rustc --version # Doit être installé
```

## 🏗️ Structure de l'application

```
popcorn-vercel/
├── src-tauri/              # Application Tauri (desktop)
│   ├── src/main.rs         # Point d'entrée Rust
│   ├── Cargo.toml          # Dépendances Rust
│   └── tauri.conf.json     # Configuration
├── src/
│   ├── lib/
│   │   ├── client/         # Client API REST
│   │   ├── encryption/     # Chiffrement E2E
│   │   └── storage/        # Stockage local
│   ├── components/         # Composants Preact
│   └── pages/              # Pages Astro
└── package.json
```

## 🔧 Commandes disponibles

| Commande | Description |
|----------|-------------|
| `npm run dev` | Développement web (Astro) |
| `npm run tauri:dev` | Développement desktop avec hot reload |
| `npm run tauri:build` | Build desktop (plateforme actuelle) |
| `npm run tauri:build:windows` | Build Windows (.exe, .msi, .nsis) |
| `npm run build` | Build Astro uniquement |

## 📱 Première utilisation

1. **Lancer l'application** : `npm run tauri:dev`
2. **Se connecter** : Utilisez vos identifiants du serveur Popcorn
3. **Configurer le serveur** : Si nécessaire, configurez l'URL du serveur dans les paramètres

## 🐛 Dépannage

### Erreur "Rust not found"
- Installez Rust via [rustup.rs](https://rustup.rs/)
- Redémarrez le terminal

### Erreur "Tauri CLI not found"
```bash
npm install -g @tauri-apps/cli
```

### Erreur de build Windows
- Installez Visual Studio Build Tools
- Installez le Windows SDK

### L'application ne se connecte pas au serveur
- Vérifiez que le serveur Popcorn est démarré
- Vérifiez l'URL dans `.env` ou les paramètres
- Vérifiez les logs dans la console

## 📚 Documentation

- [Documentation Tauri](https://tauri.app/)
- [Documentation Astro](https://docs.astro.build/)
- [Architecture complète](../../popcorn/doc/ARCHITECTURE_CLOUD_BACKEND.md)
