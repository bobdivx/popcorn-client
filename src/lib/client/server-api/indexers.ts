/**
 * MÃ©thodes de gestion des indexers
 */

import type { ApiResponse, Indexer, IndexerFormData, IndexerTypeInfo } from './types.js';

interface ServerApiClientIndexersAccess {
  backendRequest<T>(endpoint: string, options?: RequestInit): Promise<ApiResponse<T>>;
}

export const indexersMethods = {
  async getIndexers(this: ServerApiClientIndexersAccess): Promise<ApiResponse<Indexer[]>> {
    const res = await this.backendRequest<any[]>('/api/client/admin/indexers', { method: 'GET' });
    if (!res.success) return res as ApiResponse<Indexer[]>;
    const indexers: Indexer[] = (Array.isArray(res.data) ? res.data : []).map((idx: any) => ({
      id: idx.id,
      name: idx.name,
      baseUrl: idx.base_url,
      apiKey: idx.api_key || null,
      jackettIndexerName: idx.jackett_indexer_name || null,
      isEnabled: idx.is_enabled === 1 || idx.is_enabled === true,
      isDefault: idx.is_default === 1 || idx.is_default === true,
      priority: idx.priority || 0,
      fallbackIndexerId: idx.fallback_indexer_id || null,
      indexerTypeId: idx.indexer_type_id || null,
      configJson: idx.config_json || null,
    }));
    return { success: true, data: indexers };
  },
  async getIndexerTypes(this: ServerApiClientIndexersAccess): Promise<ApiResponse<IndexerTypeInfo[]>> {
    return this.backendRequest<IndexerTypeInfo[]>('/api/admin/indexers/types', { method: 'GET' });
  },
  async createIndexer(this: ServerApiClientIndexersAccess, data: IndexerFormData): Promise<ApiResponse<Indexer>> {
    const id = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
    const payload: any = {
      id,
      name: data.name,
      base_url: data.baseUrl,
      api_key: data.apiKey || null,
      jackett_indexer_name: data.jackettIndexerName || null,
      is_enabled: data.isEnabled,
      is_default: data.isDefault,
      priority: data.priority,
      indexer_type_id: data.indexerTypeId || null,
      config_json: data.configJson || null,
    };
    const res = await this.backendRequest<any>('/api/client/admin/indexers', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    if (!res.success) return res as ApiResponse<Indexer>;
    const idx: any = res.data;
    return {
      success: true,
      data: {
        id: idx.id || id,
        name: idx.name || data.name,
        baseUrl: idx.base_url || data.baseUrl,
        apiKey: idx.api_key || data.apiKey || null,
        jackettIndexerName: idx.jackett_indexer_name || data.jackettIndexerName || null,
        isEnabled: idx.is_enabled === 1 || idx.is_enabled === true || data.isEnabled,
        isDefault: idx.is_default === 1 || idx.is_default === true || data.isDefault,
        priority: idx.priority ?? data.priority ?? 0,
        fallbackIndexerId: idx.fallback_indexer_id || null,
        indexerTypeId: idx.indexer_type_id || data.indexerTypeId || null,
        configJson: idx.config_json || data.configJson || null,
      },
    };
  },
  async updateIndexer(this: ServerApiClientIndexersAccess, id: string, data: Partial<IndexerFormData>): Promise<ApiResponse<Indexer>> {
    const payload: any = {};
    if (data.name !== undefined) payload.name = data.name;
    if (data.baseUrl !== undefined) payload.base_url = data.baseUrl;
    if (data.apiKey !== undefined) payload.api_key = data.apiKey || null;
    if (data.jackettIndexerName !== undefined) payload.jackett_indexer_name = data.jackettIndexerName || null;
    if (data.isEnabled !== undefined) payload.is_enabled = data.isEnabled;
    if (data.isDefault !== undefined) payload.is_default = data.isDefault;
    if (data.priority !== undefined) payload.priority = data.priority;
    if (data.indexerTypeId !== undefined) payload.indexer_type_id = data.indexerTypeId || null;
    if (data.configJson !== undefined) payload.config_json = data.configJson || null;
    const res = await this.backendRequest<any>(`/api/client/admin/indexers/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
    if (!res.success) return res as ApiResponse<Indexer>;
    const idx: any = res.data;
    return {
      success: true,
      data: {
        id: idx.id || id,
        name: idx.name,
        baseUrl: idx.base_url,
        apiKey: idx.api_key || null,
        jackettIndexerName: idx.jackett_indexer_name || null,
        isEnabled: idx.is_enabled === 1 || idx.is_enabled === true,
        isDefault: idx.is_default === 1 || idx.is_default === true,
        priority: idx.priority || 0,
        fallbackIndexerId: idx.fallback_indexer_id || null,
        indexerTypeId: idx.indexer_type_id || null,
        configJson: idx.config_json || null,
      },
    };
  },
  async deleteIndexer(this: ServerApiClientIndexersAccess, id: string): Promise<ApiResponse<void>> {
    return this.backendRequest<void>(`/api/client/admin/indexers/${encodeURIComponent(id)}`, { method: 'DELETE' });
  },
  async getIndexerCategories(this: ServerApiClientIndexersAccess, indexerId: string): Promise<ApiResponse<string[]>> {
    return this.backendRequest<string[]>(`/api/admin/indexers/${encodeURIComponent(indexerId)}/categories`, { method: 'GET' });
  },
  async updateIndexerCategories(this: ServerApiClientIndexersAccess, indexerId: string, categories: string[]): Promise<ApiResponse<void>> {
    return this.backendRequest<void>(`/api/admin/indexers/${encodeURIComponent(indexerId)}/categories`, { method: 'PUT', body: JSON.stringify({ categories }) });
  },
  async getIndexerAvailableCategories(this: ServerApiClientIndexersAccess, indexerId: string): Promise<ApiResponse<Array<{ id: string; name: string; description?: string }>>> {
    return this.backendRequest<Array<{ id: string; name: string; description?: string }>>(`/api/admin/indexers/${encodeURIComponent(indexerId)}/categories/available`, { method: 'GET' });
  },
  async testIndexer(this: ServerApiClientIndexersAccess, id: string): Promise<ApiResponse<{ success: boolean; message?: string; totalResults?: number; resultsCount?: number; successfulQueries?: number; failedQueries?: Array<[string, string]>; testQueries?: string[]; categoriesFound?: string[]; sampleResults?: Array<{ title?: string; size?: number; seeders?: number; peers?: number; leechers?: number; category?: string; tmdbId?: number; slug?: string }>; sampleResult?: any }>> {
    return this.backendRequest(`/api/indexers/test`, { method: 'POST', body: JSON.stringify({ indexer_id: id }) });
  },
};
