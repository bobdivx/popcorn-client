# Migration DB (terminée) — backend uniquement

## Résumé

Toutes les données sont **centralisées et manipulées via l’API du backend Rust** (DB unique dans `popcorn-server/.data/local.db`).

Le client Astro **n’accède plus directement** à SQLite/Turso (suppression de `src/lib/db/client.ts`). Toutes les routes `src/pages/api/**` agissent comme **proxies HTTP** vers le backend.

## Modifications effectuées

- **Suppression de la DB côté client**: plus aucun `getDb()` / `db.execute()` dans `popcorn-client`. Le dossier `src/lib/db/` a été supprimé.
- **Auth migrée**: `/api/v1/auth/*` proxy vers le backend (`/api/client/auth/*`).
- **Setup/Indexers/TMDB migrés**: routes `setup/*`, `sync/*` ne touchent plus de DB côté client.
- **Routes backend créées**: `/api/client/auth/login`, `/api/client/auth/register`, `/api/client/auth/users/:id`, etc.

## Notes

- La DB “client” n’existe plus: tout passe par l’API backend.
- Les scripts de migration “client → serveur” ne sont plus nécessaires.

