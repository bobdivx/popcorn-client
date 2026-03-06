/**
 * Sync cloud → instance : paramètres de synchronisation (backend Rust).
 */

import { serverApi } from '../client/server-api.js';
import type { UserConfig } from '../api/popcorn-web.js';
import type { SyncResult } from './types.js';

export async function applySyncSettingsFromCloud(
  config: Pick<UserConfig, 'syncSettings'>,
  _onProgress?: (message: string) => void
): Promise<SyncResult> {
  const s = config.syncSettings;
  if (!s) return { type: 'syncSettings', success: true };

  const payload: Record<string, unknown> = {};
  if (typeof s.syncEnabled === 'boolean') payload.is_enabled = s.syncEnabled ? 1 : 0;
  if (typeof s.syncFrequencyMinutes === 'number') payload.sync_frequency_minutes = s.syncFrequencyMinutes;
  if (typeof s.maxTorrentsPerCategory === 'number') payload.max_torrents_per_category = s.maxTorrentsPerCategory;
  if (typeof s.rssIncrementalEnabled === 'boolean') payload.rss_incremental_enabled = s.rssIncrementalEnabled ? 1 : 0;
  if (Array.isArray(s.syncQueriesFilms)) payload.sync_queries_films = s.syncQueriesFilms;
  if (Array.isArray(s.syncQueriesSeries)) payload.sync_queries_series = s.syncQueriesSeries;

  if (Object.keys(payload).length === 0) {
    return { type: 'syncSettings', success: true };
  }

  const res = await serverApi.updateSyncSettings(payload);
  if (!res.success) {
    return {
      type: 'syncSettings',
      success: false,
      error: res.message || res.error || 'Erreur import paramètres de synchronisation',
    };
  }
  return { type: 'syncSettings', success: true };
}
