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
      // #region agent log
      const clientStart = Date.now();
      fetch('http://127.0.0.1:7246/ingest/0bc97b62-c537-46ab-80a5-8129f8a58360',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'dashboard.ts:getDashboardData',message:'Début requêtes dashboard',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
      // #endregion
      const [moviesRes, seriesRes] = await Promise.all([
        (async () => {
          // #region agent log
          const reqStart = Date.now();
          fetch('http://127.0.0.1:7246/ingest/0bc97b62-c537-46ab-80a5-8129f8a58360',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'dashboard.ts:getDashboardData',message:'Début requête films',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
          // #endregion
          const res = await this.backendRequest<any[]>('/api/torrents/list?category=films&sort=popular&limit=60&page=1', { method: 'GET' });
          // #region agent log
          const reqEnd = Date.now();
          fetch('http://127.0.0.1:7246/ingest/0bc97b62-c537-46ab-80a5-8129f8a58360',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'dashboard.ts:getDashboardData',message:'Fin requête films',data:{durationMs:reqEnd-reqStart,success:res.success},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
          // #endregion
          return res;
        })(),
        (async () => {
          // #region agent log
          const reqStart = Date.now();
          fetch('http://127.0.0.1:7246/ingest/0bc97b62-c537-46ab-80a5-8129f8a58360',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'dashboard.ts:getDashboardData',message:'Début requête series',data:{},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
          // #endregion
          const res = await this.backendRequest<any[]>('/api/torrents/list?category=series&sort=popular&limit=60&page=1', { method: 'GET' });
          // #region agent log
          const reqEnd = Date.now();
          fetch('http://127.0.0.1:7246/ingest/0bc97b62-c537-46ab-80a5-8129f8a58360',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'dashboard.ts:getDashboardData',message:'Fin requête series',data:{durationMs:reqEnd-reqStart,success:res.success},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
          // #endregion
          return res;
        })(),
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

      // #region agent log
      const clientEnd = Date.now();
      fetch('http://127.0.0.1:7246/ingest/0bc97b62-c537-46ab-80a5-8129f8a58360',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'dashboard.ts:getDashboardData',message:'Dashboard terminé',data:{totalDurationMs:clientEnd-clientStart},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
      // #endregion
      return { success: true, data: dashboard };
    } catch (e) {
      // #region agent log
      const clientEnd = Date.now();
      fetch('http://127.0.0.1:7246/ingest/0bc97b62-c537-46ab-80a5-8129f8a58360',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'dashboard.ts:getDashboardData',message:'Dashboard erreur',data:{totalDurationMs:clientEnd-clientStart,error:e instanceof Error ? e.message : String(e)},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'C'})}).catch(()=>{});
      // #endregion
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
    const res = await this.backendRequest<any[]>('/api/torrents/list?category=films&sort=popular&limit=200&page=1&skip_indexer=true', {
      method: 'GET',
    });
    if (!res.success) {
      console.warn('[DASHBOARD] Erreur lors de la récupération des films:', res.message || res.error);
      return res as unknown as ApiResponse<FilmData[]>;
    }
    const rows = Array.isArray(res.data) ? res.data : [];
    console.log(`[DASHBOARD] ${rows.length} torrent(s) FILM reçu(s) du backend`);

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
          poster: raw?.imageUrl || raw?.poster_url || raw?.poster || undefined,
          backdrop: raw?.heroImageUrl || raw?.hero_image_url || raw?.backdrop || undefined,
          overview: raw?.synopsis || raw?.overview || undefined,
          rating: typeof raw?.voteAverage === 'number' ? raw.voteAverage : raw?.vote_average,
          releaseDate: raw?.releaseDate || raw?.release_date || undefined,
          genres: Array.isArray(raw?.genres) ? raw.genres : undefined,
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
    const res = await this.backendRequest<any[]>('/api/torrents/list?category=series&sort=popular&limit=200&page=1&skip_indexer=true', {
      method: 'GET',
    });
    if (!res.success) {
      console.warn('[DASHBOARD] Erreur lors de la récupération des séries:', res.message || res.error);
      return res as unknown as ApiResponse<SeriesData[]>;
    }
    const rows = Array.isArray(res.data) ? res.data : [];
    console.log(`[DASHBOARD] ${rows.length} torrent(s) SERIES reçu(s) du backend`);

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
          poster: raw?.imageUrl || raw?.poster_url || raw?.poster || undefined,
          backdrop: raw?.heroImageUrl || raw?.hero_image_url || raw?.backdrop || undefined,
          overview: raw?.synopsis || raw?.overview || undefined,
          rating: typeof raw?.voteAverage === 'number' ? raw.voteAverage : raw?.vote_average,
          firstAirDate: raw?.releaseDate || raw?.release_date || undefined,
          genres: Array.isArray(raw?.genres) ? raw.genres : undefined,
          seeds: typeof raw?.seedCount === 'number' ? raw.seedCount : raw?.seed_count,
          peers: typeof raw?.leechCount === 'number' ? raw.leechCount : raw?.leech_count,
          fileSize: typeof raw?.fileSize === 'number' ? raw.fileSize : raw?.file_size,
        } satisfies SeriesData;
      })
      .filter(Boolean) as SeriesData[];

    console.log(`[DASHBOARD] ${series.length} série(s) valide(s) après filtrage`);
    return { success: true, data: series };
  },
};
