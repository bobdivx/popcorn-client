/**
 * Méthodes de configuration (TMDB, torrent config)
 */

import type { ApiResponse } from './types.js';
import { isTmdbKeyMaskedOrInvalid } from '../../utils/tmdb-key.js';

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
    const maskedKey = (res.data as any)?.masked_key as string | undefined;
    return { success: true, data: { apiKey: maskedKey || null, hasKey } };
  },
  async getTmdbKeyExport(this: ServerApiClientSettingsAccess): Promise<ApiResponse<{ apiKey: string | null; hasKey: boolean }>> {
    const userId = this.getCurrentUserId();
    if (!userId) {
      return { success: true, data: { apiKey: null, hasKey: false } };
    }
    const res = await this.backendRequest<any>('/api/tmdb/key/export', {
      method: 'GET',
      headers: { 'X-User-ID': userId },
    });
    if (!res.success) return res as ApiResponse<{ apiKey: string | null; hasKey: boolean }>;
    const hasKey = (res.data as any)?.has_key === true || (res.data as any)?.has_key === 1;
    const apiKey = (res.data as any)?.api_key as string | undefined;
    return { success: true, data: { apiKey: apiKey || null, hasKey } };
  },
  async saveTmdbKey(this: ServerApiClientSettingsAccess, key: string): Promise<ApiResponse<void>> {
    const userId = this.getCurrentUserId();
    if (!userId) {
      return { success: false, error: 'Unauthorized', message: 'Connecte-toi avant de configurer TMDB.' };
    }
    // Nettoyer la clé avant de l'envoyer (trim, supprimer les espaces)
    const cleanedKey = key.trim().replace(/\s+/g, '');
    if (!cleanedKey) {
      return { success: false, error: 'ValidationError', message: 'La clé API TMDB ne peut pas être vide' };
    }
    if (isTmdbKeyMaskedOrInvalid(cleanedKey)) {
      return { success: false, error: 'ValidationError', message: 'Clé masquée ou invalide. Entrez la clé complète (32 caractères) depuis https://www.themoviedb.org/settings/api' };
    }

    // Logger pour diagnostic (masqué)
    const keyPreview = cleanedKey.length > 8 
      ? `${cleanedKey.substring(0, 4)}...${cleanedKey.substring(cleanedKey.length - 4)}`
      : '****';
    console.log(`[TMDB] Sauvegarde clé TMDB (longueur: ${cleanedKey.length}, preview: ${keyPreview})`);

    const res = await this.backendRequest('/api/tmdb/key', {
      method: 'POST',
      headers: { 'X-User-ID': userId },
      body: JSON.stringify({ api_key: cleanedKey }),
    });

    if (!res.success) {
      // Améliorer le message d'erreur pour les erreurs de validation
      if (res.message?.includes('invalide') || res.message?.includes('401') || res.message?.includes('403')) {
        return {
          success: false,
          error: res.error || 'ValidationError',
          message: res.message || 'La clé API TMDB est invalide. Vérifiez qu\'il s\'agit bien d\'une clé v3 "API Key" (32 caractères) depuis https://www.themoviedb.org/settings/api',
        };
      }
      return res as ApiResponse<void>;
    }
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

  /** GET /api/client/config/media-paths — chemins par type (films, séries), style Jellyfin */
  async getMediaPaths(this: ServerApiClientSettingsAccess): Promise<ApiResponse<{
    download_dir_root: string;
    films_path: string | null;
    series_path: string | null;
    default_path: string | null;
    films_root: string;
    series_root: string;
  }>> {
    return this.backendRequest('/api/client/config/media-paths', { method: 'GET' });
  },

  /** PUT /api/client/config/media-paths — met à jour les chemins (relatifs à download_dir_root) */
  async putMediaPaths(this: ServerApiClientSettingsAccess, body: {
    films_path?: string | null;
    series_path?: string | null;
    default_path?: string | null;
  }): Promise<ApiResponse<{
    download_dir_root: string;
    films_path: string | null;
    series_path: string | null;
    default_path: string | null;
    films_root: string;
    series_root: string;
  }>> {
    return this.backendRequest('/api/client/config/media-paths', {
      method: 'PUT',
      body: JSON.stringify(body),
    });
  },

  /** GET /api/explorer/files — liste dossiers/fichiers (path optionnel, relatif à download_dir) */
  async listExplorerFiles(this: ServerApiClientSettingsAccess, path?: string): Promise<ApiResponse<Array<{
    name: string;
    path: string;
    is_directory: boolean;
    size?: number;
    modified?: number;
  }>>> {
    const url = path != null && path !== ''
      ? `/api/explorer/files?path=${encodeURIComponent(path)}`
      : '/api/explorer/files';
    return this.backendRequest(url, { method: 'GET' });
  },
};