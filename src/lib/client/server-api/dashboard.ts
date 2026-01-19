/**
 * Méthodes dashboard : films, séries, contenu
 */

import type { ApiResponse, DashboardData, ContentItem, FilmData, SeriesData } from './types.js';

/**
 * Interface pour accéder aux méthodes privées de ServerApiClient nécessaires pour le dashboard
 */
interface ServerApiClientDashboardAccess {
  backendRequest<T>(endpoint: string, options?: RequestInit): Promise<ApiResponse<T>>;
}

export const dashboardMethods = {
  /**
   * Récupère les données du dashboard
   */
  async getDashboardData(this: ServerApiClientDashboardAccess): Promise<ApiResponse<DashboardData>> {
    // Unifié : on construit le dashboard à partir des torrents enrichis du backend
    // - FILM / SERIES proviennent de /api/torrents/list?category=...
    // - continueWatching n'est pas implémenté ici (nécessite stats player)
    try {
      const [moviesRes, seriesRes] = await Promise.all([
        this.backendRequest<any[]>('/api/torrents/list?category=FILM&sort=popular&limit=60&page=1', { method: 'GET' }),
        this.backendRequest<any[]>('/api/torrents/list?category=SERIES&sort=popular&limit=60&page=1', { method: 'GET' }),
      ]);

      if (!moviesRes.success && !seriesRes.success) {
        return {
          success: false,
          error: moviesRes.error || seriesRes.error || 'BackendError',
          message: moviesRes.message || seriesRes.message || 'Erreur lors du chargement du dashboard',
        };
      }

      const toContentItem = (raw: any): ContentItem => {
        const id = raw?.slug || raw?.id || raw?.infoHash || raw?.info_hash || '';
        const type: 'movie' | 'tv' =
          raw?.tmdbType === 'tv' || raw?.tmdb_type === 'tv' || raw?.category === 'SERIES' ? 'tv' : 'movie';
        const title = raw?.cleanTitle || raw?.clean_title || raw?.name || '';
        const poster = raw?.imageUrl || raw?.image_url || raw?.poster_url || undefined;
        const backdrop = raw?.heroImageUrl || raw?.hero_image_url || undefined;
        const overview = raw?.synopsis || raw?.overview || undefined;
        const rating = typeof raw?.voteAverage === 'number' ? raw.voteAverage : raw?.vote_average;
        const releaseDate = raw?.releaseDate || raw?.release_date || undefined;
        const genres = Array.isArray(raw?.genres) ? raw.genres : undefined;
        const seeds = raw?.seedCount ?? raw?.seed_count;
        const peers = raw?.leechCount ?? raw?.leech_count;

        // Normaliser qualité/codec en valeurs attendues par le type (best effort)
        const codecRaw = (raw?.codec || raw?.quality?.codec || '').toString().toLowerCase();
        const codec: ContentItem['codec'] =
          codecRaw.includes('265') ? 'x265' : codecRaw.includes('264') ? 'x264' : codecRaw.includes('av1') ? 'AV1' : undefined;

        const resRaw =
          (raw?.quality?.resolution || raw?.resolution || raw?.quality || '').toString().toLowerCase();
        const quality: ContentItem['quality'] =
          resRaw.includes('remux')
            ? 'Remux'
            : resRaw.includes('2160') || resRaw.includes('4k')
              ? '4K'
              : resRaw.includes('1080')
                ? '1080p'
                : resRaw.includes('720')
                  ? '720p'
                  : resRaw.includes('480')
                    ? '480p'
                    : undefined;

        const fileSize = raw?.fileSize ?? raw?.file_size;

        const item: ContentItem = {
          id,
          title,
          type,
          poster,
          backdrop,
          overview,
          rating: typeof rating === 'number' ? rating : undefined,
          releaseDate,
          genres,
          seeds: typeof seeds === 'number' ? seeds : undefined,
          peers: typeof peers === 'number' ? peers : undefined,
          codec,
          quality,
          fileSize: typeof fileSize === 'number' ? fileSize : undefined,
        };

        if (type === 'tv') {
          (item as any).firstAirDate = releaseDate;
        }

        return item;
      };

      const movies = Array.isArray(moviesRes.data) ? moviesRes.data.map(toContentItem).filter((i) => i.id) : [];
      const series = Array.isArray(seriesRes.data) ? seriesRes.data.map(toContentItem).filter((i) => i.id) : [];

      const heroCandidate = [...movies, ...series].find((i) => i.backdrop || i.poster) || movies[0] || series[0];

      const dashboard: DashboardData = {
        hero: heroCandidate
          ? {
              id: heroCandidate.id,
              title: heroCandidate.title,
              overview: heroCandidate.overview,
              poster: heroCandidate.poster,
              backdrop: heroCandidate.backdrop,
              type: heroCandidate.type,
              releaseDate: heroCandidate.releaseDate,
              rating: heroCandidate.rating,
            }
          : undefined,
        continueWatching: [],
        popularMovies: movies.slice(0, 20),
        popularSeries: series.slice(0, 20),
        recentAdditions: [...movies.slice(0, 10), ...series.slice(0, 10)],
      };

      return { success: true, data: dashboard };
    } catch (e) {
      return {
        success: false,
        error: 'DashboardError',
        message: e instanceof Error ? e.message : 'Erreur lors du chargement du dashboard',
      };
    }
  },

  /**
   * Récupère les films
   */
  async getFilmsData(this: ServerApiClientDashboardAccess): Promise<ApiResponse<FilmData[]>> {
    // Unifié : appel direct au backend Rust
    const res = await this.backendRequest<any[]>('/api/torrents/list?category=FILM&sort=popular&limit=200&page=1', {
      method: 'GET',
    });
    if (!res.success) return res as unknown as ApiResponse<FilmData[]>;
    const rows = Array.isArray(res.data) ? res.data : [];

    const films: FilmData[] = rows
      .map((raw: any) => {
        const id = raw?.slug || raw?.id || raw?.infoHash || raw?.info_hash || '';
        if (!id) return null;
        return {
          id,
          title: raw?.cleanTitle || raw?.clean_title || raw?.name || '',
          type: 'movie',
          poster: raw?.imageUrl || raw?.poster_url || undefined,
          backdrop: raw?.heroImageUrl || raw?.hero_image_url || undefined,
          overview: raw?.synopsis || undefined,
          rating: typeof raw?.voteAverage === 'number' ? raw.voteAverage : undefined,
          releaseDate: raw?.releaseDate || raw?.release_date || undefined,
          genres: Array.isArray(raw?.genres) ? raw.genres : undefined,
          seeds: typeof raw?.seedCount === 'number' ? raw.seedCount : undefined,
          peers: typeof raw?.leechCount === 'number' ? raw.leechCount : undefined,
          fileSize: typeof raw?.fileSize === 'number' ? raw.fileSize : undefined,
        } satisfies FilmData;
      })
      .filter(Boolean) as FilmData[];

    return { success: true, data: films };
  },

  /**
   * Récupère les séries
   */
  async getSeriesData(this: ServerApiClientDashboardAccess): Promise<ApiResponse<SeriesData[]>> {
    // Unifié : appel direct au backend Rust
    const res = await this.backendRequest<any[]>('/api/torrents/list?category=SERIES&sort=popular&limit=200&page=1', {
      method: 'GET',
    });
    if (!res.success) return res as unknown as ApiResponse<SeriesData[]>;
    const rows = Array.isArray(res.data) ? res.data : [];

    const series: SeriesData[] = rows
      .map((raw: any) => {
        const id = raw?.slug || raw?.id || raw?.infoHash || raw?.info_hash || '';
        if (!id) return null;
        return {
          id,
          title: raw?.cleanTitle || raw?.clean_title || raw?.name || '',
          type: 'tv',
          poster: raw?.imageUrl || raw?.poster_url || undefined,
          backdrop: raw?.heroImageUrl || raw?.hero_image_url || undefined,
          overview: raw?.synopsis || undefined,
          rating: typeof raw?.voteAverage === 'number' ? raw.voteAverage : undefined,
          firstAirDate: raw?.releaseDate || raw?.release_date || undefined,
          genres: Array.isArray(raw?.genres) ? raw.genres : undefined,
          seeds: typeof raw?.seedCount === 'number' ? raw.seedCount : undefined,
          peers: typeof raw?.leechCount === 'number' ? raw.leechCount : undefined,
          fileSize: typeof raw?.fileSize === 'number' ? raw.fileSize : undefined,
        } satisfies SeriesData;
      })
      .filter(Boolean) as SeriesData[];

    return { success: true, data: series };
  },
};
