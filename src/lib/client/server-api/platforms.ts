/**
 * Plateformes de streaming (France) — appels au serveur Popcornn.
 * Le serveur interroge TMDB (watch providers / discover) avec sa propre clé et met en cache :
 * aucune clé TMDB ne transite par le client. Routes réservées aux membres connectés
 * (le token cloud est joint automatiquement par backendRequest).
 */

import type { ApiResponse } from '../types.js';

interface ServerApiClientAccess {
  backendRequest<T>(endpoint: string, options?: RequestInit): Promise<ApiResponse<T>>;
  getCurrentUserId?(): string | null;
}

export interface StreamingPlatform {
  slug: string;
  name: string;
  tmdb_name?: string;
  provider_id: number;
  provider_ids: number[];
  logo_path: string | null;
  logo_url?: string | null;
  display_priority: number;
  networks?: number[];
}

export interface PlatformRowDef {
  id: string;
  kind: 'exclusives' | 'genre';
  title: string;
  media_type?: 'movie' | 'tv';
  genre?: number;
}

export interface PlatformTitle {
  id: number;
  media_type: 'movie' | 'tv';
  title: string | null;
  original_title?: string | null;
  overview?: string | null;
  poster_path: string | null;
  backdrop_path: string | null;
  vote_average?: number | null;
  vote_count?: number | null;
  popularity?: number | null;
  genre_ids?: number[] | null;
  release_date?: string | null;
  first_air_date?: string | null;
  exclusivity: 'original' | 'exclusive' | null;
  in_library: boolean;
}

export interface WatchProviderOffer {
  provider_id: number;
  provider_name: string;
  logo_path: string | null;
  logo_url: string | null;
  display_priority: number;
  platform_slug: string | null;
}

export interface TitleWatchProviders {
  region: string;
  tmdb_id: number;
  media_type: 'movie' | 'tv';
  link: string | null;
  flatrate: WatchProviderOffer[];
  free: WatchProviderOffer[];
  ads: WatchProviderOffer[];
  rent: WatchProviderOffer[];
  buy: WatchProviderOffer[];
}

function userHeaders(client: ServerApiClientAccess): HeadersInit {
  const userId = client.getCurrentUserId?.() ?? null;
  return userId ? { 'X-User-ID': userId } : {};
}

function langQuery(language?: string): string {
  return language ? `language=${encodeURIComponent(language)}` : '';
}

export const platformsMethods = {
  async listStreamingPlatforms(
    this: ServerApiClientAccess,
    language?: string
  ): Promise<ApiResponse<{ region: string; platforms: StreamingPlatform[] }>> {
    const q = langQuery(language);
    return this.backendRequest<any>(`/api/platforms${q ? `?${q}` : ''}`, { method: 'GET', headers: userHeaders(this) });
  },

  async getStreamingPlatform(
    this: ServerApiClientAccess,
    slug: string,
    language?: string
  ): Promise<ApiResponse<{ platform: StreamingPlatform; region: string; rows: PlatformRowDef[] }>> {
    const q = langQuery(language);
    return this.backendRequest<any>(`/api/platforms/${encodeURIComponent(slug)}${q ? `?${q}` : ''}`, {
      method: 'GET',
      headers: userHeaders(this),
    });
  },

  async getStreamingPlatformExclusives(
    this: ServerApiClientAccess,
    slug: string,
    language?: string
  ): Promise<ApiResponse<{ results: PlatformTitle[] }>> {
    const q = langQuery(language);
    return this.backendRequest<any>(`/api/platforms/${encodeURIComponent(slug)}/exclusives${q ? `?${q}` : ''}`, {
      method: 'GET',
      headers: userHeaders(this),
    });
  },

  async getStreamingPlatformRow(
    this: ServerApiClientAccess,
    slug: string,
    mediaType: 'movie' | 'tv',
    genre: number,
    language?: string
  ): Promise<ApiResponse<{ results: PlatformTitle[] }>> {
    const q = new URLSearchParams();
    q.set('type', mediaType);
    q.set('genre', String(genre));
    if (language) q.set('language', language);
    return this.backendRequest<any>(`/api/platforms/${encodeURIComponent(slug)}/row?${q.toString()}`, {
      method: 'GET',
      headers: userHeaders(this),
    });
  },

  async getTitleWatchProviders(
    this: ServerApiClientAccess,
    mediaType: 'movie' | 'tv',
    tmdbId: number
  ): Promise<ApiResponse<TitleWatchProviders>> {
    return this.backendRequest<any>(`/api/discover/${mediaType}/${tmdbId}/watch-providers`, {
      method: 'GET',
      headers: userHeaders(this),
    });
  },
};
