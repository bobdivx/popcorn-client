/**
 * Synchronisation instance ↔ cloud.
 *
 * Un module par type de donnée :
 * - indexers   : indexers cloud → backend
 * - tmdb       : clé TMDB cloud → backend
 * - categories : catégories d'indexers cloud → backend (après indexers)
 * - downloadLocation : emplacement cloud → préférences locales
 * - syncSettings    : paramètres de sync cloud → backend
 * - language   : langue cloud → préférences locales
 *
 * Utilisé par CloudImportManager (import au login / étape Bienvenue).
 * Les modules sont réutilisables pour d'autres flux (ex. sync manuelle, export/import).
 */

import type { UserConfig } from '../api/popcorn-web.js';
import type { SyncResult } from './types.js';
import { applyIndexersFromCloud } from './indexers.js';
import { applyTmdbFromCloud } from './tmdb.js';
import { applyCategoriesFromCloud } from './categories.js';
import { applyDownloadLocationFromCloud } from './download-location.js';
import { applySyncSettingsFromCloud } from './sync-settings.js';
import { applyLanguageFromCloud } from './language.js';
import { applyPlaybackSettingsFromCloud } from './playback-settings.js';
import { applyMediaRequestsFromCloud } from './media-requests.js';
import { serverApi } from '../client/server-api.js';

export type { SyncResult, SyncType, SyncProgressCallback, SyncInput } from './types.js';
export { applyIndexersFromCloud } from './indexers.js';
export { applyTmdbFromCloud } from './tmdb.js';
export { applyCategoriesFromCloud } from './categories.js';
export { applyDownloadLocationFromCloud } from './download-location.js';
export { applySyncSettingsFromCloud } from './sync-settings.js';
export { applyLanguageFromCloud } from './language.js';
export { applyPlaybackSettingsFromCloud } from './playback-settings.js';
export { applyMediaRequestsFromCloud } from './media-requests.js';

export interface RunAllFromCloudOptions {
  config: UserConfig;
  onProgress: (message: string, doneIncrement?: number) => void;
  onDoneIncrement?: (n: number) => void;
}

/**
 * Applique toute la config cloud vers l'instance (backend + préférences locales).
 * Ordre : indexers → catégories → TMDB → downloadLocation → syncSettings → language.
 */
export async function runAllFromCloud(options: RunAllFromCloudOptions): Promise<{
  success: boolean;
  results: SyncResult[];
  error?: string;
}> {
  const { config, onProgress, onDoneIncrement } = options;
  const results: SyncResult[] = [];

  const health = await serverApi.checkServerHealth();
  if (!health.success) {
    return {
      success: false,
      results: [],
      error: health.message || health.error || 'Backend non accessible',
    };
  }

  const inc = (n = 1) => onDoneIncrement?.(n);

  if (config.indexers?.length) {
    const res = await applyIndexersFromCloud(config, (msg, done) => {
      onProgress(msg);
      if (done !== undefined) inc(done);
    });
    results.push(res);
    if (!res.success) {
      return { success: false, results, error: res.error };
    }
  }

  if (config.indexerCategories && Object.keys(config.indexerCategories).length > 0) {
    onProgress('Import catégories d\'indexers…');
    const res = await applyCategoriesFromCloud(config, onProgress);
    results.push(res);
    if (!res.success) {
      return { success: false, results, error: res.error };
    }
    inc(1);
  }

  if (config.tmdbApiKey) {
    onProgress('Import clé TMDB…');
    const res = await applyTmdbFromCloud(config.tmdbApiKey, onProgress);
    results.push(res);
    inc(1);
  }

  if (config.downloadLocation) {
    onProgress('Import emplacement de téléchargement…');
    const res = await applyDownloadLocationFromCloud(config.downloadLocation, onProgress);
    results.push(res);
    inc(1);
  }

  if (config.syncSettings) {
    onProgress('Import paramètres de synchronisation…');
    const res = await applySyncSettingsFromCloud(config, onProgress);
    results.push(res);
    if (!res.success) {
      return { success: false, results, error: res.error };
    }
    inc(1);
  }

  if (config.language) {
    onProgress('Import préférence de langue…');
    const res = await applyLanguageFromCloud(config.language, onProgress);
    results.push(res);
    inc(1);
  }

  if (config.playbackSettings && typeof config.playbackSettings === 'object') {
    onProgress('Import paramètres de lecture…');
    const res = await applyPlaybackSettingsFromCloud(config, onProgress);
    results.push(res);
    if (!res.success) {
      return { success: false, results, error: res.error };
    }
    inc(1);
  }

  onProgress('Import demandes de médias…');
  const resRequests = await applyMediaRequestsFromCloud(onProgress);
  results.push(resRequests);
  inc(1);

  return { success: true, results };
}
