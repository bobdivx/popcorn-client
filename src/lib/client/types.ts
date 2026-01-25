/**
 * Types TypeScript pour le client popcorn-vercel
 * Types partagés entre les composants et l'API client
 */

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

// ==================== SETUP ====================

export interface SetupStatus {
  needsSetup: boolean;
  hasUsers?: boolean;   // Nouveau : des utilisateurs existent dans la DB locale
  hasIndexers: boolean;
  hasBackendConfig?: boolean;
  hasTmdbKey: boolean;
  hasTorrents: boolean;
  hasDownloadLocation?: boolean;
  /**
   * Indique si le backend Rust est joignable au moment du check.
   * Important: permet de ne PAS déclencher le wizard sur un simple reboot
   * (frontend up, backend pas encore prêt) ou sur un timeout transitoire.
   */
  backendReachable?: boolean;
}

export interface IndexerFormData {
  name: string;
  baseUrl: string;
  apiKey: string;
  jackettIndexerName: string;
  isEnabled: boolean;
  isDefault: boolean;
  priority: number;
  indexerTypeId?: string | null;
  configJson?: string | null;
}

export interface Indexer {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string | null;
  jackettIndexerName: string | null;
  isEnabled: boolean;
  isDefault: boolean;
  priority: number;
  fallbackIndexerId?: string | null;
  indexerTypeId?: string | null;
  configJson?: string | null;
}

export type IndexerType = string;

export interface IndexerTypeInfo {
  id: string;
  name: string;
  description?: string;
}

// ==================== DASHBOARD ====================

export interface DashboardData {
  hero?: HeroContent;
  continueWatching?: ContentItem[];
  popularMovies?: ContentItem[];
  popularSeries?: ContentItem[];
  recentAdditions?: ContentItem[];
}

export interface HeroContent {
  id: string;
  title: string;
  overview?: string;
  poster?: string;
  backdrop?: string;
  type: 'movie' | 'tv';
  releaseDate?: string;
  rating?: number;
}

export interface ContentItem {
  id: string;
  title: string;
  type: 'movie' | 'tv';
  poster?: string;
  backdrop?: string;
  year?: number;
  overview?: string;
  rating?: number;
  releaseDate?: string;
  // Pour les séries
  firstAirDate?: string;
  // Genres (depuis TMDB)
  genres?: string[];
  // ID TMDB pour identification
  tmdbId?: number | null;
  // Pour "Reprendre la lecture"
  progress?: number; // Pourcentage de progression (0-100)
  lastWatched?: string; // Date ISO
  // Stats temps réel pour améliorations "Mieux que Netflix"
  seeds?: number; // Nombre de seeds du torrent
  peers?: number; // Nombre de peers du torrent
  codec?: 'x264' | 'x265' | 'AV1'; // Codec vidéo
  quality?: 'Remux' | '4K' | '1080p' | '720p' | '480p'; // Qualité vidéo
  fileSize?: number; // Taille du fichier en bytes
  downloadSpeed?: number; // Vitesse de téléchargement en bytes/s (pour barre de santé)
  isDownloading?: boolean; // Indique si le téléchargement est actif (pour afficher barre de santé)
  sources?: Array<{
    tracker: string; // Nom du tracker
    seeds: number;
    peers: number;
    quality?: 'Remux' | '4K' | '1080p' | '720p' | '480p';
    codec?: 'x264' | 'x265' | 'AV1';
    fileSize?: number;
  }>; // Multi-sources : agrégation de plusieurs trackers
  trailerUrl?: string; // URL du trailer pour animation immersive
}

export interface FilmData extends ContentItem {
  type: 'movie';
  releaseDate?: string; // Rendre optionnel pour éviter les erreurs si absent
}

export interface SeriesData extends ContentItem {
  type: 'tv';
  firstAirDate?: string; // Rendre optionnel pour éviter les erreurs si absent
  numberOfSeasons?: number;
  numberOfEpisodes?: number;
}

// ==================== SEARCH ====================

export interface SearchParams {
  q: string;
  type?: 'movie' | 'tv';
  year?: number;
  page?: number;
  /** 'local' = DB uniquement, 'indexer' = indexeurs uniquement. Omis = recherche en 2 phases (local puis indexer) */
  source?: 'local' | 'indexer';
  /** Si fourni, les résultats indexeur sont persistés en DB (media + variants). Par défaut utilise l'utilisateur connecté. */
  user_id?: string;
}

export interface SearchResult {
  id: string;
  title: string;
  type: 'movie' | 'tv';
  poster?: string;
  year?: number;
  overview?: string;
  /** TMDB id lorsque disponible (DB locale ou enrichissement indexeurs) */
  tmdbId?: number;
}

// ==================== STREAMING ====================

export interface StreamResponse {
  streamUrl: string;
  hlsUrl: string;
  subtitles?: Array<{
    lang: string;
    url: string;
  }>;
}

// ==================== LIBRARY ====================

export interface LibraryItem {
  id: string;
  contentId: string;
  title: string;
  type: 'movie' | 'tv';
  poster?: string;
  addedAt: string;
  encryptedData?: string; // Données chiffrées E2E
}

// ==================== USER ====================

export interface User {
  id: string;
  email: string;
  createdAt?: string;
}

// ==================== CLIENT TORRENT API ====================

export interface ClientTorrentStats {
  info_hash: string;
  name: string;
  state: 'queued' | 'downloading' | 'seeding' | 'paused' | 'completed' | 'error';
  downloaded_bytes: number;
  uploaded_bytes: number;
  total_bytes: number;
  progress: number;
  download_speed: number; // bytes/s
  upload_speed: number;   // bytes/s
  peers_connected: number;
  peers_total: number;
  seeders: number;
  leechers: number;
  eta_seconds: number | null;
  download_dir?: string;
  files_size?: number;
  status_reason?: string;
  is_private?: boolean; // Indique si le torrent est privé (private=1 ou tracker avec passkey)
}

export interface AddTorrentResponse {
  info_hash: string;
}

export interface AddMagnetRequest {
  magnet_uri: string;
  name: string;
  for_streaming?: boolean;
}

// Types pour les logs de torrent (réexport depuis api/torrents.ts pour compatibilité)
export interface TorrentLogEntry {
  timestamp: number;
  level: string;
  message: string;
}
