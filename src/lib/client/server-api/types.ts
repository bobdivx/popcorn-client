/**
 * Types et interfaces pour le client API
 * Ré-exports depuis ../types avec types spécifiques additionnels
 */

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
} from '../types.js';

/**
 * Types spécifiques au module server-api
 */
export interface AuthResponse {
  user: {
    id: string;
    email: string;
  };
  accessToken: string;
  refreshToken: string;
  cloudAccessToken?: string;
  cloudRefreshToken?: string;
}
