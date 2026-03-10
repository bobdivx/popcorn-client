# Popcorn Client

Client web léger pour le projet **Popcorn**, basé sur **Astro + Preact**.  
Il se connecte à un **serveur Popcorn distant** (projet `popcorn-server`) via une API HTTP.

## 🎯 Objectif et architecture

Cette application :

- ✅ Affiche l’interface utilisateur (Astro + Preact)
- ✅ Communique avec le serveur Popcorn via API REST
- ✅ Gère l’authentification et les tokens JWT
- ✅ Chiffre/déchiffre certaines métadonnées côté client
- ❌ **Ne contient pas** de logique BitTorrent (torrents, indexers, streaming)
- ❌ **Ne contient pas** de backend intégré

Toute la logique métier est dans le dépôt **`popcorn-server`**.

## 🚀 Scénarios de déploiement

### 1. Stack complète via Docker Compose (recommandé)

Ce scénario déploie **client + serveur** avec Docker en utilisant le dépôt `popcorn-server`.

1. Cloner les dépôts dans le même dossier parent :

```bash
cd /chemin/vers/vos-projets
git clone https://github.com/USERNAME/popcorn-server.git
git clone https://github.com/USERNAME/popcorn-client.git
```

2. Se placer dans le dossier `popcorn-server/docker` :

```bash
cd popcorn-server/docker
```

3. Créer les répertoires de données (côté serveur) :

```bash
mkdir -p ../data/.data ../data/downloads ../data/transcode_cache
```

4. (Optionnel) Créer un fichier `.env` à côté de `docker-compose.yml` pour configurer quelques variables :

```env
PUBLIC_BACKEND_URL=http://192.168.1.10:3000   # URL du backend vue par les navigateurs
API_USERNAME=admin
API_PASSWORD=motdepasse-solide
TZ=Europe/Paris
PUID=1000
PGID=1000
```

5. Lancer la stack :

```bash
docker compose -f docker-compose.yml up -d
```

- Interface web : `http://localhost:4325` (ou l’IP/port de votre machine)
- API backend : `http://localhost:3000`

> Pour le détail fin de la configuration Docker (volumes, reverse proxy, etc.), voir la documentation de `popcorn-server`.

### 2. Déploiement du client seul (backend déjà existant)

Si vous avez déjà un backend Popcorn accessible publiquement (Docker, serveur dédié, NAS…), vous pouvez déployer ce client indépendamment.

#### 2.1. Déploiement statique (Vercel ou autre hébergeur)

1. Prérequis :
   - Node.js 20+
   - npm

2. Installer les dépendances :

```bash
npm install
```

3. Créer un fichier `.env` à la racine :

```env
# URL publique de votre backend Popcorn
PUBLIC_SERVER_URL=http://votre-backend:3000
```

4. Builder le site :

```bash
npm run build
```

5. Déployer le contenu du dossier `dist/` sur votre hébergeur statique (Vercel, Netlify, nginx, etc.).

#### 2.2. Image Docker du client

Le dépôt fournit un `Dockerfile` (dossier `docker/`) qui construit une image nginx servant le build Astro.

Depuis la racine du dépôt :

```bash
docker build -f docker/Dockerfile -t popcorn-client .

docker run -d \
  -p 8080:80 \
  -e PUBLIC_BACKEND_URL=http://votre-backend:3000 \
  --name popcorn-client \
  popcorn-client
```

- Interface web : `http://localhost:8080`

## 💻 Développement local

1. Installer les dépendances :

```bash
npm install
```

2. Créer un fichier `.env` :

```env
PUBLIC_SERVER_URL=http://localhost:3000
```

3. Lancer le mode développement :

```bash
npm run dev
```

Par défaut, l’interface sera disponible sur `http://localhost:4326` (voir `package.json`).

## 📁 Structure principale

```
popcorn-client/
├── docs/               # Documentation utilisateur / technique
├── docker/             # Dockerfile, nginx.conf, entrypoint pour le client
├── scripts/            # Scripts internes (CI, outils dev, etc.)
├── src-tauri/          # Configuration Tauri (usage interne, non documenté ici)
├── src/
│   ├── lib/
│   ├── components/
│   └── pages/
└── package.json
```

## 🔐 Sécurité (côté client)

- **Authentification** : JWT (access + refresh tokens)
- **Chiffrement** : certaines métadonnées sensibles sont chiffrées côté client (WebCrypto)
- **Stockage local** : utilisation de `localStorage` pour les tokens et préférences

## 📚 Documentation associée

- Configuration des variables d’environnement : `docs/README-ENV.md`
- Déploiement Docker complet (client + serveur) : voir la documentation de `popcorn-server`

