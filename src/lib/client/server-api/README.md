# Structure modulaire de ServerApiClient

Ce dossier contient les modules modulaires du client API, organisés par domaine fonctionnel.

## Structure

- `types.ts` - Types et interfaces (ré-exports depuis `../types.js`)
- `auth.ts` - Authentification (register, login, loginCloud, registerCloud, logout, getMe)
- `media.ts` - Recherche et streaming (search, getTorrentGroup, getTorrentById, getStream)
- `library.ts` - Bibliothèque et favoris (getLibrary, addToLibrary, removeFromLibrary, getFavorites, addFavorite, removeFavorite)
- `health.ts` - Health check et setup (checkServerHealth, getSetupStatus)
- `indexers.ts` - Gestion des indexers (getIndexers, createIndexer, updateIndexer, deleteIndexer, testIndexer, catégories, etc.)
- `settings.ts` - Configuration (getTmdbKey, saveTmdbKey, deleteTmdbKey, testTmdbKey, getClientTorrentConfig)
- `sync.ts` - Synchronisation des torrents (getSyncStatus, startSync, stopSync, getSyncSettings, updateSyncSettings, clearSyncTorrents)
- `dashboard.ts` - Dashboard, films, séries (getDashboardData, getFilmsData, getSeriesData)

## Architecture

Les méthodes HTTP core (`nativeFetch`, `backendRequest`, `handleResponse`, `getTimeoutMs`) et les méthodes de stockage (`saveUser`, `getUser`, `loadTokens`, `saveTokens`, `clearTokens`, `generateClientTokens`) restent dans la classe principale `ServerApiClient` car elles sont utilisées par tous les modules.

Les méthodes publiques de chaque module sont assemblées via `Object.assign(ServerApiClient.prototype, ...)` dans `server-api.ts`.

## Note

Le fichier principal `server-api.ts` reste dans le dossier parent (`../server-api.ts`) pour la compatibilité avec les imports existants. Il importe tous les modules et assemble les méthodes au prototype de la classe.
