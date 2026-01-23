# Popcorn Client - WebOS Application

Application WebOS pour téléviseurs LG.

## Structure

- `appinfo.json` : Configuration de l'application WebOS
- `frontend/` : Frontend Astro buildé (généré automatiquement)
- `icon.png` : Icône de l'application (80x80)
- `icon-large.png` : Grande icône (130x130)

## Build local

### Prérequis

- Node.js 20+
- npm
- WebOS SDK (optionnel, pour créer l'IPK localement)

### Étapes

1. **Build le frontend** :
   ```bash
   npm run build
   ```

2. **Préparer l'application WebOS** :
   ```bash
   npm run webos:build
   ```

3. **Créer l'IPK** (nécessite WebOS SDK) :
   ```bash
   npm run webos:package
   ```

   Ou manuellement :
   ```bash
   cd webos
   ares-package .
   ```

## Build avec Docker

Si vous n'avez pas WebOS SDK installé localement, vous pouvez utiliser Docker :

```bash
docker run --rm \
  -v "$(pwd)/webos:/workspace" \
  -w /workspace \
  ghcr.io/oddstr13/docker-tizen-webos-sdk:latest \
  ares-package .
```

## Installation sur TV WebOS

1. Activez le mode développeur sur votre TV LG WebOS
2. Installez l'application "Developer Mode" depuis le LG Content Store
3. Connectez votre TV au même réseau que votre ordinateur
4. Téléchargez le fichier `.ipk` depuis les releases GitHub
5. Installez l'IPK via :
   - Developer Mode (via l'interface de la TV)
   - Homebrew Channel (si installé)
   - `ares-install` (via ligne de commande)

## Développement

Pour tester l'application en développement :

1. Build le frontend : `npm run build`
2. Copiez `dist/` vers `webos/frontend/`
3. Utilisez `ares-inspect` pour déboguer :
   ```bash
   ares-inspect -d tv com.popcorn.client.webos
   ```

## Notes

- Le frontend est automatiquement copié depuis `dist/` lors du build
- La version est mise à jour automatiquement depuis `VERSION.json`
- Les icônes sont copiées depuis `src-tauri/icons/`
