/**
 * Méthodes média : recherche, torrents, streaming
 */

import type { ApiResponse, SearchParams, SearchResult, StreamResponse } from './types.js';

/** Épisode d'une série (avec variante torrent) */
export interface SeriesEpisodeInfo {
  season: number;
  episode: number;
  name: string;
  id: string;
  info_hash: string | null;
  quality?: string | null;
  language?: string | null;
  format?: string | null;
  codec?: string | null;
  file_size: number;
  seed_count: number;
  leech_count: number;
  file_path?: string | null;
  is_from_multi_torrent: boolean;
}

/** Saison avec liste d'épisodes */
export interface SeriesSeasonInfo {
  season: number;
  episodes: SeriesEpisodeInfo[];
}

/** Réponse API épisodes par saison */
export interface SeriesEpisodesResponse {
  slug: string;
  main_title: string;
  seasons: SeriesSeasonInfo[];
}

/** Entrée fichier retournée par GET /api/torrents/list-files (list_only, sans ajouter le torrent) */
export interface TorrentListFileEntry {
  name: string;
  length: number;
  included?: boolean;
}

/**
 * Interface pour accéder aux méthodes privées de ServerApiClient nécessaires pour les médias
 */
interface ServerApiClientMediaAccess {
  backendRequest<T>(endpoint: string, options?: RequestInit): Promise<ApiResponse<T>>;
  getServerUrl(): string;
  getAccessToken(): string | null;
  getCurrentUserId(): string | null;
}

/**
 * Convertit un code de langue court (fr, en) en code TMDB (fr-FR, en-US)
 */
function toTmdbLanguage(lang?: string): string {
  if (!lang) return 'fr-FR';
  if (lang.includes('-')) return lang; // Déjà au format TMDB
  return lang === 'fr' ? 'fr-FR' : lang === 'en' ? 'en-US' : `${lang}-${lang.toUpperCase()}`;
}

export const mediaMethods = {
  /**
   * Recherche de contenu
   * Unifié : appel direct au backend Rust.
   * Si connecté, envoie user_id pour persister les résultats indexeur en DB (comme le sync).
   */
  async search(this: ServerApiClientMediaAccess, params: SearchParams): Promise<ApiResponse<SearchResult[]>> {
    const queryParams = new URLSearchParams();
    queryParams.set('q', params.q);
    if (params.type) queryParams.set('type', params.type);
    if (params.year) queryParams.set('year', params.year.toString());
    if (params.page) queryParams.set('page', params.page.toString());
    if (params.source) queryParams.set('source', params.source);
    const uid = params.user_id ?? this.getCurrentUserId();
    if (uid) queryParams.set('user_id', uid);
    // Ajouter le paramètre de langue pour TMDB
    queryParams.set('lang', toTmdbLanguage(params.lang));
    if (params.indexerId) queryParams.set('indexer_id', params.indexerId);

    const qp = queryParams.toString();
    return this.backendRequest<SearchResult[]>(`/api/indexers/search?${qp}`, { method: 'GET' });
  },

  /**
   * Liste les fichiers d'un torrent sans l'ajouter.
   * - `infoHash` (40 hex) : lit `torrents.file_data` côté backend si la sync a stocké le .torrent (pas d'appel indexer).
   * - `magnet` ou URL / indexer : comportement existant ; `infoHash` en plus permet un essai base avant Torznab sur list-files.
   */
  async getTorrentFileList(
    this: ServerApiClientMediaAccess,
    params: {
      /** Si présent et 40 car. hex, le backend utilise le .torrent déjà synchronisé en base. */
      infoHash?: string;
      magnet?: string;
      url?: string;
      indexerId?: string;
      torrentId?: string;
      guid?: string;
      indexerTypeId?: string;
      indexerName?: string;
      /** URL relative (ex. torrents.php?action=download&id=70824&...) pour indexers type Gazelle/HD-F ; résolue côté backend avec base_url. */
      relativeUrl?: string;
    },
  ): Promise<ApiResponse<TorrentListFileEntry[]>> {
    const q = new URLSearchParams();
    const rawIh = params.infoHash?.trim() ?? '';
    if (/^[a-f0-9]{40}$/i.test(rawIh)) {
      q.set('infoHash', rawIh.toLowerCase());
    }
    const hasMagnet = Boolean(params.magnet);
    const hasExternal = Boolean(params.url || params.indexerId || params.relativeUrl);
    if (hasMagnet) {
      q.set('magnet', params.magnet!);
    } else if (hasExternal) {
      if (params.url) q.set('url', params.url);
      if (params.indexerId) q.set('indexerId', params.indexerId);
      if (params.torrentId) q.set('torrentId', params.torrentId);
      if (params.guid) q.set('guid', params.guid);
      if (params.indexerTypeId) q.set('indexerTypeId', params.indexerTypeId);
      if (params.indexerName) q.set('indexerName', params.indexerName);
      if (params.relativeUrl) q.set('relativeUrl', params.relativeUrl);
    }
    if (!q.has('infoHash') && !hasMagnet && !hasExternal) {
      return {
        success: false,
        message: 'Paramètre infoHash (40 hex), magnet, ou (url / indexerId / relativeUrl) requis.',
      };
    }
    return this.backendRequest<TorrentListFileEntry[]>(`/api/torrents/list-files?${q.toString()}`, { method: 'GET' });
  },

  /**
   * Récupère un torrent groupé par slug
   * Unifié : appel direct au backend Rust
   */
  async getTorrentGroup(this: ServerApiClientMediaAccess, slug: string): Promise<ApiResponse<any>> {
    return this.backendRequest(`/api/torrents/group/${encodeURIComponent(slug)}`, { method: 'GET' });
  },

  /**
   * Récupère un groupe par tmdb_id (pour résultats recherche → détail).
   * Retourne un groupe vide si le média n'est pas encore synchronisé.
   */
  async getTorrentGroupByTmdbId(
    this: ServerApiClientMediaAccess,
    tmdbId: number,
    title?: string,
  ): Promise<ApiResponse<any>> {
    const q = title ? `?title=${encodeURIComponent(title)}` : '';
    return this.backendRequest(`/api/torrents/group/by-tmdb/${tmdbId}${q}`, { method: 'GET' });
  },

  /**
   * Récupère un torrent par ID
   * Unifié : appel direct au backend Rust
   */
  async getTorrentById(this: ServerApiClientMediaAccess, id: string): Promise<ApiResponse<any>> {
    return this.backendRequest(`/api/torrents/${encodeURIComponent(id)}`, { method: 'GET' });
  },

  /**
   * Récupère les épisodes d'une série par slug (saisons et épisodes avec variantes)
   */
  async getSeriesEpisodes(this: ServerApiClientMediaAccess, slug: string): Promise<ApiResponse<SeriesEpisodesResponse>> {
    return this.backendRequest(`/api/torrents/series/${encodeURIComponent(slug)}/episodes`, { method: 'GET' });
  },

  /**
   * Récupère les épisodes d'une série locale par tmdb_id (médias de la bibliothèque)
   */
  async getSeriesEpisodesByTmdbId(
    this: ServerApiClientMediaAccess,
    tmdbId: number,
  ): Promise<ApiResponse<SeriesEpisodesResponse>> {
    return this.backendRequest(`/api/torrents/series/by-tmdb/${tmdbId}/episodes`, { method: 'GET' });
  },

  /**
   * Récupère le détail d'une saison TMDB (inclut les épisodes et `still_path`)
   * Utilisé pour afficher des vignettes officielles sur les cartes épisode.
   */
  async getTmdbTvSeasonDetail(
    this: ServerApiClientMediaAccess,
    tmdbId: number,
    seasonNumber: number,
    language?: string,
  ): Promise<ApiResponse<any>> {
    const q = new URLSearchParams();
    q.set('language', toTmdbLanguage(language));
    return this.backendRequest(
      `/api/discover/tv/${tmdbId}/season/${seasonNumber}?${q.toString()}`,
      { method: 'GET' },
    );
  },

  /**
   * Récupère l'URL de stream pour un contenu
   * Le contentId peut être un slug (ex: "une-zone-a-defendre-2023") ou un infoHash
   * Note: Cette méthode est conservée pour compatibilité avec VideoPlayer.tsx
   * Le nouveau système utilise MediaDetailPage avec le backend Rust
   */
  async getStream(this: ServerApiClientMediaAccess, contentId: string): Promise<ApiResponse<StreamResponse>> {
    try {
      // D'abord, essayer de récupérer le torrent groupé par slug
      // Cela nous donnera l'infoHash du torrent
      const baseUrl = this.getServerUrl();

      // Essayer de récupérer le torrent groupé
      const groupResponse = await fetch(`${baseUrl}/api/torrents/group/${encodeURIComponent(contentId)}`, {
        headers: {
          'Authorization': `Bearer ${this.getAccessToken()}`,
        },
      });

      if (groupResponse.ok) {
        const groupData = await groupResponse.json();
        if (groupData.success && groupData.data) {
          // Extraire l'infoHash du premier variant disponible
          const variants = groupData.data.variants || [];
          if (variants.length > 0) {
            // Prendre le premier variant disponible
            const firstVariant = variants[0];
            const infoHash = firstVariant.infoHash || firstVariant.info_hash;

            if (infoHash) {
              // Construire l'URL HLS (pour compatibilité, mais le nouveau système utilise le backend Rust)
              const hlsUrl = `${baseUrl}/api/media/hls/${infoHash}/master.m3u8`;

              return {
                success: true,
                data: {
                  streamUrl: hlsUrl,
                  hlsUrl: hlsUrl,
                },
              };
            }
          }
        }
      }

      // Si le slug ne fonctionne pas, essayer directement avec l'infoHash
      // (au cas où contentId est déjà un infoHash)
      const hlsUrl = `${baseUrl}/api/media/hls/${contentId}/master.m3u8`;
      return {
        success: true,
        data: {
          streamUrl: hlsUrl,
          hlsUrl: hlsUrl,
        },
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Erreur lors de la récupération du stream',
      };
    }
  },
};
