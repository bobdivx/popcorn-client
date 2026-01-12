# Migration de la base de données vers le serveur

## Résumé

Toutes les tables et données sont maintenant centralisées dans `popcorn-server/.data/local.db`.
Le client Astro utilise désormais la même base de données que le backend Rust.

## Modifications effectuées

### 1. `getDb()` pointe toujours vers la base du serveur

Le fichier `src/lib/db/client.ts` a été modifié pour que `getDb()` pointe toujours vers `popcorn-server/.data/local.db`, même quand on est dans `popcorn-client`.

### 2. Script de migration créé

Un script de migration a été créé : `scripts/migrate-db-to-server.ts`

Pour l'exécuter :
```bash
cd popcorn-client
npx tsx scripts/migrate-db-to-server.ts
```

Ce script migre toutes les données de `popcorn-client/.data/local.db` vers `popcorn-server/.data/local.db`.

### 3. Routes converties en proxies

Les routes suivantes ont été converties pour faire un proxy vers le backend Rust :
- ✅ `/api/v1/auth/login` → `/api/client/auth/login` (backend Rust)

### 4. Routes restantes utilisant la base de données directement

Les routes suivantes utilisent encore directement la base de données (à convertir en proxies si nécessaire) :
- `/api/v1/config/backend-url` - Nécessaire pour obtenir l'URL du backend (peut rester)
- `/api/v1/auth/register` - Doit être convertie en proxy vers `/api/client/auth/register`
- `/api/v1/auth/refresh` - Doit être convertie en proxy vers `/api/client/auth/refresh`
- `/api/v1/auth/me` - Doit être convertie en proxy vers `/api/client/auth/me`
- `lib/auth/roles.ts` - Utilise `getDb()` directement (doit utiliser l'API)

## Prochaines étapes

1. **Exécuter le script de migration** pour transférer les données existantes du client vers le serveur
2. **Créer les routes d'authentification dans le backend Rust** :
   - `/api/client/auth/login`
   - `/api/client/auth/register`
   - `/api/client/auth/refresh`
   - `/api/client/auth/me`
3. **Convertir les routes restantes** pour qu'elles fassent des proxies vers le backend Rust
4. **Supprimer les fichiers de schéma dupliqués** :
   - `popcorn-server/src/lib/db/schema.ts` (si le frontend du serveur n'est plus utilisé)

## Fichiers à supprimer après migration

- ✅ `popcorn-client/.data/local.db` - Aucune base de données client trouvée (déjà supprimée ou n'a jamais existé)
- `popcorn-server/src/lib/db/schema.ts` (si le frontend du serveur n'est plus utilisé) - À supprimer si le frontend Astro du serveur n'est plus utilisé

## Notes

- La base de données du client (`popcorn-client/.data/local.db`) peut être supprimée après la migration, car tout est maintenant dans la base du serveur.
- Le client Astro et le backend Rust partagent maintenant la même base de données (`popcorn-server/.data/local.db`).
- Les accès concurrents sont gérés par SQLite en mode WAL (Write-Ahead Logging), activé automatiquement par le backend Rust.
