# Analyse de l'utilisation de la DB Client vs Backend

## Résumé
Ce document liste tous les endroits où la DB client (SQLite locale) est utilisée pour les indexers, et indique si elle devrait utiliser la DB backend (Rust) à la place.

## Fichiers analysés

### 1. `/api/v1/setup/indexers.ts` ✅ PARTIELLEMENT OK
**GET** - Récupère tous les indexers
- **Actuel**: Lit depuis la DB client
- **Recommandation**: OK pour l'UI, mais devrait aussi synchroniser avec le backend au chargement
- **Action**: Aucune action nécessaire (déjà synchronisé dans TorrentSyncManager)

**POST** - Crée un nouvel indexer
- **Actuel**: Crée dans la DB client, puis synchronise avec le backend (asynchrone)
- **Recommandation**: ✅ OK - La synchronisation est déjà en place
- **Action**: Aucune action nécessaire

### 2. `/api/v1/setup/indexers/[id].ts` ⚠️ À AMÉLIORER
**GET** - Récupère un indexer par ID
- **Actuel**: Lit depuis la DB client uniquement
- **Recommandation**: OK pour l'UI (source de vérité = DB client)
- **Action**: Aucune action nécessaire

**PUT** - Met à jour un indexer
- **Actuel**: Met à jour la DB client, puis synchronise avec le backend (asynchrone)
- **Recommandation**: ✅ OK - La synchronisation est déjà en place
- **Action**: Vérifier que la synchronisation inclut les catégories

**DELETE** - Supprime un indexer
- **Actuel**: Supprime de la DB client uniquement
- **Recommandation**: ⚠️ Devrait aussi supprimer du backend Rust
- **Action**: Ajouter la synchronisation de suppression vers le backend

### 3. `/api/v1/sync/start.ts` ✅ OK
**POST** - Démarre la synchronisation
- **Actuel**: Lit les indexers depuis la DB client, puis les synchronise vers le backend avant de démarrer la sync
- **Recommandation**: ✅ OK - C'est exactement ce qu'il faut faire
- **Action**: Aucune action nécessaire

### 4. `/api/v1/setup/status.ts` ⚠️ À VÉRIFIER
**GET** - Vérifie le statut du setup
- **Actuel**: Compte les indexers activés depuis la DB client
- **Recommandation**: OK pour l'UI (source de vérité = DB client)
- **Action**: Aucune action nécessaire

### 5. `/api/v1/setup/export-config.ts` ✅ OK
**GET** - Exporte la configuration
- **Actuel**: Lit depuis la DB client
- **Recommandation**: ✅ OK - L'export doit venir de la DB client (source de vérité)
- **Action**: Aucune action nécessaire

## Problèmes identifiés

### Problème 1: DELETE ne synchronise pas avec le backend ✅ RÉSOLU
**Fichier**: `src/pages/api/v1/setup/indexers/[id].ts`
**Ligne**: ~260
**Action requise**: ✅ FAIT - Ajout de la synchronisation de suppression vers le backend Rust
**Détails**: 
- Ajout de la méthode `delete_indexer` dans `backend/src/db/mod.rs`
- Ajout de la route `DELETE /api/client/admin/indexers/:id` dans le backend
- Ajout de la synchronisation asynchrone dans le DELETE du client

### Problème 2: Les catégories d'indexers
**Fichier**: `src/pages/api/v1/setup/indexers.ts`
**Ligne**: ~138
**Action requise**: Vérifier que les catégories sont bien synchronisées avec le backend lors de la création/mise à jour

## Recommandations générales

1. **Source de vérité**: La DB client reste la source de vérité pour l'UI et la configuration
2. **Synchronisation**: Toutes les modifications (CREATE, UPDATE, DELETE) doivent être synchronisées avec le backend Rust
3. **Lecture**: Les lectures peuvent rester depuis la DB client pour l'UI, mais les opérations de synchronisation doivent utiliser le backend

## Actions à prendre

1. ✅ **FAIT**: Synchronisation automatique dans `TorrentSyncManager` au chargement
2. ✅ **FAIT**: Ajout de la synchronisation de suppression dans DELETE
3. ✅ **FAIT**: Synchronisation lors de la création (POST)
4. ✅ **FAIT**: Synchronisation lors de la mise à jour (PUT)
5. ✅ **FAIT**: Synchronisation avant le démarrage de la sync (POST /sync/start)

## Résumé des modifications

### Backend Rust
- ✅ Ajout de `delete_indexer()` dans `backend/src/db/mod.rs`
- ✅ Ajout de la route `DELETE /api/client/admin/indexers/:id` dans `backend/src/server/routes/admin.rs`
- ✅ Route enregistrée dans `backend/src/server/mod.rs`

### Client (popcorn-client)
- ✅ Ajout de la synchronisation asynchrone de suppression dans `src/pages/api/v1/setup/indexers/[id].ts`
- ✅ Synchronisation automatique des indexers dans `TorrentSyncManager` au chargement et avant sync
