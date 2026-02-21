/**
 * API client pour les demandes de médias (requests), blacklist, discover
 */

import type { ApiResponse } from './types.js';

interface ServerApiClientAccess {
  backendRequest<T>(endpoint: string, options?: RequestInit): Promise<ApiResponse<T>>;
  getCurrentUserId?(): string | null;
}

export interface MediaRequest {
  id: string;
  tmdb_id: number;
  media_type: string;
  status: number; // 1=pending, 2=approved, 3=declined
  requested_by: string;
  modified_by: string | null;
  season_numbers: string | null;
  notes: string | null;
  created_at: number;
  updated_at: number;
}

export interface QuotaStats {
  movie: { limit: number | null; days: number | null; used: number; remaining: number | null; restricted: boolean };
  tv: { limit: number | null; days: number | null; used: number; remaining: number | null; restricted: boolean };
}

export interface BlacklistedItem {
  id: string;
  tmdb_id: number;
  media_type: string;
  user_id: string | null;
  reason: string | null;
  created_at: number;
}

export interface DiscoverSlider {
  id: string;
  title: string;
  slider_type: string;
  data: string | null;
  enabled: number;
  position: number;
  is_builtin: number;
  created_at: number;
  updated_at: number;
}

/** Favori / à regarder plus tard (sync cloud) */
export interface MediaFavorite {
  id: string;
  user_id: string;
  tmdb_id: number;
  tmdb_type: string;
  category: string;
  created_at: number;
}

export const requestsMethods = {
  // Favoris (à regarder plus tard) — header X-User-ID
  async listMediaFavorites(
    this: ServerApiClientAccess,
    params?: { limit?: number; offset?: number }
  ): Promise<ApiResponse<MediaFavorite[]>> {
    const userId = this.getCurrentUserId?.() ?? null;
    const headers: HeadersInit = userId ? { 'X-User-ID': userId } : {};
    const q = new URLSearchParams();
    if (params?.limit != null) q.set('limit', String(params.limit));
    if (params?.offset != null) q.set('offset', String(params.offset));
    const query = q.toString();
    return this.backendRequest<MediaFavorite[]>(`/api/favorites${query ? '?' + query : ''}`, { method: 'GET', headers });
  },

  async addMediaFavorite(
    this: ServerApiClientAccess,
    data: { tmdb_id: number; tmdb_type: string; category: string }
  ): Promise<ApiResponse<MediaFavorite>> {
    const userId = this.getCurrentUserId?.() ?? null;
    const headers: HeadersInit = userId ? { 'X-User-ID': userId } : {};
    return this.backendRequest<MediaFavorite>('/api/favorites', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(data),
    });
  },

  async removeMediaFavorite(
    this: ServerApiClientAccess,
    tmdbId: number,
    tmdbType: string
  ): Promise<ApiResponse<boolean>> {
    const userId = this.getCurrentUserId?.() ?? null;
    const headers: HeadersInit = userId ? { 'X-User-ID': userId } : {};
    return this.backendRequest<boolean>(
      `/api/favorites/${tmdbId}/${encodeURIComponent(tmdbType)}`,
      { method: 'DELETE', headers }
    );
  },

  async checkMediaFavorite(
    this: ServerApiClientAccess,
    tmdbId: number,
    tmdbType: string
  ): Promise<ApiResponse<{ is_favorite: boolean }>> {
    const userId = this.getCurrentUserId?.() ?? null;
    const headers: HeadersInit = userId ? { 'X-User-ID': userId } : {};
    return this.backendRequest<{ is_favorite: boolean }>(
      `/api/favorites/check/${tmdbId}/${encodeURIComponent(tmdbType)}`,
      { method: 'GET', headers }
    );
  },

  async listMediaRequests(
    this: ServerApiClientAccess,
    params?: { user_id?: string; status?: string; limit?: number; offset?: number }
  ): Promise<ApiResponse<MediaRequest[]>> {
    const q = new URLSearchParams();
    if (params?.user_id) q.set('user_id', params.user_id);
    if (params?.status) q.set('status', params.status);
    if (params?.limit) q.set('limit', String(params.limit));
    if (params?.offset) q.set('offset', String(params.offset));
    const query = q.toString();
    return this.backendRequest<MediaRequest[]>(`/api/requests${query ? '?' + query : ''}`, { method: 'GET' });
  },

  async createMediaRequest(
    this: ServerApiClientAccess,
    data: { tmdb_id: number; media_type: string; season_numbers?: number[] }
  ): Promise<ApiResponse<MediaRequest>> {
    return this.backendRequest<MediaRequest>('/api/requests', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async getMediaRequest(this: ServerApiClientAccess, id: string): Promise<ApiResponse<MediaRequest>> {
    return this.backendRequest<MediaRequest>(`/api/requests/${id}`, { method: 'GET' });
  },

  async updateRequestStatus(
    this: ServerApiClientAccess,
    id: string,
    data: { status: string; notes?: string }
  ): Promise<ApiResponse<MediaRequest>> {
    return this.backendRequest<MediaRequest>(`/api/requests/${id}/status`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  },

  async deleteMediaRequest(this: ServerApiClientAccess, id: string): Promise<ApiResponse<unknown>> {
    return this.backendRequest<unknown>(`/api/requests/${id}`, { method: 'DELETE' });
  },

  async getQuotaStats(this: ServerApiClientAccess, userId: string): Promise<ApiResponse<QuotaStats>> {
    return this.backendRequest<QuotaStats>(`/api/users/${encodeURIComponent(userId)}/quota`, { method: 'GET' });
  },

  // Blacklist
  async listBlacklist(
    this: ServerApiClientAccess,
    params?: { user_id?: string; limit?: number; offset?: number }
  ): Promise<ApiResponse<BlacklistedItem[]>> {
    const q = new URLSearchParams();
    if (params?.user_id) q.set('user_id', params.user_id);
    if (params?.limit) q.set('limit', String(params.limit));
    if (params?.offset) q.set('offset', String(params.offset));
    const query = q.toString();
    return this.backendRequest<BlacklistedItem[]>(`/api/blacklist${query ? '?' + query : ''}`, { method: 'GET' });
  },

  async addToBlacklist(
    this: ServerApiClientAccess,
    data: { tmdb_id: number; media_type: string; reason?: string }
  ): Promise<ApiResponse<BlacklistedItem>> {
    return this.backendRequest<BlacklistedItem>('/api/blacklist', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  },

  async removeFromBlacklist(
    this: ServerApiClientAccess,
    tmdbId: number,
    mediaType: string
  ): Promise<ApiResponse<unknown>> {
    return this.backendRequest<unknown>(`/api/blacklist/${tmdbId}/${mediaType}`, { method: 'DELETE' });
  },

  async checkBlacklisted(
    this: ServerApiClientAccess,
    tmdbId: number,
    mediaType: string
  ): Promise<ApiResponse<boolean>> {
    return this.backendRequest<boolean>(`/api/blacklist/${tmdbId}/${encodeURIComponent(mediaType)}`, { method: 'GET' });
  },

  // Discover
  async listDiscoverSliders(this: ServerApiClientAccess): Promise<ApiResponse<DiscoverSlider[]>> {
    return this.backendRequest<DiscoverSlider[]>('/api/discover/sliders', { method: 'GET' });
  },

  async listEnabledDiscoverSliders(this: ServerApiClientAccess): Promise<ApiResponse<DiscoverSlider[]>> {
    return this.backendRequest<DiscoverSlider[]>('/api/discover/sliders/enabled', { method: 'GET' });
  },

  async initializeDiscoverSliders(this: ServerApiClientAccess): Promise<ApiResponse<unknown>> {
    return this.backendRequest<unknown>('/api/discover/sliders/initialize', { method: 'POST' });
  },

  async discoverMovies(
    this: ServerApiClientAccess,
    params?: {
      page?: number;
      language?: string;
      sort_by?: string;
      genre?: string;
      primary_release_date_gte?: string;
      primary_release_date_lte?: string;
      vote_average_gte?: number;
      vote_count_gte?: number;
    }
  ): Promise<ApiResponse<{ results: any[]; page: number; total_pages: number }>> {
    const q = new URLSearchParams();
    if (params?.page) q.set('page', String(params.page));
    if (params?.language) q.set('language', params.language);
    if (params?.sort_by) q.set('sort_by', params.sort_by);
    if (params?.genre) q.set('genre', params.genre);
    if (params?.primary_release_date_gte) q.set('primary_release_date_gte', params.primary_release_date_gte);
    if (params?.primary_release_date_lte) q.set('primary_release_date_lte', params.primary_release_date_lte);
    if (params?.vote_average_gte != null) q.set('vote_average_gte', String(params.vote_average_gte));
    if (params?.vote_count_gte != null) q.set('vote_count_gte', String(params.vote_count_gte));
    const query = q.toString();
    const userId = this.getCurrentUserId?.() ?? null;
    const headers: HeadersInit = userId ? { 'X-User-ID': userId } : {};
    return this.backendRequest<any>(`/api/discover/movies${query ? '?' + query : ''}`, { method: 'GET', headers });
  },

  async getTmdbMovieDetail(
    this: ServerApiClientAccess,
    tmdbId: number,
    language?: string
  ): Promise<ApiResponse<any>> {
    const q = language ? `?language=${encodeURIComponent(language)}` : '';
    const userId = this.getCurrentUserId?.() ?? null;
    const headers: HeadersInit = userId ? { 'X-User-ID': userId } : {};
    return this.backendRequest<any>(`/api/discover/movie/${tmdbId}${q}`, { method: 'GET', headers });
  },

  async getTmdbTvDetail(
    this: ServerApiClientAccess,
    tmdbId: number,
    language?: string
  ): Promise<ApiResponse<any>> {
    const q = language ? `?language=${encodeURIComponent(language)}` : '';
    const userId = this.getCurrentUserId?.() ?? null;
    const headers: HeadersInit = userId ? { 'X-User-ID': userId } : {};
    return this.backendRequest<any>(`/api/discover/tv/${tmdbId}${q}`, { method: 'GET', headers });
  },

  async discoverTv(
    this: ServerApiClientAccess,
    params?: {
      page?: number;
      language?: string;
      sort_by?: string;
      genre?: string;
      first_air_date_gte?: string;
      first_air_date_lte?: string;
      vote_average_gte?: number;
      vote_count_gte?: number;
    }
  ): Promise<ApiResponse<{ results: any[]; page: number; total_pages: number }>> {
    const q = new URLSearchParams();
    if (params?.page) q.set('page', String(params.page));
    if (params?.language) q.set('language', params.language);
    if (params?.sort_by) q.set('sort_by', params.sort_by);
    if (params?.genre) q.set('genre', params.genre);
    if (params?.first_air_date_gte) q.set('first_air_date_gte', params.first_air_date_gte);
    if (params?.first_air_date_lte) q.set('first_air_date_lte', params.first_air_date_lte);
    if (params?.vote_average_gte != null) q.set('vote_average_gte', String(params.vote_average_gte));
    if (params?.vote_count_gte != null) q.set('vote_count_gte', String(params.vote_count_gte));
    const query = q.toString();
    const userId = this.getCurrentUserId?.() ?? null;
    const headers: HeadersInit = userId ? { 'X-User-ID': userId } : {};
    return this.backendRequest<any>(`/api/discover/tv${query ? '?' + query : ''}`, { method: 'GET', headers });
  },

  /** Recherche TMDB par texte (quand aucun torrent trouvé). Résultats exploitables pour "Demander". */
  async searchTmdb(
    this: ServerApiClientAccess,
    params: { q: string; type?: 'movie' | 'tv' | 'all'; language?: string; page?: number }
  ): Promise<ApiResponse<Array<{ id: string; title: string; type: string; poster?: string; year?: number; overview?: string; tmdbId: number }>>> {
    const q = new URLSearchParams();
    q.set('q', params.q);
    if (params.type) q.set('type', params.type);
    if (params.language) q.set('language', params.language);
    if (params.page) q.set('page', String(params.page));
    const userId = this.getCurrentUserId?.() ?? null;
    const headers: HeadersInit = userId ? { 'X-User-ID': userId } : {};
    return this.backendRequest<any>(`/api/discover/search?${q.toString()}`, { method: 'GET', headers });
  },
};
