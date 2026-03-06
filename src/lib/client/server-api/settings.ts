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

  /** GET /api/admin/tracker-mode/config — état du mode compatibilité tracker */
  async getRatioConfig(this: ServerApiClientSettingsAccess): Promise<ApiResponse<{ mode_enabled: boolean; source: string }>> {
    return this.backendRequest('/api/admin/tracker-mode/config', { method: 'GET' });
  },
  /** PUT /api/admin/tracker-mode/config — active/désactive le mode (session en cours) */
  async updateRatioConfig(this: ServerApiClientSettingsAccess, mode_enabled: boolean): Promise<ApiResponse<{ mode_enabled: boolean; source: string }>> {
    return this.backendRequest('/api/admin/tracker-mode/config', {
      method: 'PUT',
      body: JSON.stringify({ mode_enabled }),
    });
  },
  /** GET /api/admin/tracker-mode/stats — stats agrégées (upload, download, ratio) et liste torrents */
  async getRatioStats(this: ServerApiClientSettingsAccess): Promise<ApiResponse<{
    total_uploaded_bytes: number;
    total_downloaded_bytes: number;
    ratio: number;
    torrent_count: number;
    seeding_count: number;
    torrents: Array<{
      info_hash: string;
      name: string;
      state: string;
      progress: number;
      uploaded_bytes: number;
      downloaded_bytes: number;
      ratio: number;
    }>;
  }>> {
    return this.backendRequest('/api/admin/tracker-mode/stats', { method: 'GET' });
  },
  /** GET /api/admin/tracker-mode/torrents/:info_hash/trackers — URLs des trackers pour un torrent (indexer) */
  async getRatioTorrentTrackers(this: ServerApiClientSettingsAccess, infoHash: string): Promise<ApiResponse<{ tracker_urls: string[]; debug_librqbit_keys?: string[] }>> {
    const hash = infoHash.trim().toLowerCase();
    if (hash.length !== 40) return { success: false, error: 'ValidationError', message: 'info_hash doit faire 40 caractères' };
    const url = `/api/admin/tracker-mode/torrents/${encodeURIComponent(hash)}/trackers`;
    console.log('[Ratio] getRatioTorrentTrackers request:', { infoHash: hash, url });
    const res = await this.backendRequest(url, { method: 'GET' });
    console.log('[Ratio] getRatioTorrentTrackers response:', { success: res.success, data: res.data, error: res.error, message: res.message });
    if (res.success && res.data?.debug_librqbit_keys) {
      console.warn('[Ratio] Aucun tracker renvoyé par l’API. Clés reçues de librqbit:', res.data.debug_librqbit_keys, res.data.debug_librqbit_keys?.includes('trackers') ? '(contient "trackers" mais liste vide)' : '(clé "trackers" absente → binaire librqbit peut-être pas à jour)');
    }
    return res;
  },
  /** POST /api/client/torrents/:id_or_info_hash/trackers — ajoute une URL de tracker au torrent (ex. C411). Utilisé au prochain resume/start. */
  async addClientTracker(this: ServerApiClientSettingsAccess, infoHash: string, trackerUrl: string): Promise<ApiResponse<void>> {
    const hash = infoHash.trim();
    const url = trackerUrl.trim();
    if (hash.length === 0) return { success: false, error: 'ValidationError', message: 'info_hash requis' };
    if (url.length === 0) return { success: false, error: 'ValidationError', message: 'tracker_url requis' };
    return this.backendRequest(`/api/client/torrents/${encodeURIComponent(hash)}/trackers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tracker_url: url }),
    });
  },
  /** GET /api/client/torrents/:info_hash/trackers — liste des URLs de trackers pour ce torrent (pour vérifier qu'un ajout a bien été pris en compte). */
  async getClientTorrentTrackers(this: ServerApiClientSettingsAccess, infoHash: string): Promise<ApiResponse<{ trackers: string[] }>> {
    const hash = infoHash.trim();
    if (hash.length === 0) return { success: false, error: 'ValidationError', message: 'info_hash requis' };
    return this.backendRequest(`/api/client/torrents/${encodeURIComponent(hash)}/trackers`, { method: 'GET' });
  },
  /** GET /api/client/torrents — liste des torrents du client (librqbit) pour affichage dans Réglages. */
  async getClientTorrents(this: ServerApiClientSettingsAccess): Promise<ApiResponse<Array<{ info_hash: string; name: string; state: string; progress?: number; trackers?: string[] }>>> {
    return this.backendRequest('/api/client/torrents', { method: 'GET' });
  },
  /** POST /api/admin/tracker-mode/check — test connexion librqbit et état du mode */
  async postRatioTest(this: ServerApiClientSettingsAccess): Promise<ApiResponse<{
    mode_enabled: boolean;
    librqbit_ok: boolean;
    torrent_count: number;
    message: string;
  }>> {
    return this.backendRequest('/api/admin/tracker-mode/check', { method: 'POST' });
  },
  /** POST /api/admin/tracker-mode/probe-seed — envoie une annonce de test (même format que le client), quantité en Mo configurable, info_hash optionnel */
  async postRatioTestSeed(this: ServerApiClientSettingsAccess, options?: { tracker_url?: string; uploaded_mb?: number; info_hash?: string }): Promise<ApiResponse<{
    success: boolean;
    tracker_url: string;
    uploaded_bytes: number;
    response_status: number;
    message: string;
    ratio_from_tracker?: number;
    min_ratio_required?: number;
    uploaded_from_tracker?: number;
    downloaded_from_tracker?: number;
  }>> {
    const hasOptions = options && (options.tracker_url != null && options.tracker_url.trim() !== '' || options.uploaded_mb != null || (options.info_hash != null && options.info_hash.trim() !== ''));
    const body = hasOptions
      ? JSON.stringify({
          ...(options!.tracker_url != null && options!.tracker_url.trim() !== '' ? { tracker_url: options!.tracker_url!.trim() } : {}),
          ...(options!.uploaded_mb != null ? { uploaded_mb: options!.uploaded_mb } : {}),
          ...(options!.info_hash != null && options!.info_hash.trim() !== '' ? { info_hash: options!.info_hash.trim() } : {}),
        })
      : undefined;
    return this.backendRequest('/api/admin/tracker-mode/probe-seed', {
      method: 'POST',
      body,
    });
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

  /** GET /api/library/sources/explorer — explorateur complet pour choisir une source de bibliothèque */
  async listLibrarySourceExplorerFiles(this: ServerApiClientSettingsAccess, path?: string): Promise<ApiResponse<Array<{
    name: string;
    path: string;
    is_directory: boolean;
    size?: number;
    modified?: number;
  }>>> {
    const url = path != null && path !== ''
      ? `/api/library/sources/explorer?path=${encodeURIComponent(path)}`
      : '/api/library/sources/explorer';
    return this.backendRequest(url, { method: 'GET' });
  },
};