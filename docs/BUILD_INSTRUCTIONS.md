# Instructions de Build - Application Desktop

## ✅ Application Desktop Prête

L'application desktop est maintenant complètement configurée dans `popcorn-vercel`.

## 🚀 Démarrage rapide

### Option 1 : Script PowerShell (Recommandé)

```powershell
# Développement
.\scripts\dev-desktop.ps1

# Build Windows
.\scripts\build-desktop.ps1 windows
```

### Option 2 : Commandes npm directes

```bash
# Développement
npm run tauri:dev

# Build Windows
npm run tauri:build:windows
```

## 📋 Vérification pré-build

Avant de compiler, vérifiez que :

1. ✅ **Node.js 20+** est installé
   ```bash
   node --version
   ```

2. ✅ **Rust** est installé
   ```bash
   rustc --version
   ```

3. ✅ **Dépendances npm** sont installées
   ```bash
   npm install
   ```

4. ✅ **Tauri CLI** est disponible
   ```bash
   npm run tauri -- --version
   ```

## 🏗️ Structure créée

```
popcorn-vercel/
├── src-tauri/
│   ├── src/
│   │   └── main.rs              ✅ Point d'entrée (sans backend)
│   ├── Cargo.toml                ✅ Dépendances Rust minimales
│   ├── build.rs                  ✅ Script de build
│   ├── tauri.conf.json           ✅ Config desktop
│   ├── tauri.android.conf.json   ✅ Config Android TV
│   ├── tauri.android.mobile.conf.json ✅ Config Android Mobile
│   └── icons/                    ✅ Icônes
├── scripts/
│   ├── build-desktop.ps1         ✅ Script de build
│   └── dev-desktop.ps1           ✅ Script de dev
└── src/
    ├── lib/client/server-api.ts  ✅ Client API
    ├── lib/encryption/e2e.ts     ✅ Chiffrement E2E
    ├── components/               ✅ Composants UI
    └── pages/                    ✅ Pages (search, library, player, settings)
```

## 🎯 Fonctionnalités

- ✅ Interface utilisateur complète
- ✅ Authentification avec refresh automatique
- ✅ Recherche de contenu
- ✅ Bibliothèque avec chiffrement E2E
- ✅ Lecteur vidéo (streaming HLS)
- ✅ Configuration du serveur
- ✅ Préférences utilisateur

## 📦 Résultat du build

Après compilation, l'application sera dans :
- **Windows** : `src-tauri/target/x86_64-pc-windows-msvc/release/bundle/`
  - `.exe` : Exécutable portable
  - `msi/` : Installateur MSI
  - `nsis/` : Installateur NSIS

## 🔧 Configuration

### URL du serveur

1. **Via `.env`** :
   ```env
   PUBLIC_SERVER_URL=http://votre-serveur:8080
   ```

2. **Via l'interface** :
   - Ouvrir l'application
   - Aller dans Paramètres
   - Configurer l'URL du serveur

## ⚠️ Notes importantes

- **Client léger uniquement** : Pas de backend intégré
- **Connexion serveur requise** : L'application doit se connecter au serveur `popcorn`
- **Taille réduite** : ~30-50MB (vs ~100MB+ pour le serveur complet)

## 🐛 Dépannage

### Erreur "Rust not found"
```bash
# Installer Rust
winget install Rustlang.Rustup
# Ou
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

### Erreur "Tauri CLI not found"
```bash
npm install
```

### Erreur de build Windows
- Installer Visual Studio Build Tools
- Installer Windows SDK

## 📚 Documentation

- [Guide de démarrage rapide](./QUICK_START_DESKTOP.md)
- [Documentation complète](./README-DESKTOP.md)
- [Architecture](./c:\Users\auber\.cursor\plans\architecture_client-serveur_popcorn_avec_chiffrement_e2e_77e5e81a.plan.md)
