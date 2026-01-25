/**
 * Méthodes média : recherche, torrents, streaming
 */

import type { ApiResponse, SearchParams, SearchResult, StreamResponse } from './types.js';

/**
 * Interface pour accéder aux méthodes privées de ServerApiClient nécessaires pour les médias
 */
interface ServerApiClientMediaAccess {
  backendRequest<T>(endpoint: string, options?: RequestInit): Promise<ApiResponse<T>>;
  getServerUrl(): string;
  getAccessToken(): string | null;
  getCurrentUserId(): string | null;
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

    const qp = queryParams.toString();
    return this.backendRequest<SearchResult[]>(`/api/indexers/search?${qp}`, { method: 'GET' });
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
