/**
 * Client API démo : renvoie des données simulées pour une expérience identique
 * sans backend (sync, paramètres, torrents, etc. simulés).
 */

import type {
  ApiResponse,
  SetupStatus,
  DashboardData,
  ContentItem,
  FilmData,
  SeriesData,
  Indexer,
} from './server-api/types.js';

const DEMO_USER_ID = 'demo-user-id';
const DEMO_EMAIL = 'demo@popcorn.local';

function success<T>(data: T): ApiResponse<T> {
  return { success: true, data };
}

function mockContentItem(overrides: Partial<ContentItem> & { id: string; title: string; type: 'movie' | 'tv' }): ContentItem {
  return {
    id: overrides.id,
    title: overrides.title,
    type: overrides.type,
    poster: overrides.poster,
    backdrop: overrides.backdrop,
    overview: overrides.overview,
    rating: overrides.rating,
    releaseDate: overrides.releaseDate,
    tmdbId: overrides.tmdbId ?? null,
    seeds: overrides.seeds,
    peers: overrides.peers,
    quality: overrides.quality,
    codec: overrides.codec,
  };
}

// Torrents gratuits WebTorrent (https://webtorrent.io/free-torrents) — Public Domain / Creative Commons
// Affiches : Wikimedia Commons (CC BY 3.0 Blender Foundation)
const WEBTORRENT_POSTERS = {
  bigBuckBunny:
    'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c5/Big_buck_bunny_poster_big.jpg/300px-Big_buck_bunny_poster_big.jpg',
  sintel: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/8f/Sintel_poster.jpg/300px-Sintel_poster.jpg',
  tearsOfSteel:
    'https://upload.wikimedia.org/wikipedia/commons/thumb/2/20/Tears_of_Steel_poster.jpg/300px-Tears_of_Steel_poster.jpg',
  cosmosLaundromat:
    'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3e/Blu-Ray_of_Cosmos_Laundromat_-_Blender.jpg/300px-Blu-Ray_of_Cosmos_Laundromat_-_Blender.jpg',
} as const;

/** Base URL du site popcorn-web (pour le média démo : Big Buck Bunny hébergé dans public/media). */
function getDemoWebBaseUrl(): string {
  const env = (import.meta.env.PUBLIC_WEB_APP_URL || '').trim().replace(/\/$/, '');
  if (env) return env;
  if (typeof window !== 'undefined' && window.location?.hostname?.includes('popcornn.app')) {
    return `${window.location.protocol}//www.popcornn.app`;
  }
  return 'http://localhost:4321';
}

/** Chemin relatif du MP4 démo sur popcorn-web (public/media/films/Big-Buck/video.mp4). */
const DEMO_LIBRARY_VIDEO_PATH = '/media/films/Big-Buck/video.mp4';

const MOCK_HERO: ContentItem = mockContentItem({
  id: 'big-buck-bunny',
  title: 'Big Buck Bunny',
  type: 'movie',
  poster: WEBTORRENT_POSTERS.bigBuckBunny,
  backdrop: WEBTORRENT_POSTERS.bigBuckBunny,
  overview:
    "Court métrage d'animation open source (Blender Foundation, 2008). Un lapin géant se venge des bullies qui harcèlent les petits animaux. Domaine public.",
  rating: 7.5,
  releaseDate: '2008-04-10',
  tmdbId: 0,
  seeds: 100,
  peers: 50,
  quality: '1080p',
  codec: 'x264',
});

const MOCK_MOVIES: ContentItem[] = [
  mockContentItem({
    id: 'big-buck-bunny',
    title: 'Big Buck Bunny',
    type: 'movie',
    poster: WEBTORRENT_POSTERS.bigBuckBunny,
    backdrop: WEBTORRENT_POSTERS.bigBuckBunny,
    overview: "Court métrage Blender Foundation (2008). Domaine public — torrent de test WebTorrent.",
    rating: 7.5,
    releaseDate: '2008-04-10',
    quality: '1080p',
    codec: 'x264',
    seeds: 100,
    peers: 50,
  }),
  mockContentItem({
    id: 'sintel',
    title: 'Sintel',
    type: 'movie',
    poster: WEBTORRENT_POSTERS.sintel,
    backdrop: WEBTORRENT_POSTERS.sintel,
    overview: "Court métrage Blender Foundation (2010). Une jeune femme part à la recherche d'un dragon. CC BY — WebTorrent.",
    rating: 8.0,
    releaseDate: '2010-09-27',
    quality: '1080p',
    codec: 'x264',
    seeds: 80,
    peers: 20,
  }),
  mockContentItem({
    id: 'tears-of-steel',
    title: 'Tears of Steel',
    type: 'movie',
    poster: WEBTORRENT_POSTERS.tearsOfSteel,
    backdrop: WEBTORRENT_POSTERS.tearsOfSteel,
    overview: "Court métrage Blender Foundation (2012). Science-fiction, mélange prises réelles et 3D. CC BY — WebTorrent.",
    rating: 7.2,
    releaseDate: '2012-09-26',
    quality: '1080p',
    codec: 'x264',
    seeds: 60,
    peers: 15,
  }),
  mockContentItem({
    id: 'cosmos-laundromat',
    title: 'Cosmos Laundromat',
    type: 'movie',
    poster: WEBTORRENT_POSTERS.cosmosLaundromat,
    backdrop: WEBTORRENT_POSTERS.cosmosLaundromat,
    overview: "Court métrage Blender Institute (2015). Franck, un mouton dépressif, rencontre un vendeur mystérieux. CC BY — WebTorrent.",
    rating: 7.8,
    releaseDate: '2015-08-10',
    quality: '1080p',
    codec: 'x265',
    seeds: 45,
    peers: 10,
  }),
];

const MOCK_SERIES: ContentItem[] = [
  mockContentItem({
    id: 'sintel',
    title: 'Sintel',
    type: 'tv',
    poster: WEBTORRENT_POSTERS.sintel,
    backdrop: WEBTORRENT_POSTERS.sintel,
    overview: "Court métrage Blender Foundation (2010). CC BY — WebTorrent.",
    rating: 8.0,
    releaseDate: '2010-09-27',
    quality: '1080p',
    seeds: 80,
    peers: 20,
  }),
  mockContentItem({
    id: 'tears-of-steel',
    title: 'Tears of Steel',
    type: 'tv',
    poster: WEBTORRENT_POSTERS.tearsOfSteel,
    backdrop: WEBTORRENT_POSTERS.tearsOfSteel,
    overview: "Court métrage Blender Foundation (2012). CC BY — WebTorrent.",
    rating: 7.2,
    releaseDate: '2012-09-26',
    quality: '1080p',
    seeds: 60,
    peers: 15,
  }),
];

/**
 * Objet qui simule le client API pour le mode démo.
 * Même interface que ServerApiClient pour les méthodes utilisées par l'UI.
 */
export function createDemoServerApi(): Record<string, unknown> {
  return {
    isAuthenticated(): boolean {
      return true;
    },
    getAccessToken(): string | null {
      return 'demo-token';
    },
    getCurrentUserId(): string | null {
      return DEMO_USER_ID;
    },
    getServerUrl(): string {
      return 'http://demo.local';
    },

    async getSetupStatus(): Promise<ApiResponse<SetupStatus>> {
      return success({
        needsSetup: false,
        hasUsers: true,
        hasIndexers: false,
        hasBackendConfig: true,
        hasTmdbKey: false,
        hasTorrents: false,
        hasDownloadLocation: false,
        backendReachable: true,
      });
    },
    async getMe(): Promise<ApiResponse<{ id: string; email: string }>> {
      return success({ id: DEMO_USER_ID, email: DEMO_EMAIL });
    },
    async checkServerHealth(): Promise<ApiResponse<{ status: string; reachable: boolean }>> {
      return success({ status: 'ok', reachable: true });
    },

    async getDashboardDataPhase1(): Promise<ApiResponse<DashboardData>> {
      return success({
        hero: {
          id: MOCK_HERO.id,
          title: MOCK_HERO.title,
          overview: MOCK_HERO.overview,
          poster: MOCK_HERO.poster,
          backdrop: MOCK_HERO.backdrop,
          type: MOCK_HERO.type,
          releaseDate: MOCK_HERO.releaseDate,
          rating: MOCK_HERO.rating,
        },
        continueWatching: [],
        popularMovies: MOCK_MOVIES,
        popularSeries: MOCK_SERIES,
        recentAdditions: [],
        fastTorrents: [],
      });
    },
    async getDashboardDataPhase2(): Promise<ApiResponse<{ recentAdditions: ContentItem[]; fastTorrents: ContentItem[] }>> {
      return success({ recentAdditions: [], fastTorrents: [] });
    },
    async getDashboardData(): Promise<ApiResponse<DashboardData>> {
      return success({
        hero: {
          id: MOCK_HERO.id,
          title: MOCK_HERO.title,
          overview: MOCK_HERO.overview,
          poster: MOCK_HERO.poster,
          backdrop: MOCK_HERO.backdrop,
          type: MOCK_HERO.type,
          releaseDate: MOCK_HERO.releaseDate,
          rating: MOCK_HERO.rating,
        },
        continueWatching: [],
        popularMovies: MOCK_MOVIES,
        popularSeries: MOCK_SERIES,
        recentAdditions: [],
        fastTorrents: [],
      });
    },
    async getFilmsData(): Promise<ApiResponse<FilmData[]>> {
      const films: FilmData[] = MOCK_MOVIES.map((m) => ({
        ...m,
        firstAirDate: undefined,
      })) as FilmData[];
      return success(films);
    },
    async getSeriesData(): Promise<ApiResponse<SeriesData[]>> {
      const series: SeriesData[] = MOCK_SERIES.map((s) => ({
        ...s,
        firstAirDate: s.releaseDate,
      })) as SeriesData[];
      return success(series);
    },
    async getFilmsDataPaginated(): Promise<ApiResponse<FilmData[]>> {
      return success(MOCK_MOVIES as FilmData[]);
    },
    async getSeriesDataPaginated(): Promise<ApiResponse<SeriesData[]>> {
      return success(MOCK_SERIES as SeriesData[]);
    },

    async getSyncStatus(): Promise<ApiResponse<unknown>> {
      return success({
        is_syncing: false,
        progress: null,
        stats: { films: 0, series: 0 },
      });
    },
    async startSync(): Promise<ApiResponse<void>> {
      return success(undefined);
    },
    async stopSync(): Promise<ApiResponse<void>> {
      return success(undefined);
    },
    async getSyncSettings(): Promise<ApiResponse<unknown>> {
      return success({
        sync_frequency_minutes: 60,
        is_enabled: true,
        max_torrents_per_category: 0,
      });
    },
    async updateSyncSettings(): Promise<ApiResponse<void>> {
      return success(undefined);
    },
    async clearSyncTorrents(): Promise<ApiResponse<number>> {
      return success(0);
    },
    async downloadSyncLog(): Promise<ApiResponse<void>> {
      return success(undefined);
    },

    async getIndexers(): Promise<ApiResponse<Indexer[]>> {
      return success([]);
    },
    async getTmdbKey(): Promise<ApiResponse<{ apiKey: string | null; hasKey: boolean }>> {
      return success({ apiKey: null, hasKey: false });
    },
    async getTmdbKeyExport(): Promise<ApiResponse<{ apiKey: string | null; hasKey: boolean }>> {
      return success({ apiKey: null, hasKey: false });
    },
    async saveTmdbKey(): Promise<ApiResponse<void>> {
      return success(undefined);
    },
    async deleteTmdbKey(): Promise<ApiResponse<void>> {
      return success(undefined);
    },
    async testTmdbKey(): Promise<ApiResponse<{ valid: boolean; message?: string }>> {
      return success({ valid: true });
    },
    async getClientTorrentConfig(): Promise<ApiResponse<unknown>> {
      return success({});
    },
    async getMediaPaths(): Promise<ApiResponse<{ download_dir_root: string; films_path: string | null; series_path: string | null; default_path: string | null; films_root: string; series_root: string }>> {
      return success({
        download_dir_root: '/data/downloads',
        films_path: 'media/films',
        series_path: 'media/series',
        default_path: null,
        films_root: '/data/downloads/media/films',
        series_root: '/data/downloads/media/series',
      });
    },
    async putMediaPaths(): Promise<ApiResponse<{ download_dir_root: string; films_path: string | null; series_path: string | null; default_path: string | null; films_root: string; series_root: string }>> {
      return this.getMediaPaths!();
    },
    async listExplorerFiles(): Promise<ApiResponse<Array<{ name: string; path: string; is_directory: boolean; size?: number; modified?: number }>>> {
      return success([
        { name: 'media', path: 'media', is_directory: true },
        { name: 'downloads', path: 'downloads', is_directory: true },
      ]);
    },

    async getTorrentGroup(): Promise<ApiResponse<unknown>> {
      return success({
        slug: 'demo-group',
        title: MOCK_HERO.title,
        variants: [],
        torrents: [],
      });
    },
    async getTorrentGroupByTmdbId(): Promise<ApiResponse<unknown>> {
      return success({
        slug: 'demo-group',
        title: MOCK_HERO.title,
        variants: [],
        torrents: [],
      });
    },
    async getTorrentById(): Promise<ApiResponse<unknown>> {
      return success({
        id: 'demo-1',
        title: MOCK_HERO.title,
        category: 'films',
      });
    },
    async search(): Promise<ApiResponse<unknown[]>> {
      return success([...MOCK_MOVIES, ...MOCK_SERIES]);
    },
    async getStream(): Promise<ApiResponse<unknown>> {
      return success({ url: '', type: 'hls' });
    },

    async getLibrary(): Promise<ApiResponse<unknown[]>> {
      // Un seul média en démo : Big Buck Bunny (fichier dans popcorn-web public/media/films/Big-Buck/)
      const demoItem = {
        info_hash: 'local_demo_big_buck_bunny',
        name: 'Big Buck Bunny',
        download_path: '/media/films/Big-Buck/video.mp4',
        file_size: null,
        exists: true,
        is_file: true,
        is_directory: false,
        slug: 'demo-big-buck-bunny',
        category: 'films',
        tmdb_id: null,
        tmdb_type: 'movie',
        poster_url: WEBTORRENT_POSTERS.bigBuckBunny,
        hero_image_url: WEBTORRENT_POSTERS.bigBuckBunny,
        synopsis: "Court métrage Blender Foundation (2008). Domaine public — démo.",
        release_date: '2008-04-10',
        genres: null,
        vote_average: 7.5,
        runtime: null,
        quality: '1080p',
        resolution: '1080p',
        video_codec: null,
        audio_codec: null,
        language: null,
        source_format: null,
        is_local_only: true,
        demo_stream_url: `${getDemoWebBaseUrl()}${DEMO_LIBRARY_VIDEO_PATH}`,
      };
      return success([demoItem]);
    },
    async addToLibrary(): Promise<ApiResponse<unknown>> {
      return success({});
    },
    async removeFromLibrary(): Promise<ApiResponse<void>> {
      return success(undefined);
    },
    async getFavorites(): Promise<ApiResponse<unknown[]>> {
      return success([]);
    },
    async addFavorite(): Promise<ApiResponse<unknown>> {
      return success({});
    },
    async removeFavorite(): Promise<ApiResponse<void>> {
      return success(undefined);
    },
    async scanLocalMedia(): Promise<ApiResponse<string>> {
      return success('ok');
    },

    async getIndexerTypes(): Promise<ApiResponse<unknown[]>> {
      return success([]);
    },
    async createIndexer(): Promise<ApiResponse<unknown>> {
      return success({});
    },
    async updateIndexer(): Promise<ApiResponse<unknown>> {
      return success({});
    },
    async deleteIndexer(): Promise<ApiResponse<void>> {
      return success(undefined);
    },
    async getIndexerCategories(): Promise<ApiResponse<unknown>> {
      return success({});
    },
    async updateIndexerCategories(): Promise<ApiResponse<void>> {
      return success(undefined);
    },
    async getIndexerAvailableCategories(): Promise<ApiResponse<unknown[]>> {
      return success([]);
    },
    async getTmdbGenres(): Promise<ApiResponse<unknown>> {
      return success({ movies: [], tv: [] });
    },
    async testIndexer(): Promise<ApiResponse<unknown>> {
      return success({});
    },
    async testIndexerStream(): Promise<ApiResponse<unknown>> {
      return success({});
    },

    async resetBackendDatabase(): Promise<ApiResponse<void>> {
      return success(undefined);
    },
    async forceCacheCleanup(): Promise<ApiResponse<{ cleaned_count: number }>> {
      return success({ cleaned_count: 0 });
    },
    async getTranscodingConfig(): Promise<ApiResponse<{ max_concurrent_transcodings: number }>> {
      return success({ max_concurrent_transcodings: 2 });
    },
    async updateTranscodingConfig(_body: {
      max_concurrent_transcodings: number;
    }): Promise<ApiResponse<{ max_concurrent_transcodings: number }>> {
      return success({ max_concurrent_transcodings: _body.max_concurrent_transcodings });
    },
    async getSystemResources(): Promise<
      ApiResponse<{
        process_memory_mb: number;
        process_cpu_usage_percent: number;
        system_memory_total_mb: number | null;
        system_memory_used_mb: number | null;
        gpu_available: boolean;
        hwaccels: string[];
      }>
    > {
      return success({
        process_memory_mb: 128.5,
        process_cpu_usage_percent: 2.1,
        system_memory_total_mb: 16384,
        system_memory_used_mb: 8192,
        gpu_available: false,
        hwaccels: [],
      });
    },

    async discoverMovies(): Promise<ApiResponse<unknown>> {
      return success({ results: MOCK_MOVIES });
    },
    async discoverTv(): Promise<ApiResponse<unknown>> {
      return success({ results: MOCK_SERIES });
    },

    logout(): void {
      // no-op en démo
    },
    async getTwoFactorStatus(): Promise<ApiResponse<{ enabled: boolean }>> {
      return success({ enabled: false });
    },
    async enableTwoFactor(): Promise<ApiResponse<{ message: string }>> {
      return success({ message: 'ok' });
    },
    async disableTwoFactor(): Promise<ApiResponse<{ message: string }>> {
      return success({ message: 'ok' });
    },
    async sendTwoFactorCode(): Promise<ApiResponse<{ message: string }>> {
      return success({ message: 'ok' });
    },
    async verifyTwoFactorCode(): Promise<ApiResponse<unknown>> {
      return success({});
    },
    async initQuickConnect(): Promise<ApiResponse<unknown>> {
      return success({});
    },
    async authorizeQuickConnect(): Promise<ApiResponse<unknown>> {
      return success({});
    },
    async getQuickConnectStatus(): Promise<ApiResponse<unknown>> {
      return success({});
    },
    async connectQuickConnect(): Promise<ApiResponse<unknown>> {
      return success({});
    },
    async createLocalUser(): Promise<ApiResponse<unknown>> {
      return success({});
    },
    async listLocalUsers(): Promise<ApiResponse<unknown[]>> {
      return success([]);
    },
    async getLocalUser(): Promise<ApiResponse<unknown>> {
      return success({});
    },
    async updateLocalUser(): Promise<ApiResponse<unknown>> {
      return success({});
    },
    async deleteLocalUser(): Promise<ApiResponse<void>> {
      return success(undefined);
    },
    async syncFriendShares(): Promise<ApiResponse<string>> {
      return success('ok');
    },
    async checkTorrentDownload(): Promise<ApiResponse<unknown>> {
      return success({ downloadable: false, status_code: 200, message: 'demo' });
    },
  };
}

let demoApiInstance: ReturnType<typeof createDemoServerApi> | null = null;

export function getDemoServerApi(): ReturnType<typeof createDemoServerApi> {
  if (!demoApiInstance) {
    demoApiInstance = createDemoServerApi();
  }
  return demoApiInstance;
}
