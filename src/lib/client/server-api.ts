/**
 * Client API pour communication avec le serveur principal (popcorn)
 * Ce client gère l'authentification, les requêtes API et le refresh automatique des tokens
 * 
 * Ce fichier assemble les modules modulaires depuis server-api/
 */

// Imports des types
import type {
  ApiResponse,
  SetupStatus,
  IndexerFormData,
  Indexer,
  IndexerTypeInfo,
  DashboardData,
  ContentItem,
  FilmData,
  SeriesData,
  SearchParams,
  SearchResult,
  StreamResponse,
  LibraryItem,
  AuthResponse,
} from './server-api/types.js';

import type {
  CreateTorrentParams,
  PublishC411Params,
  PublishC411Response,
  C411UploadCookiesResponse,
  C411BatchEvent,
  UploaderPreviewResponse,
  UploadMediaValidationResponse,
  PublishedUploadMediaEntry,
  CheckDuplicateResponse,
  CancelTorrentCreationResponse,
  ActiveTorrentCreationEntry,
  MultiTrackerUploadResult,
} from './server-api/upload-tracker.js';

import type { LibraryMediaEntry } from './server-api/library.js';

// Imports des utilitaires
import { isDemoMode } from '../backend-config.js';
import { getDemoServerApi } from './server-api-demo.js';

// Import de la base
import { 
  ServerApiClientBase, 
  type ConnectionFailureListener, 
  type ConnectionSuccessListener 
} from './server-api/base.js';

// Imports des modules de méthodes
import { authMethods } from './server-api/auth.js';
import { mediaMethods } from './server-api/media.js';
import { libraryMethods } from './server-api/library.js';
import { localMediaMethods } from './server-api/local-media.js';
import { uploadTrackerMethods } from './server-api/upload-tracker.js';
import { healthMethods } from './server-api/health.js';
import { indexersMethods } from './server-api/indexers.js';
import { settingsMethods } from './server-api/settings.js';
import { syncMethods } from './server-api/sync.js';
import { dashboardMethods } from './server-api/dashboard.js';
import { twoFactorMethods } from './server-api/two-factor.js';
import { quickConnectMethods } from './server-api/quick-connect.js';
import { localUsersMethods } from './server-api/local-users.js';
import { friendsMethods } from './server-api/friends.js';
import { requestsMethods } from './server-api/requests.js';
import { systemMethods } from './server-api/system.js';

// Ré-exporter les types pour compatibilité
export type {
  ApiResponse,
  SetupStatus,
  IndexerFormData,
  Indexer,
  IndexerTypeInfo,
  DashboardData,
  ContentItem,
  FilmData,
  SeriesData,
  SearchParams,
  SearchResult,
  StreamResponse,
  LibraryItem,
  AuthResponse,
} from './server-api/types.js';

export type {
  ConnectionFailureListener,
  ConnectionSuccessListener
} from './server-api/base.js';

class ServerApiClient extends ServerApiClientBase {
  /**
   * Définit l'URL du serveur (client Astro)
   * Note: Dans le navigateur, cette méthode est ignorée car le client doit toujours se connecter à lui-même
   * via window.location.origin. Cette méthode est utile uniquement en SSR ou pour les tests.
   */
  setServerUrl(url: string): void {
    if (typeof window !== 'undefined') {
      if (typeof console !== 'undefined' && console.warn) {
        console.warn('[server-api] setServerUrl() appelé dans le navigateur - l\'URL backend est gérée par le stockage local');
      }
      return;
    }
    
    let normalizedUrl = url.trim();
    try {
      const urlObj = new URL(normalizedUrl);
      if (urlObj.protocol === 'https:' && urlObj.port === '443') urlObj.port = '';
      if (urlObj.protocol === 'http:' && urlObj.port === '80') urlObj.port = '';
      normalizedUrl = urlObj.toString().replace(/\/$/, '');
    } catch { /* ignore */ }
    
    this.baseUrl = normalizedUrl;
  }
}

/**
 * Interface pour toutes les méthodes publiques de ServerApiClient
 * Ces méthodes sont ajoutées via Object.assign depuis les modules
 */
interface IServerApiClientPublic {
  // Auth methods
  register(email: string, password: string, inviteCode: string): Promise<ApiResponse<{ user: { id: string; email: string } }>>;
  login(email: string, password: string): Promise<ApiResponse<AuthResponse>>;
  loginCloud(email: string, password: string): Promise<ApiResponse<AuthResponse>>;
  registerCloud(email: string, password: string, inviteCode: string): Promise<ApiResponse<AuthResponse>>;
  logout(): void;
  getMe(): Promise<ApiResponse<{ id: string; email: string }>>;

  // Two-Factor Authentication methods
  getTwoFactorStatus(): Promise<ApiResponse<{ enabled: boolean }>>;
  enableTwoFactor(): Promise<ApiResponse<{ message: string }>>;
  disableTwoFactor(): Promise<ApiResponse<{ message: string }>>;
  sendTwoFactorCode(): Promise<ApiResponse<{ message: string; expiresAt?: number }>>;
  verifyTwoFactorCode(tempToken: string, code: string): Promise<ApiResponse<{
    user: { id: string; email: string };
    accessToken: string;
    refreshToken: string;
    jwtSecret?: string;
  }>>;

  // Quick Connect methods
  initQuickConnect(): Promise<ApiResponse<{ code: string; secret: string; expiresAt: number }>>;
  authorizeQuickConnect(code: string): Promise<ApiResponse<{ message: string; secret?: string }>>;
  getQuickConnectStatus(secret: string): Promise<ApiResponse<{
    status: 'pending' | 'authorized' | 'used' | 'expired';
    authorized: boolean;
    userId?: string;
  }>>;
  connectQuickConnect(secret: string): Promise<ApiResponse<{
    user: { id: string; email: string };
    accessToken: string;
    refreshToken: string;
    jwtSecret?: string;
    backendUrl?: string;
  }>>;

  // Media methods
  search(params: SearchParams): Promise<ApiResponse<SearchResult[]>>;
  getTorrentGroup(slug: string): Promise<ApiResponse<any>>;
  getTorrentGroupByTmdbId(tmdbId: number, title?: string): Promise<ApiResponse<any>>;
  getTorrentById(id: string): Promise<ApiResponse<any>>;
  getStream(contentId: string): Promise<ApiResponse<StreamResponse>>;
  getTorrentFileList(params: {
    infoHash?: string;
    magnet?: string;
    url?: string;
    indexerId?: string;
    torrentId?: string;
    guid?: string;
    indexerIdType?: string;
    indexerName?: string;
    relativeUrl?: string;
    indexerTypeId?: string;
  }): Promise<ApiResponse<import('./server-api/media.js').TorrentListFileEntry[]>>;
  getSeriesEpisodes(slug: string): Promise<ApiResponse<import('./server-api/media.js').SeriesEpisodesResponse>>;
  getSeriesEpisodesByTmdbId(tmdbId: number): Promise<ApiResponse<import('./server-api/media.js').SeriesEpisodesResponse>>;
  getTmdbTvSeasonDetail(tmdbId: number, seasonNumber: number, language?: string): Promise<ApiResponse<any>>;
  getScrubThumbnailsMeta(localMediaId: string, opts?: { torrentRelativePath?: string | null }): Promise<any>;
  generateScrubThumbnails(localMediaId: string, opts?: { force?: boolean; torrentRelativePath?: string | null; durationHintSeconds?: number | null }): Promise<any>;

  // Library methods
  getLibrary(): Promise<ApiResponse<LibraryItem[]>>;
  getLibraryFromBaseUrl(baseUrl: string): Promise<ApiResponse<LibraryItem[]>>;
  getLibrarySyncStatusFromBaseUrl(baseUrl: string): Promise<ApiResponse<{ sync_in_progress: boolean; scanning_source_id?: string }>>;
  addToLibrary(contentId: string, title: string, type: 'movie' | 'tv', encryptedData?: string): Promise<ApiResponse<LibraryItem>>;
  removeFromLibrary(libraryId: string): Promise<ApiResponse<void>>;
  getFavorites(): Promise<ApiResponse<LibraryItem[]>>;
  addFavorite(contentId: string, encryptedData?: string): Promise<ApiResponse<LibraryItem>>;
  removeFavorite(favoriteId: string): Promise<ApiResponse<void>>;
  scanLocalMedia(): Promise<ApiResponse<string>>;
  findLocalMediaByInfoHash(infoHash: string): Promise<ApiResponse<any>>;

  // Connection status
  addConnectionFailureListener(cb: ConnectionFailureListener): void;
  addConnectionSuccessListener(cb: ConnectionSuccessListener): void;

  // Health methods
  checkServerHealth(): Promise<ApiResponse<{ status: string }>>;
  getSetupStatus(): Promise<ApiResponse<SetupStatus>>;
  getStorageStats(): Promise<ApiResponse<{ used_bytes: number; total_bytes?: number; available_bytes?: number; storage_retention_days?: number }>>;
  patchStorageRetention(storageRetentionDays: number | null): Promise<ApiResponse<{ used_bytes: number; total_bytes?: number; available_bytes?: number; storage_retention_days?: number }>>;

  // Indexers methods
  getIndexers(): Promise<ApiResponse<Indexer[]>>;
  getIndexerTypes(): Promise<ApiResponse<IndexerTypeInfo[]>>;
  createIndexer(data: IndexerFormData): Promise<ApiResponse<Indexer>>;
  updateIndexer(id: string, data: Partial<IndexerFormData>): Promise<ApiResponse<Indexer>>;
  deleteIndexer(id: string): Promise<ApiResponse<void>>;
  getIndexerCategories(indexerId: string): Promise<ApiResponse<Record<string, { enabled: boolean; genres?: number[] }>>>;
  updateIndexerCategories(indexerId: string, categories: string[] | Record<string, { enabled: boolean; genres?: number[] }>): Promise<ApiResponse<void>>;
  getIndexerAvailableCategories(indexerId: string): Promise<ApiResponse<Array<{ id: string; name: string; description?: string }>>>;
  getTmdbGenres(): Promise<ApiResponse<{ movies: Array<{ id: number; name: string }>; tv: Array<{ id: number; name: string }> }>>;
  testIndexer(id: string): Promise<ApiResponse<any>>;
  testIndexerStream(id: string, onProgress?: (event: { type: string; query?: string; index?: number; total?: number; count?: number; success?: boolean; error?: string }) => void): Promise<ApiResponse<any>>;
  getBulkTorrentZipPreferences(indexerId: string): Promise<ApiResponse<import('./server-api/indexers.js').BulkTorrentZipPreferences>>;
  putBulkTorrentZipPreferences(indexerId: string, body: import('./server-api/indexers.js').BulkTorrentZipPreferences): Promise<ApiResponse<import('./server-api/indexers.js').BulkTorrentZipPreferences>>;
  previewBulkTorrentZipFromFile(indexerId: string, file: File): Promise<ApiResponse<import('./server-api/indexers.js').BulkTorrentZipPreview>>;
  previewBulkTorrentZipFromUrl(indexerId: string, url: string): Promise<ApiResponse<import('./server-api/indexers.js').BulkTorrentZipPreview>>;
  importBulkTorrentZip(indexerId: string, previewId: string, paths: string[]): Promise<ApiResponse<import('./server-api/indexers.js').BulkTorrentZipImportResult>>;

  // Settings methods
  getTmdbKey(): Promise<ApiResponse<{ apiKey: string | null; hasKey: boolean }>>;
  getTmdbKeyExport(): Promise<ApiResponse<{ apiKey: string | null; hasKey: boolean }>>;
  saveTmdbKey(key: string): Promise<ApiResponse<void>>;
  deleteTmdbKey(): Promise<ApiResponse<void>>;
  testTmdbKey(): Promise<ApiResponse<{ valid: boolean; message?: string }>>;
  getClientTorrentConfig(): Promise<ApiResponse<any>>;
  updateClientTorrentListenPort(port: number): Promise<ApiResponse<{ listen_port: number }>>;
  getRatioConfig(): Promise<ApiResponse<{ mode_enabled: boolean; source: string }>>;
  getSeedingDiagnostic(): Promise<ApiResponse<{ upnp_enabled: boolean; ratio_mode_enabled: boolean; librqbit_ok: boolean; listen_port: number | null }>>;
  updateRatioConfig(mode_enabled: boolean): Promise<ApiResponse<{ mode_enabled: boolean; source: string }>>;
  getRatioStats(): Promise<ApiResponse<{
    total_uploaded_bytes: number;
    total_downloaded_bytes: number;
    ratio: number;
    torrent_count: number;
    seeding_count: number;
    torrents: Array<{ info_hash: string; name: string; state: string; progress: number; uploaded_bytes: number; downloaded_bytes: number; ratio: number }>;
  }>>;
  getRatioTorrentTrackers(infoHash: string): Promise<ApiResponse<{ tracker_urls: string[] }>>;
  postRatioTest(): Promise<ApiResponse<{ mode_enabled: boolean; librqbit_ok: boolean; torrent_count: number; message: string }>>;
  postRatioTestSeed(options?: { tracker_url?: string; uploaded_mb?: number; info_hash?: string }): Promise<ApiResponse<{ success: boolean; tracker_url: string; uploaded_bytes: number; response_status: number; message: string }>>;
  getMediaPaths(): Promise<ApiResponse<{ download_dir_root: string; films_path: string | null; series_path: string | null; default_path: string | null; films_root: string; series_root: string }>>;
  putMediaPaths(body: { films_path?: string | null; series_path?: string | null; default_path?: string | null }): Promise<ApiResponse<{ download_dir_root: string; films_path: string | null; series_path: string | null; default_path: string | null; films_root: string; series_root: string }>>;
  listExplorerFiles(path?: string): Promise<ApiResponse<Array<{ name: string; path: string; is_directory: boolean; size?: number; modified?: number }>>>;
  listLibrarySourceExplorerFiles(path?: string): Promise<ApiResponse<Array<{ name: string; path: string; is_directory: boolean; size?: number; modified?: number }>>>;
  setLibrarySourceEnabled(id: string, is_enabled: boolean): Promise<ApiResponse<void>>;
  getLibraryMedia(): Promise<ApiResponse<LibraryMediaEntry[]>>;
  updateLibraryMedia(id: string, file_path: string): Promise<ApiResponse<LibraryMediaEntry>>;
  deleteLibraryMedia(id: string): Promise<ApiResponse<void>>;
  deleteLibraryMediaFile(id: string): Promise<ApiResponse<void>>;
  createTorrentForLibraryMedia(params: CreateTorrentParams): Promise<ApiResponse<void>>;
  publishC411(params: PublishC411Params): Promise<ApiResponse<PublishC411Response>>;
  getC411UploadCookies(): Promise<ApiResponse<C411UploadCookiesResponse>>;
  putC411UploadCookies(body: { raw_cookie?: string; session_cookie?: string; csrf_cookie?: string; passkey?: string; api_key?: string }): Promise<ApiResponse<void>>;
  publishC411Batch(params: { announce_url: string; local_media_ids?: string[] }, onEvent: (event: C411BatchEvent) => void): Promise<ApiResponse<void>>;
  uploadLibraryMedia(params: {
    local_media_id: string;
    trackers: string[];
    piece_size_override?: number;
    screenshot_base_url?: string;
    signal?: AbortSignal;
  }): Promise<ApiResponse<MultiTrackerUploadResult>>;
  getTorrentProgress(localMediaId: string): Promise<ApiResponse<{ progress?: number | null }>>;
  getActiveTorrentCreations(): Promise<ApiResponse<ActiveTorrentCreationEntry[]>>;
  cancelTorrentCreation(localMediaId: string): Promise<ApiResponse<CancelTorrentCreationResponse>>;
  validateUploadMedia(localMediaId: string): Promise<ApiResponse<UploadMediaValidationResponse>>;
  getPublishedUploads(): Promise<ApiResponse<PublishedUploadMediaEntry[]>>;
  clearFailedUploads(): Promise<ApiResponse<{ deleted: number }>>;
  syncTrackerCorrectionRules(tracker?: string): Promise<ApiResponse<{ rules_synced: number; tracker: string }>>;
  generateScreenshots(localMediaId: string): Promise<ApiResponse<{ count: number; screenshot_base_url: string }>>;
  checkDuplicateOnIndexer(params: { indexer_id: string; local_media_ids: string[] }): Promise<ApiResponse<CheckDuplicateResponse>>;
  getUploadPreview(localMediaId: string, tracker?: string, screenshotBaseUrl?: string): Promise<ApiResponse<UploaderPreviewResponse>>;
  getTorrentFilesForReseed(): Promise<ApiResponse<import('./server-api/upload-tracker.js').ReseedTorrentInfo[]>>;
  downloadTorrentFileForReseed(infoHash: string): Promise<ApiResponse<Blob> & { filename?: string }>;

  // Sync methods
  getSyncStatus(): Promise<ApiResponse<any>>;
  startSync(indexerIds?: string | string[]): Promise<ApiResponse<string>>;
  stopSync(): Promise<ApiResponse<void>>;
  getSyncSettings(): Promise<ApiResponse<any>>;
  updateSyncSettings(settings: any): Promise<ApiResponse<void>>;
  clearSyncTorrents(): Promise<ApiResponse<number>>;
  downloadSyncLog(): Promise<ApiResponse<void>>;
  getSyncHistory(limit?: number): Promise<ApiResponse<import('./server-api/sync.js').SyncHistoryEntry[]>>;
  addSyncHistory(entry: Omit<import('./server-api/sync.js').SyncHistoryEntry, 'id'>): Promise<ApiResponse<import('./server-api/sync.js').SyncHistoryEntry>>;

  // System methods
  resetBackendDatabase(): Promise<ApiResponse<void>>;
  forceCacheCleanup(): Promise<ApiResponse<{ cleaned_count: number }>>;
  getTranscodingConfig(): Promise<ApiResponse<{ max_concurrent_transcodings: number }>>;
  updateTranscodingConfig(body: {
    max_concurrent_transcodings: number;
  }): Promise<ApiResponse<{ max_concurrent_transcodings: number }>>;
  getSystemResources(): Promise<
    ApiResponse<{
      process_memory_mb: number;
      process_cpu_usage_percent: number;
      system_memory_total_mb: number | null;
      system_memory_used_mb: number | null;
      gpu_available: boolean;
      hwaccels: string[];
    }>
  >;
  getServerLogs(params?: { limit?: number }): Promise<ApiResponse<{ lines: string[] }>>;
  restartBackend(): Promise<ApiResponse<{ will_exit: boolean }>>;

  // Dashboard methods
  getDashboardData(): Promise<ApiResponse<DashboardData>>;
  getDashboardDataPhase1(language?: string, options?: object): Promise<ApiResponse<DashboardData>>;
  getDashboardDataPhase2(
    language?: string,
    options?: object & { popularMovieIds?: string[]; popularSeriesIds?: string[] }
  ): Promise<ApiResponse<{ recentAdditions: ContentItem[]; fastTorrents: ContentItem[] }>>;
  getFilmsData(): Promise<ApiResponse<FilmData[]>>;
  getSeriesData(): Promise<ApiResponse<SeriesData[]>>;

  // Local Users methods
  createLocalUser(request: { cloud_account_id: string; email: string; password_hash: string; display_name?: string }): Promise<ApiResponse<{ id: string; cloud_account_id: string; email: string; display_name: string | null; is_active: boolean; email_verified: boolean; created_at: number; updated_at: number }>>;
  listLocalUsers(cloudAccountId: string): Promise<ApiResponse<Array<{ id: string; cloud_account_id: string; email: string; display_name: string | null; is_active: boolean; email_verified: boolean; created_at: number; updated_at: number }>>>;
  getLocalUser(userId: string): Promise<ApiResponse<{ id: string; cloud_account_id: string; email: string; display_name: string | null; is_active: boolean; email_verified: boolean; created_at: number; updated_at: number }>>;
  updateLocalUser(userId: string, displayName?: string): Promise<ApiResponse<{ id: string; cloud_account_id: string; email: string; display_name: string | null; is_active: boolean; email_verified: boolean; created_at: number; updated_at: number }>>;
  deleteLocalUser(userId: string): Promise<ApiResponse<void>>;

  // Friends methods (backend)
  syncFriendShares(payload: { replace_all: boolean; friends: Array<{ local_user_id: string; share_type: 'none' | 'all' | 'selected'; media_ids?: string[] }> }): Promise<ApiResponse<string>>;

  // Favoris / à regarder plus tard (sync cloud)
  listMediaFavorites(params?: { limit?: number; offset?: number }): Promise<ApiResponse<import('./server-api/requests.js').MediaFavorite[]>>;
  addMediaFavorite(data: { tmdb_id: number; tmdb_type: string; category: string }): Promise<ApiResponse<import('./server-api/requests.js').MediaFavorite>>;
  removeMediaFavorite(tmdbId: number, tmdbType: string): Promise<ApiResponse<boolean>>;
  checkMediaFavorite(tmdbId: number, tmdbType: string): Promise<ApiResponse<{ is_favorite: boolean }>>;
}

/** Augmenter le type ServerApiClient pour inclure toutes les méthodes publiques */
interface ServerApiClient extends IServerApiClientPublic {}

// Fusionner les types pour que ServerApiClient ait toutes les méthodes publiques
type ServerApiClientComplete = ServerApiClient & IServerApiClientPublic;

// Assembler les méthodes des modules
Object.assign(ServerApiClient.prototype, 
  authMethods,
  mediaMethods,
  libraryMethods,
  localMediaMethods,
  uploadTrackerMethods,
  healthMethods,
  indexersMethods,
  settingsMethods,
  syncMethods,
  dashboardMethods,
  twoFactorMethods,
  quickConnectMethods,
  localUsersMethods,
  friendsMethods,
  requestsMethods,
  systemMethods
);

// Instance réelle (utilisée quand isDemoMode() est false)
const realServerApi = new ServerApiClient() as ServerApiClientComplete;

/**
 * En mode démo, les appels API sont délégués à un client simulé (données en mémoire).
 * Sinon, on utilise le client réel (backend Rust).
 */
export const serverApi = new Proxy(realServerApi, {
  get(target, prop, receiver) {
    if (typeof window !== 'undefined' && isDemoMode()) {
      const demo = getDemoServerApi();
      const val = (demo as Record<string | symbol, unknown>)[prop];
      if (val !== undefined) {
        if (typeof val === 'function') {
          return (val as (...args: unknown[]) => unknown).bind(demo);
        }
        return val;
      }
    }
    return Reflect.get(target, prop, receiver);
  },
}) as ServerApiClientComplete;
