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
      const [moviesRes, seriesRes, recentMoviesRes, recentSeriesRes] = await Promise.all([
        (async () => {
          const res = await this.backendRequest<any[]>('/api/torrents/list?category=films&sort=popular&limit=20&page=1&skip_indexer=true', { method: 'GET' });
          return res;
        })(),
        (async () => {
          const res = await this.backendRequest<any[]>('/api/torrents/list?category=series&sort=popular&limit=20&page=1&skip_indexer=true', { method: 'GET' });
          return res;
        })(),
        (async () => {
          // Récupérer les ajouts récents (tri par date, sans sort=popular)
          const res = await this.backendRequest<any[]>('/api/torrents/list?category=films&limit=30&page=1&skip_indexer=true', { method: 'GET' });
          return res;
        })(),
        (async () => {
          // Récupérer les ajouts récents (tri par date, sans sort=popular)
          const res = await this.backendRequest<any[]>('/api/torrents/list?category=series&limit=30&page=1&skip_indexer=true', { method: 'GET' });
          return res;
        })(),
      ]);

      if (!moviesRes.success && !seriesRes.success && !recentMoviesRes.success && !recentSeriesRes.success) {
        return {
          success: false,
          error: moviesRes.error || seriesRes.error || recentMoviesRes.error || recentSeriesRes.error || 'BackendError',
          message: moviesRes.message || seriesRes.message || recentMoviesRes.message || recentSeriesRes.message || 'Erreur lors du chargement du dashboard',
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
          tmdbId: typeof raw?.tmdbId === 'number' ? raw.tmdbId : (typeof raw?.tmdb_id === 'number' ? raw.tmdb_id : null),
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
      const recentMovies = Array.isArray(recentMoviesRes.data) ? recentMoviesRes.data.map(toContentItem).filter((i) => i.id) : [];
      const recentSeries = Array.isArray(recentSeriesRes.data) ? recentSeriesRes.data.map(toContentItem).filter((i) => i.id) : [];

      // Créer un Set des IDs des films/séries populaires pour éviter les doublons
      const popularMovieIds = new Set(movies.map(m => m.id));
      const popularSeriesIds = new Set(series.map(s => s.id));

      // Filtrer les ajouts récents pour exclure ceux déjà dans les listes populaires
      const recentMoviesFiltered = recentMovies
        .filter(m => !popularMovieIds.has(m.id))
        .slice(0, 10);
      const recentSeriesFiltered = recentSeries
        .filter(s => !popularSeriesIds.has(s.id))
        .slice(0, 10);

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
        recentAdditions: [...recentMoviesFiltered, ...recentSeriesFiltered],
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
    // Note: le backend utilise "films" (minuscules) comme catégorie, pas "FILM"
    // skip_indexer=true pour éviter les requêtes lentes à l'indexer
    const res = await this.backendRequest<any[]>('/api/torrents/list?category=films&sort=popular&limit=30&page=1&skip_indexer=true', {
      method: 'GET',
    });
    if (!res.success) {
      console.warn('[DASHBOARD] Erreur lors de la récupération des films:', res.message || res.error);
      return res as unknown as ApiResponse<FilmData[]>;
    }
    const rows = Array.isArray(res.data) ? res.data : [];
    console.log(`[DASHBOARD] ${rows.length} torrent(s) FILM reçu(s) du backend`);
    
    // Debug: Afficher les champs disponibles dans le premier torrent pour comprendre la structure
    if (rows.length > 0) {
      const firstRow = rows[0];
      console.log('[DASHBOARD] Structure du premier torrent FILM:', {
        keys: Object.keys(firstRow),
        imageFields: {
          imageUrl: firstRow?.imageUrl,
          image_url: firstRow?.image_url,
          poster_url: firstRow?.poster_url,
          poster: firstRow?.poster,
          heroImageUrl: firstRow?.heroImageUrl,
          hero_image_url: firstRow?.hero_image_url,
          backdrop: firstRow?.backdrop,
        },
      });
    }

    const films: FilmData[] = rows
      .map((raw: any, index: number) => {
        // Essayer plusieurs champs pour l'ID (slug en priorité car c'est l'identifiant unique pour le frontend)
        // Si l'id est un nombre, le convertir en string
        const rawId = raw?.id;
        const idAsString = rawId !== undefined && rawId !== null ? String(rawId) : '';
        const id = raw?.slug || idAsString || raw?.infoHash || raw?.info_hash || raw?.info_hash_hex || '';
        if (!id) {
          console.warn(`[DASHBOARD] Torrent FILM ${index} sans ID valide:`, {
            slug: raw?.slug,
            id: raw?.id,
            idAsString,
            infoHash: raw?.infoHash,
            info_hash: raw?.info_hash,
            info_hash_hex: raw?.info_hash_hex,
            name: raw?.name,
            cleanTitle: raw?.cleanTitle,
            raw: JSON.stringify(raw).substring(0, 200), // Aperçu des données brutes
          });
          return null;
        }
        return {
          id,
          title: raw?.cleanTitle || raw?.clean_title || raw?.name || raw?.title || 'Sans titre',
          type: 'movie',
          poster: raw?.imageUrl || raw?.image_url || raw?.poster_url || raw?.poster || undefined,
          backdrop: raw?.heroImageUrl || raw?.hero_image_url || raw?.backdrop || undefined,
          overview: raw?.synopsis || raw?.overview || undefined,
          rating: typeof raw?.voteAverage === 'number' ? raw.voteAverage : raw?.vote_average,
          releaseDate: raw?.releaseDate || raw?.release_date || undefined,
          genres: Array.isArray(raw?.genres) ? raw.genres : undefined,
          tmdbId: typeof raw?.tmdbId === 'number' ? raw.tmdbId : (typeof raw?.tmdb_id === 'number' ? raw.tmdb_id : null),
          seeds: typeof raw?.seedCount === 'number' ? raw.seedCount : raw?.seed_count,
          peers: typeof raw?.leechCount === 'number' ? raw.leechCount : raw?.leech_count,
          fileSize: typeof raw?.fileSize === 'number' ? raw.fileSize : raw?.file_size,
        } satisfies FilmData;
      })
      .filter(Boolean) as FilmData[];

    console.log(`[DASHBOARD] ${films.length} film(s) valide(s) après filtrage`);
    return { success: true, data: films };
  },

  /**
   * Récupère les séries
   */
  async getSeriesData(this: ServerApiClientDashboardAccess): Promise<ApiResponse<SeriesData[]>> {
    // Unifié : appel direct au backend Rust
    // Note: le backend utilise "series" (minuscules) comme catégorie, pas "SERIES"
    // skip_indexer=true pour éviter les requêtes lentes à l'indexer
    const res = await this.backendRequest<any[]>('/api/torrents/list?category=series&sort=popular&limit=30&page=1&skip_indexer=true', {
      method: 'GET',
    });
    if (!res.success) {
      console.warn('[DASHBOARD] Erreur lors de la récupération des séries:', res.message || res.error);
      return res as unknown as ApiResponse<SeriesData[]>;
    }
    const rows = Array.isArray(res.data) ? res.data : [];
    console.log(`[DASHBOARD] ${rows.length} torrent(s) SERIES reçu(s) du backend`);
    
    // Debug: Afficher les champs disponibles dans le premier torrent pour comprendre la structure
    if (rows.length > 0) {
      const firstRow = rows[0];
      console.log('[DASHBOARD] Structure du premier torrent SERIES:', {
        keys: Object.keys(firstRow),
        imageFields: {
          imageUrl: firstRow?.imageUrl,
          image_url: firstRow?.image_url,
          poster_url: firstRow?.poster_url,
          poster: firstRow?.poster,
          heroImageUrl: firstRow?.heroImageUrl,
          hero_image_url: firstRow?.hero_image_url,
          backdrop: firstRow?.backdrop,
        },
      });
    }

    const series: SeriesData[] = rows
      .map((raw: any, index: number) => {
        // Essayer plusieurs champs pour l'ID (slug en priorité car c'est l'identifiant unique pour le frontend)
        // Si l'id est un nombre, le convertir en string
        const rawId = raw?.id;
        const idAsString = rawId !== undefined && rawId !== null ? String(rawId) : '';
        const id = raw?.slug || idAsString || raw?.infoHash || raw?.info_hash || raw?.info_hash_hex || '';
        if (!id) {
          console.warn(`[DASHBOARD] Torrent SERIES ${index} sans ID valide:`, {
            slug: raw?.slug,
            id: raw?.id,
            idAsString,
            infoHash: raw?.infoHash,
            info_hash: raw?.info_hash,
            info_hash_hex: raw?.info_hash_hex,
            name: raw?.name,
            cleanTitle: raw?.cleanTitle,
            raw: JSON.stringify(raw).substring(0, 200), // Aperçu des données brutes
          });
          return null;
        }
        return {
          id,
          title: raw?.cleanTitle || raw?.clean_title || raw?.name || raw?.title || 'Sans titre',
          type: 'tv',
          poster: raw?.imageUrl || raw?.image_url || raw?.poster_url || raw?.poster || undefined,
          backdrop: raw?.heroImageUrl || raw?.hero_image_url || raw?.backdrop || undefined,
          overview: raw?.synopsis || raw?.overview || undefined,
          rating: typeof raw?.voteAverage === 'number' ? raw.voteAverage : raw?.vote_average,
          firstAirDate: raw?.releaseDate || raw?.release_date || undefined,
          genres: Array.isArray(raw?.genres) ? raw.genres : undefined,
          tmdbId: typeof raw?.tmdbId === 'number' ? raw.tmdbId : (typeof raw?.tmdb_id === 'number' ? raw.tmdb_id : null),
          seeds: typeof raw?.seedCount === 'number' ? raw.seedCount : raw?.seed_count,
          peers: typeof raw?.leechCount === 'number' ? raw.leechCount : raw?.leech_count,
          fileSize: typeof raw?.fileSize === 'number' ? raw.fileSize : raw?.file_size,
        } satisfies SeriesData;
      })
      .filter(Boolean) as SeriesData[];

    console.log(`[DASHBOARD] ${series.length} série(s) valide(s) après filtrage`);
    return { success: true, data: series };
  },

  /**
   * Récupère les films avec pagination
   */
  async getFilmsDataPaginated(
    this: ServerApiClientDashboardAccess,
    page: number = 1,
    limit: number = 30
  ): Promise<ApiResponse<FilmData[]>> {
    const res = await this.backendRequest<any[]>(
      `/api/torrents/list?category=films&sort=popular&limit=${limit}&page=${page}&skip_indexer=true`,
      { method: 'GET' }
    );
    if (!res.success) {
      return res as unknown as ApiResponse<FilmData[]>;
    }
    const rows = Array.isArray(res.data) ? res.data : [];

    const films: FilmData[] = rows
      .map((raw: any) => {
        const rawId = raw?.id;
        const idAsString = rawId !== undefined && rawId !== null ? String(rawId) : '';
        const id = raw?.slug || idAsString || raw?.infoHash || raw?.info_hash || raw?.info_hash_hex || '';
        if (!id) return null;
        return {
          id,
          title: raw?.cleanTitle || raw?.clean_title || raw?.name || raw?.title || 'Sans titre',
          type: 'movie',
          poster: raw?.imageUrl || raw?.image_url || raw?.poster_url || raw?.poster || undefined,
          backdrop: raw?.heroImageUrl || raw?.hero_image_url || raw?.backdrop || undefined,
          overview: raw?.synopsis || raw?.overview || undefined,
          rating: typeof raw?.voteAverage === 'number' ? raw.voteAverage : raw?.vote_average,
          releaseDate: raw?.releaseDate || raw?.release_date || undefined,
          genres: Array.isArray(raw?.genres) ? raw.genres : undefined,
          tmdbId: typeof raw?.tmdbId === 'number' ? raw.tmdbId : (typeof raw?.tmdb_id === 'number' ? raw.tmdb_id : null),
          seeds: typeof raw?.seedCount === 'number' ? raw.seedCount : raw?.seed_count,
          peers: typeof raw?.leechCount === 'number' ? raw.leechCount : raw?.leech_count,
          fileSize: typeof raw?.fileSize === 'number' ? raw.fileSize : raw?.file_size,
        } satisfies FilmData;
      })
      .filter(Boolean) as FilmData[];

    return { success: true, data: films };
  },

  /**
   * Récupère les séries avec pagination
   */
  async getSeriesDataPaginated(
    this: ServerApiClientDashboardAccess,
    page: number = 1,
    limit: number = 30
  ): Promise<ApiResponse<SeriesData[]>> {
    const res = await this.backendRequest<any[]>(
      `/api/torrents/list?category=series&sort=popular&limit=${limit}&page=${page}&skip_indexer=true`,
      { method: 'GET' }
    );
    if (!res.success) {
      return res as unknown as ApiResponse<SeriesData[]>;
    }
    const rows = Array.isArray(res.data) ? res.data : [];
    
    // Debug: Afficher les champs disponibles dans le premier torrent pour comprendre la structure
    if (rows.length > 0) {
      const firstRow = rows[0];
      console.log('[DASHBOARD] Structure du premier torrent SERIES (paginated):');
      console.log('  - imageUrl:', firstRow?.imageUrl);
      console.log('  - image_url:', firstRow?.image_url);
      console.log('  - poster_url:', firstRow?.poster_url);
      console.log('  - poster:', firstRow?.poster);
      console.log('  - heroImageUrl:', firstRow?.heroImageUrl);
      console.log('  - hero_image_url:', firstRow?.hero_image_url);
      console.log('  - backdrop:', firstRow?.backdrop);
      console.log('  - tmdbId:', firstRow?.tmdbId);
      console.log('  - tmdb_id:', firstRow?.tmdb_id);
      console.log('  - Tous les clés:', Object.keys(firstRow));
      console.log('  - Données complètes (premiers 1000 caractères):', JSON.stringify(firstRow, null, 2).substring(0, 1000));
    }

    const series: SeriesData[] = rows
      .map((raw: any) => {
        const rawId = raw?.id;
        const idAsString = rawId !== undefined && rawId !== null ? String(rawId) : '';
        const id = raw?.slug || idAsString || raw?.infoHash || raw?.info_hash || raw?.info_hash_hex || '';
        if (!id) return null;
        return {
          id,
          title: raw?.cleanTitle || raw?.clean_title || raw?.name || raw?.title || 'Sans titre',
          type: 'tv',
          poster: raw?.imageUrl || raw?.image_url || raw?.poster_url || raw?.poster || undefined,
          backdrop: raw?.heroImageUrl || raw?.hero_image_url || raw?.backdrop || undefined,
          overview: raw?.synopsis || raw?.overview || undefined,
          rating: typeof raw?.voteAverage === 'number' ? raw.voteAverage : raw?.vote_average,
          firstAirDate: raw?.releaseDate || raw?.release_date || undefined,
          genres: Array.isArray(raw?.genres) ? raw.genres : undefined,
          tmdbId: typeof raw?.tmdbId === 'number' ? raw.tmdbId : (typeof raw?.tmdb_id === 'number' ? raw.tmdb_id : null),
          seeds: typeof raw?.seedCount === 'number' ? raw.seedCount : raw?.seed_count,
          peers: typeof raw?.leechCount === 'number' ? raw.leechCount : raw?.leech_count,
          fileSize: typeof raw?.fileSize === 'number' ? raw.fileSize : raw?.file_size,
        } satisfies SeriesData;
      })
      .filter(Boolean) as SeriesData[];

    return { success: true, data: series };
  },
};
