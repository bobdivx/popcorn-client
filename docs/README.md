# Documentation popcorn-client

Ce dossier regroupe la **documentation utile pour l’utilisation publique** du client Popcorn.

L’objectif est de se concentrer sur :

- Le **lien avec le backend** (`popcorn-server`)
- La **configuration des URLs** et des variables d’environnement
- Les **scénarios de déploiement web** (statique / Docker) déjà décrits dans les README

## Fichiers principaux

| Catégorie | Fichiers |
|-----------|----------|
| **Environnement** | `README-ENV.md` – variables d’environnement côté client |
| **Architecture / UI** | `DESIGN_SYSTEM.md`, autres documents d’architecture ou de design éventuellement présents |

Les anciennes documentations spécifiques **Android, Windows, WebOS, Tauri desktop, Play Store** ont été retirées ou ne sont plus référencées ici afin de garder une doc publique simple et centrée sur le **client web**.

## Docker (rappel)

Le **Dockerfile** et les fichiers associés (nginx, entrypoint) sont dans `docker/` à la racine du projet.  
Build depuis la racine :

```bash
docker build -f docker/Dockerfile -t popcorn-client .
```

## Lien avec la stack complète

Pour le déploiement complet (client + serveur via Docker Compose), se référer au dépôt `popcorn-server` et à son dossier `docs/deployment/`.
