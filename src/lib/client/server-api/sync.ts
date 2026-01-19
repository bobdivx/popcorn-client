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
    if (settings?.syncFrequencyMinutes !== undefined) payload.sync_frequency_minutes = settings.syncFrequencyMinutes;
    if (settings?.isEnabled !== undefined) payload.is_enabled = settings.isEnabled;
    if (settings?.maxTorrentsPerCategory !== undefined) payload.max_torrents_per_category = settings.maxTorrentsPerCategory;
    if (settings?.rssIncrementalEnabled !== undefined) payload.rss_incremental_enabled = settings.rssIncrementalEnabled;
    if (settings?.syncQueriesFilms !== undefined) payload.sync_queries_films = settings.syncQueriesFilms;
    if (settings?.syncQueriesSeries !== undefined) payload.sync_queries_series = settings.syncQueriesSeries;
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
};