/**
 * Méthodes pour la création de .torrent et la publication sur un tracker (ex. C411).
 */

import type { ApiResponse } from './types.js';

export interface CreateTorrentParams {
  local_media_id: string;
  announce_url: string;
  piece_size_override?: number;
  /** Contenu du fichier .nfo pour la publication C411 (optionnel). */
  nfo_content?: string | null;
  /** Si true (défaut), publier automatiquement sur C411 après création du .torrent. */
  publish_to_c411?: boolean;
}

export interface PublishC411Params {
  local_media_id: string;
  announce_url: string;
  c411_session_cookie: string;
  c411_csrf_cookie: string;
  piece_size_override?: number;
  category_id?: string;
  subcategory_id?: string;
  description?: string;
  /** Contenu du fichier .nfo pour C411 (optionnel). */
  nfo_content?: string | null;
}

export interface PublishC411Response {
  success: boolean;
  torrent_url?: string;
  message: string;
}

export interface C411UploadCookiesResponse {
  has_session: boolean;
  has_csrf: boolean;
  has_passkey?: boolean;
  has_api_key?: boolean;
  announce_url?: string | null;
}

export interface TrackerUploadResult {
  success: boolean;
  torrent_url?: string | null;
  message: string;
}

export interface PerTrackerUploadResult {
  tracker: string;
  result: TrackerUploadResult;
}

export interface MultiTrackerUploadResult {
  results: PerTrackerUploadResult[];
}

export interface TorrentProgressResponse {
  progress?: number | null;
}

export interface ActiveTorrentCreationEntry {
  local_media_id: string;
  progress: number;
}

export interface CancelTorrentCreationResponse {
  cancel_requested: boolean;
}

export interface UploadMediaValidationCheck {
  key: string;
  ok: boolean;
  message: string;
}

export interface UploadMediaValidationResponse {
  valid: boolean;
  message: string;
  checks: UploadMediaValidationCheck[];
}

export interface PublishedUploadTrackerEntry {
  tracker: string;
  torrent_url: string | null;
  message?: string | null;
  success: boolean;
  uploaded_at: number;
}

export interface PublishedUploadMediaEntry {
  local_media_id: string;
  media_title: string;
  media_file_name: string;
  info_hash: string | null;
  trackers: PublishedUploadTrackerEntry[];
  rqbit_present: boolean;
  has_torrent_file: boolean;
  last_uploaded_at: number;
}

/** Réponse de prévisualisation NFO / description pour l'upload. */
export interface UploaderPreviewResponse {
  release_name: string;
  nfo: string;
  /** Description envoyée au tracker (BBCode, ex. C411). */
  description: string;
  /** Version HTML pour la prévisualisation (BBCode converti en HTML). */
  description_html: string;
}

export interface ReseedTorrentInfo {
  info_hash: string;
  name: string;
  download_path: string | null;
  has_torrent_file: boolean;
  download_url: string | null;
}

/** Média de la bibliothèque avec indicateur de disponibilité du .torrent pour re-seed. */
export interface ReseedFromLibraryItem {
  local_media_id: string;
  file_path: string;
  file_name: string;
  tmdb_title: string | null;
  info_hash: string | null;
  has_torrent_file: boolean;
  download_url: string | null;
  /** Nom attendu par le .torrent (info.name). Si différent de file_name, utiliser « préparer pour re-seed ». */
  torrent_expected_name?: string | null;
}

export interface RestoreFromIndexerBody {
  local_media_id: string;
  indexer_id: string;
  query?: string | null;
}

export interface RestoreFromIndexerResult {
  local_media_id: string;
  matched: boolean;
  info_hash?: string | null;
  message: string;
}

export interface PrepareReseedFromLibraryResult {
  local_media_id: string;
  torrent_expected_name?: string | null;
  renamed: boolean;
  message: string;
}

export type C411BatchEvent =
  | { type: 'batch_start'; total: number }
  | { type: 'item_start'; media_id: string; media_title: string; index: number; total: number }
  | { type: 'item_progress'; media_id: string; stage: string }
  | { type: 'item_done'; media_id: string; success: boolean; message: string }
  | { type: 'batch_end'; success_count: number; error_count: number };

interface UploadTrackerClientAccess {
  backendRequest<T>(endpoint: string, options?: RequestInit): Promise<ApiResponse<T>>;
  requestBlob(endpoint: string, options?: RequestInit): Promise<ApiResponse<Blob> & { filename?: string }>;
  getServerUrl?(): string;
}

export const uploadTrackerMethods = {
  /**
   * Génère un fichier .torrent pour un média de la bibliothèque.
   * Le fichier est enregistré sur le serveur dans le dossier uploads (pas de téléchargement navigateur).
   */
  async createTorrentForLibraryMedia(
    this: UploadTrackerClientAccess,
    params: CreateTorrentParams
  ): Promise<ApiResponse<void>> {
    const res = await this.requestBlob('/api/library/upload-tracker/create-torrent', {
      method: 'POST',
      body: JSON.stringify({
        local_media_id: params.local_media_id,
        announce_url: params.announce_url,
        piece_size_override: params.piece_size_override ?? null,
        nfo_content: params.nfo_content?.trim() || null,
        publish_to_c411: params.publish_to_c411 !== false,
      }),
    });
    if (!res.success || !res.data) {
      return {
        success: false,
        error: res.error ?? 'BackendError',
        message: res.message ?? 'Échec de la création du .torrent',
      };
    }
    const c411Result = (res as { c411Result?: { success: boolean; message: string; torrentUrl?: string } }).c411Result;
    return { success: true, ...(c411Result ? { c411Result } : {}) };
  },

  /**
   * Génère le .torrent et le publie sur C411 avec les cookies fournis.
   */
  async publishC411(
    this: UploadTrackerClientAccess,
    params: PublishC411Params
  ): Promise<ApiResponse<PublishC411Response>> {
    return this.backendRequest<PublishC411Response>('/api/library/upload-tracker/publish-c411', {
      method: 'POST',
      body: JSON.stringify({
        local_media_id: params.local_media_id,
        announce_url: params.announce_url,
        c411_session_cookie: params.c411_session_cookie,
        c411_csrf_cookie: params.c411_csrf_cookie,
        piece_size_override: params.piece_size_override ?? null,
        category_id: params.category_id ?? null,
        subcategory_id: params.subcategory_id ?? null,
        description: params.description ?? null,
        nfo_content: params.nfo_content?.trim() || null,
      }),
    });
  },

  async getC411UploadCookies(
    this: UploadTrackerClientAccess
  ): Promise<ApiResponse<C411UploadCookiesResponse>> {
    return this.backendRequest<C411UploadCookiesResponse>('/api/settings/c411-upload-cookies', { method: 'GET' });
  },

  async putC411UploadCookies(
    this: UploadTrackerClientAccess,
    body: {
      raw_cookie?: string;
      session_cookie?: string;
      csrf_cookie?: string;
      passkey?: string;
      api_key?: string;
    }
  ): Promise<ApiResponse<void>> {
    return this.backendRequest<void>('/api/settings/c411-upload-cookies', {
      method: 'PUT',
      body: JSON.stringify(body),
    });
  },

  /**
   * Utilise le moteur natif P-upload pour créer le .torrent et publier
   * un média local vers un ou plusieurs trackers.
   */
  async uploadLibraryMedia(
    this: UploadTrackerClientAccess,
    params: {
      local_media_id: string;
      trackers: string[];
      piece_size_override?: number;
      screenshot_base_url?: string;
      signal?: AbortSignal;
    }
  ): Promise<ApiResponse<MultiTrackerUploadResult>> {
    return this.backendRequest<MultiTrackerUploadResult>('/api/library/uploader/upload-one', {
      method: 'POST',
      signal: params.signal,
      body: JSON.stringify({
        local_media_id: params.local_media_id,
        trackers: params.trackers,
        piece_size_override: params.piece_size_override ?? null,
        screenshot_base_url: params.screenshot_base_url?.trim() || null,
      }),
    });
  },

  /**
   * Récupère la progression de création du .torrent pour un média local (0-100% si connue).
   */
  async getTorrentProgress(
    this: UploadTrackerClientAccess,
    localMediaId: string
  ): Promise<ApiResponse<TorrentProgressResponse>> {
    const params = new URLSearchParams({ local_media_id: localMediaId });
    return this.backendRequest<TorrentProgressResponse>(
      `/api/library/uploader/torrent-progress?${params.toString()}`,
      { method: 'GET' }
    );
  },

  /**
   * Liste les créations .torrent en cours pour permettre une reprise UI.
   */
  async getActiveTorrentCreations(
    this: UploadTrackerClientAccess
  ): Promise<ApiResponse<ActiveTorrentCreationEntry[]>> {
    return this.backendRequest<ActiveTorrentCreationEntry[]>('/api/library/uploader/active-torrents', {
      method: 'GET',
    });
  },

  /**
   * Demande l'annulation de la création .torrent en cours pour un média local.
   */
  async cancelTorrentCreation(
    this: UploadTrackerClientAccess,
    localMediaId: string
  ): Promise<ApiResponse<CancelTorrentCreationResponse>> {
    return this.backendRequest<CancelTorrentCreationResponse>('/api/library/uploader/cancel-torrent', {
      method: 'POST',
      body: JSON.stringify({ local_media_id: localMediaId }),
    });
  },

  /**
   * Valide qu'un média est exploitable pour l'upload tracker (fichier, ffprobe, décodage ffmpeg).
   */
  async validateUploadMedia(
    this: UploadTrackerClientAccess,
    localMediaId: string
  ): Promise<ApiResponse<UploadMediaValidationResponse>> {
    const params = new URLSearchParams({ local_media_id: localMediaId });
    return this.backendRequest<UploadMediaValidationResponse>(
      `/api/library/uploader/validate-media?${params.toString()}`,
      { method: 'GET' }
    );
  },

  /**
   * Liste les médias publiés vers les trackers avec statut rqbit et téléchargement .torrent.
   */
  async getPublishedUploads(
    this: UploadTrackerClientAccess
  ): Promise<ApiResponse<PublishedUploadMediaEntry[]>> {
    return this.backendRequest<PublishedUploadMediaEntry[]>('/api/library/uploader/published', {
      method: 'GET',
    });
  },

  /**
   * Supprime de l'historique toutes les entrées d'upload en échec (tentatives tracker non réussies).
   * Retourne le nombre d'entrées supprimées.
   */
  async clearFailedUploads(
    this: UploadTrackerClientAccess
  ): Promise<ApiResponse<{ deleted: number }>> {
    return this.backendRequest<{ deleted: number }>('/api/library/uploader/clear-failed', {
      method: 'POST',
    });
  },

  /**
   * Génère les captures d'écran pour un média (FFmpeg) ; elles seront réutilisées à l'upload.
   */
  async generateScreenshots(
    this: UploadTrackerClientAccess,
    localMediaId: string
  ): Promise<ApiResponse<{ count: number; screenshot_base_url: string }>> {
    return this.backendRequest<{ count: number; screenshot_base_url: string }>(
      '/api/library/uploader/generate-screenshots',
      {
        method: 'POST',
        body: JSON.stringify({ local_media_id: localMediaId }),
      }
    );
  },

  /**
   * Prévisualise le NFO et la description qui seront envoyés au tracker pour un média donné.
   * Le bloc technique (MediaInfo) est toujours inclus (conformité C411).
   * @param tracker — tracker pour lequel prévisualiser la description (ex. C411, TORR9). Défaut côté serveur : C411.
   * @param screenshotBaseUrl — URL de base pour les images de captures dans la prévisualisation (celle renvoyée par generateScreenshots).
   */
  async getUploadPreview(
    this: UploadTrackerClientAccess,
    localMediaId: string,
    tracker?: string,
    screenshotBaseUrl?: string
  ): Promise<ApiResponse<UploaderPreviewResponse>> {
    const params = new URLSearchParams({ local_media_id: localMediaId });
    if (tracker?.trim()) params.set('tracker', tracker.trim());
    if (screenshotBaseUrl?.trim()) params.set('screenshot_base_url', screenshotBaseUrl.trim());
    return this.backendRequest<UploaderPreviewResponse>(
      `/api/library/uploader/preview?${params.toString()}`,
      { method: 'GET' }
    );
  },

  async publishC411Batch(
    this: UploadTrackerClientAccess,
    params: { announce_url: string; local_media_ids?: string[] },
    onEvent: (event: C411BatchEvent) => void
  ): Promise<ApiResponse<void>> {
    const baseUrl = (this as { getServerUrl?: () => string }).getServerUrl?.();
    if (!baseUrl) return { success: false, error: 'Config', message: 'URL du backend indisponible' };
    const url = `${baseUrl.replace(/\/$/, '')}/api/library/upload-tracker/publish-c411-batch`;
    const token = (this as { accessToken?: string }).accessToken;
    const headers: Record<string, string> = { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) };
    try {
      const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify({ announce_url: params.announce_url, local_media_ids: params.local_media_ids ?? null }) });
      if (!res.ok) {
        const text = await res.text();
        let msg = `Erreur ${res.status}`;
        try { const d = JSON.parse(text); if (d?.error) msg = d.error; else if (d?.message) msg = d.message; } catch { /* ignore */ }
        return { success: false, error: 'BackendError', message: msg };
      }
      const reader = res.body?.getReader();
      if (!reader) return { success: false, error: 'Stream', message: 'Réponse sans body' };
      const dec = new TextDecoder();
      let buffer = '';
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += dec.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          const t = line.trim();
          if (!t) continue;
          try { onEvent(JSON.parse(t) as C411BatchEvent); } catch { /* skip */ }
        }
      }
      if (buffer.trim()) try { onEvent(JSON.parse(buffer.trim()) as C411BatchEvent); } catch { /* ignore */ }
      return { success: true };
    } catch (e) {
      return { success: false, error: 'NetworkError', message: e instanceof Error ? e.message : String(e) };
    }
  },

  /**
   * Liste des torrents connus du backend avec indicateur si un .torrent est en base (pour re-seed).
   */
  async getTorrentFilesForReseed(
    this: UploadTrackerClientAccess
  ): Promise<ApiResponse<ReseedTorrentInfo[]>> {
    return this.backendRequest<ReseedTorrentInfo[]>('/api/admin/torrent-files/for-reseed', { method: 'GET' });
  },

  /**
   * Liste des médias de la bibliothèque avec indicateur si un .torrent est en base (re-seed depuis les fichiers déjà présents).
   */
  async getTorrentFilesForReseedFromLibrary(
    this: UploadTrackerClientAccess
  ): Promise<ApiResponse<ReseedFromLibraryItem[]>> {
    return this.backendRequest<ReseedFromLibraryItem[]>('/api/admin/torrent-files/for-reseed-from-library', { method: 'GET' });
  },

  /**
   * Pour un média de la bibliothèque, tente de retrouver un torrent sur un indexer donné,
   * de stocker le .torrent en base et de l'ajouter au client pour re-seed.
   */
  async restoreTorrentFromIndexerForMedia(
    this: UploadTrackerClientAccess,
    body: RestoreFromIndexerBody
  ): Promise<ApiResponse<RestoreFromIndexerResult>> {
    return this.backendRequest<RestoreFromIndexerResult>('/api/library/upload-tracker/restore-from-indexer', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },

  /**
   * Télécharge le fichier .torrent depuis la base par info_hash (pour re-seed sur NAS / autre client).
   */
  async downloadTorrentFileForReseed(
    this: UploadTrackerClientAccess,
    infoHash: string
  ): Promise<ApiResponse<Blob> & { filename?: string }> {
    return this.requestBlob(`/api/admin/torrent-files/by-info-hash/${encodeURIComponent(infoHash)}`, { method: 'GET' });
  },

  /**
   * Prépare un média pour le re-seed : renomme le fichier sur disque pour qu'il corresponde au nom attendu par le .torrent.
   */
  async prepareReseedFromLibrary(
    this: UploadTrackerClientAccess,
    localMediaId: string
  ): Promise<ApiResponse<PrepareReseedFromLibraryResult>> {
    return this.backendRequest<PrepareReseedFromLibraryResult>('/api/library/upload-tracker/prepare-reseed', {
      method: 'POST',
      body: JSON.stringify({ local_media_id: localMediaId }),
    });
  },

  /**
   * Télécharge le fichier .torrent directement depuis l'indexer (proxy backend /api/torrents/external/download).
   * Utilisé en fallback quand aucun .torrent n'est stocké en base pour un info_hash donné.
   */
  async downloadTorrentFromIndexer(
    this: UploadTrackerClientAccess,
    params: {
      externalLink?: string | null;
      torrentName: string;
      indexerId?: string | null;
      indexerName?: string | null;
      guid?: string | null;
      torrentId?: string | null;
      indexerTypeId?: string | null;
    }
  ): Promise<ApiResponse<Blob> & { filename?: string }> {
    const baseUrl = this.getServerUrl?.();
    if (!baseUrl) {
      return {
        success: false,
        error: 'Config',
        message: 'URL du backend indisponible',
      };
    }

    const isRelativeLink =
      !!params.externalLink &&
      !params.externalLink.startsWith('http://') &&
      !params.externalLink.startsWith('https://');

    const externalUrl = new URL(
      `${baseUrl.replace(/\/$/, '')}/api/torrents/external/download`
    );

    if (params.externalLink) {
      if (isRelativeLink) {
        externalUrl.searchParams.set('relativeUrl', params.externalLink);
      } else {
        externalUrl.searchParams.set('url', params.externalLink);
      }
    }

    externalUrl.searchParams.set('torrentName', params.torrentName);

    if (params.indexerId) {
      externalUrl.searchParams.set('indexerId', String(params.indexerId));
    }
    if (params.indexerName) {
      externalUrl.searchParams.set('indexerName', params.indexerName);
    }
    if (params.guid) {
      externalUrl.searchParams.set('guid', String(params.guid));
    }
    if (params.torrentId) {
      externalUrl.searchParams.set('torrentId', String(params.torrentId));
    }
    if (params.indexerTypeId) {
      externalUrl.searchParams.set('indexerTypeId', String(params.indexerTypeId));
    }

    // Utiliser requestBlob pour profiter de la même logique que les autres téléchargements binaires
    return this.requestBlob(externalUrl.pathname + externalUrl.search, {
      method: 'GET',
    });
  },
};
