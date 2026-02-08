/**
 * MÃ©thodes de synchronisation des torrents
 */

import type { ApiResponse } from './types.js';

interface ServerApiClientSyncAccess {
  backendRequest<T>(endpoint: string, options?: RequestInit): Promise<ApiResponse<T>>;
  getCurrentUserId(): string | null;
}

export const syncMethods = {
  async getSyncStatus(this: ServerApiClientSyncAccess): Promise<ApiResponse<any>> {
    const userId = this.getCurrentUserId();
    if (!userId) return { success: false, error: 'Unauthorized', message: 'Connecte-toi avant la sync.' };
    return this.backendRequest(`/api/sync/status?user_id=${encodeURIComponent(userId)}`, { method: 'GET' });
  },
  async startSync(this: ServerApiClientSyncAccess): Promise<ApiResponse<void>> {
    const userId = this.getCurrentUserId();
    if (!userId) return { success: false, error: 'Unauthorized', message: 'Connecte-toi avant la sync.' };
    return this.backendRequest<void>('/api/sync/start', {
      method: 'POST',
      body: JSON.stringify({ user_id: userId }),
    });
  },
  async stopSync(this: ServerApiClientSyncAccess): Promise<ApiResponse<void>> {
    return this.backendRequest<void>('/api/sync/reset', { method: 'POST' });
  },
  async getSyncSettings(this: ServerApiClientSyncAccess): Promise<ApiResponse<any>> {
    return this.backendRequest('/api/sync/settings', { method: 'GET' });
  },
  async updateSyncSettings(this: ServerApiClientSyncAccess, settings: any): Promise<ApiResponse<void>> {
    const payload: any = {};
    // Accepter snake_case (TorrentSyncManager) et camelCase (cloud-import)
    if (settings?.sync_frequency_minutes !== undefined) payload.sync_frequency_minutes = settings.sync_frequency_minutes;
    else if (settings?.syncFrequencyMinutes !== undefined) payload.sync_frequency_minutes = settings.syncFrequencyMinutes;
    if (settings?.is_enabled !== undefined) payload.is_enabled = settings.is_enabled;
    else if (settings?.isEnabled !== undefined) payload.is_enabled = settings.isEnabled;
    if (settings?.max_torrents_per_category !== undefined) payload.max_torrents_per_category = settings.max_torrents_per_category;
    else if (settings?.maxTorrentsPerCategory !== undefined) payload.max_torrents_per_category = settings.maxTorrentsPerCategory;
    if (settings?.rss_incremental_enabled !== undefined) payload.rss_incremental_enabled = settings.rss_incremental_enabled;
    else if (settings?.rssIncrementalEnabled !== undefined) payload.rss_incremental_enabled = settings.rssIncrementalEnabled;
    if (settings?.sync_queries_films !== undefined) payload.sync_queries_films = settings.sync_queries_films;
    else if (settings?.syncQueriesFilms !== undefined) payload.sync_queries_films = settings.syncQueriesFilms;
    if (settings?.sync_queries_series !== undefined) payload.sync_queries_series = settings.sync_queries_series;
    else if (settings?.syncQueriesSeries !== undefined) payload.sync_queries_series = settings.syncQueriesSeries;
    return this.backendRequest<void>('/api/sync/settings', {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  },
  async clearSyncTorrents(this: ServerApiClientSyncAccess): Promise<ApiResponse<number>> {
    const userId = this.getCurrentUserId();
    if (!userId) return { success: false, error: 'Unauthorized', message: 'Connecte-toi avant la sync.' };
    return this.backendRequest<number>('/api/sync/clear-torrents', {
      method: 'POST',
      body: JSON.stringify({ user_id: userId }),
    });
  },
  /** Debug : vérifie si un torrent est réellement téléchargeable (GET + Range, premier octet bencode). */
  async checkTorrentDownload(
    this: ServerApiClientSyncAccess,
    indexerId: string,
    torrentId: string,
  ): Promise<ApiResponse<{ downloadable: boolean; status_code: number; message: string; first_byte?: string }>> {
    return this.backendRequest(
      `/api/debug/check-torrent-download?indexer_id=${encodeURIComponent(indexerId)}&torrent_id=${encodeURIComponent(torrentId)}`,
      { method: 'GET' },
    );
  },
};