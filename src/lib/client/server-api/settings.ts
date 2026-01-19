/**
 * MÃ©thodes de configuration (TMDB, torrent config)
 */

import type { ApiResponse } from './types.js';

interface ServerApiClientSettingsAccess {
  backendRequest<T>(endpoint: string, options?: RequestInit): Promise<ApiResponse<T>>;
  getCurrentUserId(): string | null;
}

export const settingsMethods = {
  async getTmdbKey(this: ServerApiClientSettingsAccess): Promise<ApiResponse<{ apiKey: string | null; hasKey: boolean }>> {
    const userId = this.getCurrentUserId();
    if (!userId) {
      return { success: true, data: { apiKey: null, hasKey: false } };
    }
    const res = await this.backendRequest<any>('/api/tmdb/key', {
      method: 'GET',
      headers: { 'X-User-ID': userId },
    });
    if (!res.success) return res as ApiResponse<{ apiKey: string | null; hasKey: boolean }>;
    const hasKey = (res.data as any)?.has_key === true || (res.data as any)?.has_key === 1;
    return { success: true, data: { apiKey: null, hasKey } };
  },
  async saveTmdbKey(this: ServerApiClientSettingsAccess, key: string): Promise<ApiResponse<void>> {
    const userId = this.getCurrentUserId();
    if (!userId) {
      return { success: false, error: 'Unauthorized', message: 'Connecte-toi avant de configurer TMDB.' };
    }
    const res = await this.backendRequest('/api/tmdb/key', {
      method: 'POST',
      headers: { 'X-User-ID': userId },
      body: JSON.stringify({ api_key: key }),
    });
    if (!res.success) return res as ApiResponse<void>;
    return { success: true };
  },
  async deleteTmdbKey(this: ServerApiClientSettingsAccess): Promise<ApiResponse<void>> {
    const userId = this.getCurrentUserId();
    if (!userId) return { success: true };
    const res = await this.backendRequest('/api/tmdb/key', {
      method: 'DELETE',
      headers: { 'X-User-ID': userId },
    });
    if (!res.success) return res as ApiResponse<void>;
    return { success: true };
  },
  async testTmdbKey(this: ServerApiClientSettingsAccess): Promise<ApiResponse<{ valid: boolean; message?: string }>> {
    const userId = this.getCurrentUserId();
    if (!userId) return { success: true, data: { valid: false, message: 'Non authentifiÃ©' } };
    const hasKeyRes = await this.backendRequest<any>('/api/tmdb/key', {
      method: 'GET',
      headers: { 'X-User-ID': userId },
    });
    if (!hasKeyRes.success) return hasKeyRes as ApiResponse<{ valid: boolean; message?: string }>;
    const hasKey = (hasKeyRes.data as any)?.has_key === true || (hasKeyRes.data as any)?.has_key === 1;
    return { success: true, data: { valid: !!hasKey, message: hasKey ? undefined : 'ClÃ© TMDB non configurÃ©e' } };
  },
  async getClientTorrentConfig(this: ServerApiClientSettingsAccess): Promise<ApiResponse<{ config: { download_dir: string; max_downloads: number; max_upload_slots: number; librqbit_api_url: string; }; download_paths: { films_path: string; films_exists: boolean; films_subdirs_count: number; series_path: string; series_exists: boolean; series_subdirs_count: number; stream_temp_path: string; stream_temp_exists: boolean; }; subdirectory_creation: { enabled: boolean; description: string; example: string; }; }>> {
    return this.backendRequest('/api/admin/client-torrent/config', { method: 'GET' });
  },
};