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
  hasIndexers: boolean;
  hasBackendConfig?: boolean;
  hasTmdbKey: boolean;
  hasTorrents: boolean;
  hasDownloadLocation?: boolean;
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
  // Pour "Reprendre la lecture"
  progress?: number; // Pourcentage de progression (0-100)
  lastWatched?: string; // Date ISO
}

export interface FilmData extends ContentItem {
  type: 'movie';
  releaseDate: string;
}

export interface SeriesData extends ContentItem {
  type: 'tv';
  firstAirDate: string;
  numberOfSeasons?: number;
  numberOfEpisodes?: number;
}

// ==================== SEARCH ====================

export interface SearchParams {
  q: string;
  type?: 'movie' | 'tv';
  year?: number;
  page?: number;
}

export interface SearchResult {
  id: string;
  title: string;
  type: 'movie' | 'tv';
  poster?: string;
  year?: number;
  overview?: string;
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
