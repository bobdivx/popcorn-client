/**
 * Utilitaires pour synchroniser automatiquement la configuration vers le cloud
 */

import { serverApi } from '../client/server-api';
import { saveUserConfigMerge, saveCloudMediaRequests, saveCloudMediaFavorites, type CloudMediaRequest, type CloudMediaFavorite } from '../api/popcorn-web';
import { TokenManager } from '../client/storage';
import { isTmdbKeyMaskedOrInvalid } from './tmdb-key';
import { getLibraryDisplayConfig } from './library-display-config';

/**
 * Synchronise automatiquement tous les indexers et leurs catégories vers le cloud
 * Cette fonction est appelée après chaque modification d'indexer ou de catégories
 */
export async function syncIndexersToCloud(): Promise<void> {
  try {
    // Vérifier qu'un token cloud est disponible
    const cloudToken = TokenManager.getCloudAccessToken();
    if (!cloudToken) {
      console.log('[CLOUD SYNC] ℹ️ Aucun token cloud disponible, synchronisation ignorée');
      return;
    }

    console.log('[CLOUD SYNC] 🔄 Début de la synchronisation des indexers vers le cloud...');

    // 1. Récupérer tous les indexers depuis le backend
    const indexersResponse = await serverApi.getIndexers();
    if (!indexersResponse.success || !indexersResponse.data) {
      console.warn('[CLOUD SYNC] ⚠️ Impossible de récupérer les indexers:', indexersResponse.message);
      return;
    }

    const indexers = indexersResponse.data;
    console.log(`[CLOUD SYNC] 📋 ${indexers.length} indexer(s) trouvé(s)`);

    // 2. Récupérer les catégories pour chaque indexer
    const indexerCategories: Record<string, { enabled: boolean; genres?: number[] }> = {};
    
    for (const indexer of indexers) {
      if (indexer.id) {
        try {
          const categoriesResponse = await serverApi.getIndexerCategories(indexer.id);
          if (categoriesResponse.success && categoriesResponse.data) {
            indexerCategories[indexer.id] = categoriesResponse.data;
          }
        } catch (catError) {
          console.warn(`[CLOUD SYNC] ⚠️ Impossible de récupérer les catégories pour ${indexer.name}:`, catError);
        }
      }
    }

    // 3. Récupérer la clé TMDB (si disponible et valide)
    let tmdbApiKey: string | null = null;
    try {
    const tmdbResponse = await serverApi.getTmdbKeyExport();
      if (tmdbResponse.success && tmdbResponse.data?.apiKey) {
        const key = tmdbResponse.data.apiKey;
        // Ne jamais sauvegarder une clé masquée
        if (!isTmdbKeyMaskedOrInvalid(key)) {
          tmdbApiKey = key;
        }
      }
    } catch (tmdbError) {
      console.warn('[CLOUD SYNC] ⚠️ Impossible de récupérer la clé TMDB:', tmdbError);
    }

    // 4. Préparer la configuration à sauvegarder
    const configToSave = {
      indexers: indexers.map(indexer => ({
        id: indexer.id,
        name: indexer.name,
        baseUrl: indexer.baseUrl,
        apiKey: indexer.apiKey || null,
        jackettIndexerName: indexer.jackettIndexerName || null,
        isEnabled: indexer.isEnabled,
        isDefault: indexer.isDefault,
        priority: indexer.priority || 0,
        indexerTypeId: indexer.indexerTypeId || null,
        configJson: indexer.configJson || null,
      })),
      indexerCategories: Object.keys(indexerCategories).length > 0 ? indexerCategories : null,
      tmdbApiKey,
    };

    // 5. Sauvegarder dans le cloud
    // Important: ne pas écraser la config cloud avec un payload partiel (indexers-only, etc.)
    const saveResult = await saveUserConfigMerge(configToSave, cloudToken);
    
    if (saveResult?.success) {
      console.log('[CLOUD SYNC] ✅ Configuration synchronisée vers le cloud avec succès');
    } else {
      console.warn('[CLOUD SYNC] ⚠️ Impossible de synchroniser vers le cloud:', saveResult?.message);
    }

    await syncMediaRequestsToCloud();
    await syncFavoritesToCloud();
  } catch (error) {
    // Ne pas bloquer l'application si la synchronisation échoue
    console.warn('[CLOUD SYNC] ⚠️ Erreur lors de la synchronisation vers le cloud:', error);
  }
}

/**
 * Pousse les demandes de médias (backend) vers le cloud.
 * Appelé après sync indexers ou depuis la page Demandes.
 */
export async function syncMediaRequestsToCloud(): Promise<void> {
  try {
    const cloudToken = TokenManager.getCloudAccessToken();
    if (!cloudToken) return;

    const res = await serverApi.listMediaRequests({ limit: 500 });
    if (!res.success || !res.data) return;

    const list: CloudMediaRequest[] = res.data.map((r) => ({
      id: r.id,
      tmdb_id: r.tmdb_id,
      media_type: r.media_type,
      status: r.status,
      requested_by: r.requested_by,
      modified_by: r.modified_by ?? null,
      season_numbers: r.season_numbers ?? null,
      notes: r.notes ?? null,
      created_at: r.created_at,
      updated_at: r.updated_at,
    }));

    const saveResult = await saveCloudMediaRequests(list, cloudToken);
    if (saveResult.success) {
      console.log('[CLOUD SYNC] ✅ Demandes de médias sauvegardées dans le cloud');
    }
  } catch (error) {
    console.warn('[CLOUD SYNC] ⚠️ Erreur sauvegarde cloud des demandes:', error);
  }
}

/**
 * Pousse les favoris (à regarder plus tard) du backend vers le cloud.
 */
export async function syncFavoritesToCloud(): Promise<void> {
  try {
    const cloudToken = TokenManager.getCloudAccessToken();
    if (!cloudToken) return;

    const res = await serverApi.listMediaFavorites({ limit: 500 });
    if (!res.success || !res.data) return;

    const list: CloudMediaFavorite[] = res.data.map((f) => ({
      id: f.id,
      tmdb_id: f.tmdb_id,
      tmdb_type: f.tmdb_type,
      category: f.category,
      created_at: f.created_at,
    }));

    const saveResult = await saveCloudMediaFavorites(list, cloudToken);
    if (saveResult.success) {
      console.log('[CLOUD SYNC] ✅ Favoris (à regarder plus tard) sauvegardés dans le cloud');
    }
  } catch (error) {
    console.warn('[CLOUD SYNC] ⚠️ Erreur sync favoris:', error);
  }
}

/**
 * Synchronise les paramètres de sync (fréquence, RSS incrémental, etc.) vers le cloud.
 * Récupère la config cloud actuelle, fusionne les paramètres du backend, puis sauvegarde.
 */
export async function syncSyncSettingsToCloud(): Promise<void> {
  try {
    const cloudToken = TokenManager.getCloudAccessToken();
    if (!cloudToken) {
      console.log('[CLOUD SYNC] ℹ️ Aucun token cloud, paramètres de sync non poussés');
      return;
    }

    const settingsRes = await serverApi.getSyncSettings();
    if (!settingsRes.success || !settingsRes.data) {
      console.warn('[CLOUD SYNC] ⚠️ Impossible de récupérer les paramètres de sync:', settingsRes.message);
      return;
    }

    const s = settingsRes.data;
    const lib = getLibraryDisplayConfig();
    const syncSettings = {
      syncEnabled: (s as { is_enabled?: number }).is_enabled !== 0,
      syncFrequencyMinutes: (s as { sync_frequency_minutes?: number }).sync_frequency_minutes,
      maxTorrentsPerCategory: (s as { max_torrents_per_category?: number }).max_torrents_per_category,
      rssIncrementalEnabled: (s as { rss_incremental_enabled?: number }).rss_incremental_enabled !== 0,
      syncQueriesFilms: Array.isArray((s as { sync_queries_films?: string[] }).sync_queries_films)
        ? (s as { sync_queries_films: string[] }).sync_queries_films
        : [],
      syncQueriesSeries: Array.isArray((s as { sync_queries_series?: string[] }).sync_queries_series)
        ? (s as { sync_queries_series: string[] }).sync_queries_series
        : [],
      libraryDisplay: {
        showZeroSeedTorrents: lib.showZeroSeedTorrents,
        torrentsInitialLimit: lib.torrentsInitialLimit,
        torrentsLoadMoreLimit: lib.torrentsLoadMoreLimit,
        torrentsRecentLimit: lib.torrentsRecentLimit,
        mediaLanguages: lib.mediaLanguages.length > 0 ? lib.mediaLanguages : undefined,
        minQuality: lib.minQuality || undefined,
      },
    };

    const saveResult = await saveUserConfigMerge({ syncSettings }, cloudToken);
    if (saveResult?.success) {
      console.log('[CLOUD SYNC] ✅ Paramètres de synchronisation sauvegardés dans le cloud');
    } else {
      console.warn('[CLOUD SYNC] ⚠️ Échec sauvegarde cloud des paramètres de sync:', saveResult?.message);
    }
  } catch (error) {
    console.warn('[CLOUD SYNC] ⚠️ Erreur lors de la sauvegarde des paramètres de sync vers le cloud:', error);
  }
}
