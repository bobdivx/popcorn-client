import type { ApiResponse } from '../types.js';

interface ServerApiClientAccess {
  backendRequest<T>(endpoint: string, options?: RequestInit): Promise<ApiResponse<T>>;
}

export interface AiHealth {
  ok: boolean;
  provider: string;
  model_reachable: boolean;
  model?: string | null;
}

export interface AiReleaseVariant {
  id: string;
  name?: string;
  resolution?: string | null;
  language?: string | null;
  codec?: string | null;
  source?: string | null;
  seed_count?: number;
}

export interface AiTmdbChoice {
  id: number;
  type: string;
  title: string;
  year?: string | null;
}

export const aiMethods = {
  async aiHealth(this: ServerApiClientAccess): Promise<ApiResponse<AiHealth>> {
    return this.backendRequest<AiHealth>('/api/client/ai/health', { method: 'GET' });
  },

  async aiRelease(
    this: ServerApiClientAccess,
    body: {
      locale: string;
      preferred_quality?: string;
      languages?: string[];
      variants: AiReleaseVariant[];
    },
  ): Promise<ApiResponse<{ id?: string | null; summary: string; source: string }>> {
    return this.backendRequest('/api/client/ai/release', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },

  async aiTmdbMatch(
    this: ServerApiClientAccess,
    body: {
      locale: string;
      query: string;
      current_tmdb_id?: number | null;
      candidates: Array<{ id: number; type?: string; title: string; year?: string | null }>;
    },
  ): Promise<ApiResponse<{ summary: string; choices: AiTmdbChoice[]; source: string }>> {
    return this.backendRequest('/api/client/ai/tmdb-match', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },

  async aiSearch(
    this: ServerApiClientAccess,
    body: { locale: string; query: string },
  ): Promise<ApiResponse<{ rewritten: boolean; query: string; media_type?: string | null; summary: string; source: string }>> {
    return this.backendRequest('/api/client/ai/search', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },

  async aiTonight(
    this: ServerApiClientAccess,
    body: {
      locale: string;
      items: Array<{ id: string; title: string; type?: string; seeds?: number; in_library?: boolean }>;
    },
  ): Promise<ApiResponse<{ ids: string[]; summary: string; source: string }>> {
    return this.backendRequest('/api/client/ai/tonight', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },

  async aiParseRequest(
    this: ServerApiClientAccess,
    body: { locale: string; text: string; media_type?: string; language?: string; season?: number },
  ): Promise<ApiResponse<{
    title_query: string;
    media_type: string;
    season?: number | null;
    language?: string | null;
    summary: string;
    source: string;
  }>> {
    return this.backendRequest('/api/client/ai/request', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },

  async aiUpload(
    this: ServerApiClientAccess,
    body: { locale: string; file_name?: string; title?: string },
  ): Promise<ApiResponse<{
    category: string;
    language: string;
    quality: string;
    description: string;
    summary: string;
    source: string;
  }>> {
    return this.backendRequest('/api/client/ai/upload', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },

  async aiDiagnose(
    this: ServerApiClientAccess,
    body: { locale: string; message?: string },
  ): Promise<ApiResponse<{ action: string; summary: string; source: string }>> {
    return this.backendRequest('/api/client/ai/diagnose', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },

  async aiGetSettings(this: ServerApiClientAccess): Promise<ApiResponse<{ has_key: boolean; masked_key?: string | null; model: string }>> {
    return this.backendRequest('/api/client/ai/settings', { method: 'GET' });
  },

  async aiSaveSettings(
    this: ServerApiClientAccess,
    body: { api_key?: string; model?: string },
  ): Promise<ApiResponse<{ has_key: boolean; masked_key?: string | null; model: string }>> {
    return this.backendRequest('/api/client/ai/settings', {
      method: 'PUT',
      body: JSON.stringify(body),
    });
  },

  async aiClearSettings(this: ServerApiClientAccess): Promise<ApiResponse<{ has_key: boolean; masked_key?: string | null; model: string }>> {
    return this.backendRequest('/api/client/ai/settings', { method: 'DELETE' });
  },
};
