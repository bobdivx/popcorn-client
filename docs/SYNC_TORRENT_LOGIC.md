# Logique de synchronisation torrent

Ce document décrit la logique complète de la synchronisation des torrents (indexers → base locale) : flux, erreurs, option RSS incrémental, et statut unifié côté client.

## 1. Démarrage d’une synchronisation

- **Qui** : l’utilisateur lance une sync manuelle (tous les indexers ou une sélection) depuis la page Paramètres > Synchronisation.
- **Backend** :
  - Vérification : au moins un indexer activé, clé TMDB configurée et valide.
  - Si une sync est déjà en cours (`sync_in_progress = 1`) → refus (409).
  - Réinitialisation de la progression en mémoire, puis `sync_in_progress = 1`, `sync_start_time = now`.
  - Lancement de la tâche en arrière-plan (tokio::spawn).
- **Retour** : le client reçoit « Synchronisation démarrée » et peut interroger `GET /api/sync/status` pour la progression.

## 2. Retour des erreurs (externe / indexers)

- **Pendant la sync** :
  - Erreurs par indexer/catégorie (timeout, erreur API, 0 torrent) sont poussées dans `progress.errors` (backend).
  - « 0 torrent » : si un indexer ne retourne aucun torrent pour une catégorie, une erreur explicite est ajoutée : *« L'indexer « X » n'a retourné aucun torrent pour la catégorie « Y ». Vérifiez la configuration ou l'API de l'indexer. »*
- **API** : `GET /api/sync/status` renvoie `progress.errors` (liste de chaînes).
- **Client** :
  - Page Sync : cartes indexeurs en erreur (style rouge), modale « Détails » avec les dernières erreurs (ex. 3 dernières).
  - Les erreurs sont donc visibles et traçables pour l’utilisateur.

## 3. Option « Flux RSS incrémental »

- **Paramètre** : `rss_incremental_enabled` (sync_settings).
- **Comportement** :
  - **Activé** :
    - On charge le **curseur** par (user_id, indexer_id, catégorie) : `get_sync_cursor_last_seen_key`.
    - Si un curseur existe : on ne récupère que les **nouveaux** éléments du flux RSS (jusqu’à atteindre le dernier élément déjà vu → arrêt du rattrapage). Nombre de pages RSS limité (ex. 5) pour le rattrapage.
    - Si pas de curseur (première sync ou curseurs réinitialisés) : **récupération complète** du flux (nombre de pages plus élevé).
    - Après chaque récupération RSS : mise à jour du curseur `upsert_sync_cursor_last_seen_key`.
  - **Désactivé** : pas de curseur (`last_seen = None`) → **toujours une récupération complète** du flux à chaque sync.
- **Cas particulier** : si l’utilisateur n’a plus aucun média synchronisé (ex. base vidée), les curseurs sont réinitialisés pour la prochaine sync (récupération complète).

En résumé : **avec RSS incrémental activé, après la première sync, seuls les nouveaux ajouts du flux RSS sont récupérés** ; sans option ou sans curseur, tout le flux est resynchronisé.

## 4. Arrêt de la synchronisation

- **Client** : bouton « Arrêter » → `POST /api/sync/reset`.
- **Backend** : `reset_sync_status` met `sync_in_progress = 0`, `sync_start_time = None` en base et **réinitialise la progression en mémoire** (`sync_progress`). La tâche en arrière-plan peut encore tourner un temps, mais le statut exposé par l’API reflète immédiatement l’arrêt.
- **Client** : mise à jour optimiste (plus de progression sur les cartes) + rechargement du statut.

## 5. Statut unifié côté client

- **Store** : `sync-status-store` est la **seule source de vérité** pour le statut de sync (polling partagé, un seul intervalle).
- **Consommateurs** :
  - **Navbar** : icône Paramètres avec anneau de progression (sync en cours).
  - **Page Paramètres > Vue d’ensemble** : carte Synchronisation (en cours / dernière date / nombre d’indexers).
  - **Page Synchronisation** : TorrentSyncManager lit le store et appelle `refresh()` après start/stop/update.
  - **Dashboard / useSyncStatus** : même store pour cohérence partout.
- Ainsi, le statut est **unifié** et réutilisable (header, overview, page sync, dashboard).
