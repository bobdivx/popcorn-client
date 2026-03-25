/**
 * MÃ©thodes de gestion des indexers
 */

import type { ApiResponse, Indexer, IndexerFormData, IndexerTypeInfo } from './types.js';

export interface BulkTorrentZipEntry {
  path: string;
  size: number;
}

export interface BulkTorrentZipPreview {
  previewId: string;
  torrentCount: number;
  entries: BulkTorrentZipEntry[];
}

export interface BulkTorrentZipImportResult {
  added: string[];
  failed: Array<{ path: string; error: string }>;
}

export interface BulkTorrentZipPreferences {
  sourceUrl?: string | null;
  selectedRelativePaths: string[];
}

interface ServerApiClientIndexersAccess {
  backendRequest<T>(endpoint: string, options?: RequestInit): Promise<ApiResponse<T>>;
  getCurrentUserId(): string | null;
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
    // Le backend attend un corps complet (SyncIndexerRequest) : id + name + base_url + is_enabled + is_default + priority obligatoires
    const payload: any = {
      id,
      name: data.name ?? '',
      base_url: data.baseUrl ?? '',
      api_key: data.apiKey !== undefined ? (data.apiKey || null) : null,
      jackett_indexer_name: data.jackettIndexerName !== undefined ? (data.jackettIndexerName || null) : null,
      is_enabled: data.isEnabled ?? true,
      is_default: data.isDefault ?? false,
      priority: data.priority ?? 0,
      indexer_type_id: data.indexerTypeId !== undefined ? (data.indexerTypeId || null) : null,
      config_json: data.configJson !== undefined ? (data.configJson || null) : null,
    };
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
  async getIndexerCategories(this: ServerApiClientIndexersAccess, indexerId: string): Promise<ApiResponse<Record<string, { enabled: boolean; genres?: number[] }>>> {
    return this.backendRequest<Record<string, { enabled: boolean; genres?: number[] }>>(`/api/admin/indexers/${encodeURIComponent(indexerId)}/categories`, { method: 'GET' });
  },
  async updateIndexerCategories(
    this: ServerApiClientIndexersAccess, 
    indexerId: string, 
    categories: string[] | Record<string, { enabled: boolean; genres?: number[] }>
  ): Promise<ApiResponse<void>> {
    // Support des deux formats : simple (string[]) pour compatibilité, ou hiérarchique (Record)
    if (Array.isArray(categories)) {
      return this.backendRequest<void>(`/api/admin/indexers/${encodeURIComponent(indexerId)}/categories`, { method: 'PUT', body: JSON.stringify({ categories }) });
    } else {
      return this.backendRequest<void>(`/api/admin/indexers/${encodeURIComponent(indexerId)}/categories`, { method: 'PUT', body: JSON.stringify({ categories_config: categories }) });
    }
  },
  async getIndexerAvailableCategories(this: ServerApiClientIndexersAccess, indexerId: string): Promise<ApiResponse<Array<{ id: string; name: string; description?: string }>>> {
    return this.backendRequest<Array<{ id: string; name: string; description?: string }>>(`/api/admin/indexers/${encodeURIComponent(indexerId)}/categories/available`, { method: 'GET' });
  },
  async getTmdbGenres(this: ServerApiClientIndexersAccess): Promise<ApiResponse<{ movies: Array<{ id: number; name: string }>; tv: Array<{ id: number; name: string }> }>> {
    const userId = this.getCurrentUserId();
    const headers: HeadersInit = userId ? { 'X-User-ID': userId } : {};
    return this.backendRequest<{ movies: Array<{ id: number; name: string }>; tv: Array<{ id: number; name: string }> }>('/api/admin/indexers/tmdb-genres', { method: 'GET', headers });
  },
  async testIndexer(this: ServerApiClientIndexersAccess, id: string): Promise<ApiResponse<{ success: boolean; message?: string; totalResults?: number; resultsCount?: number; successfulQueries?: number; failedQueries?: Array<[string, string]>; testQueries?: string[]; categoriesFound?: string[]; sampleResults?: Array<{ title?: string; size?: number; seeders?: number; peers?: number; leechers?: number; category?: string; tmdbId?: number; slug?: string }>; sampleResult?: any; apiKeyTest?: { valid: boolean; message: string } }>> {
    return this.backendRequest(`/api/indexers/test`, { method: 'POST', body: JSON.stringify({ indexer_id: id }) });
  },
  async testIndexerStream(
    this: ServerApiClientIndexersAccess,
    id: string,
    onProgress?: (event: { type: string; query?: string; index?: number; total?: number; count?: number; success?: boolean; error?: string }) => void,
  ): Promise<ApiResponse<{ success: boolean; message?: string; totalResults?: number; resultsCount?: number; successfulQueries?: number; failedQueries?: number; testQueries?: string[]; sampleResults?: Array<any>; apiKeyTest?: { valid: boolean; message: string } }>> {
    const base = this.getBackendBaseUrl();
    const url = `${base}/api/indexers/test-stream`;
    const res = await this.nativeFetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ indexer_id: id }),
    }, 60000);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      const msg = (data && typeof data === 'object' && typeof (data as any).error === 'string') ? (data as any).error : `Erreur ${res.status}`;
      return { success: false, error: 'BackendError', message: msg };
    }
    const reader = res.body?.getReader();
    if (!reader) return { success: false, error: 'BackendError', message: 'Pas de flux' };
    const dec = new TextDecoder();
    let buf = '';
    let finalData: any = null;
    function processBlock(block: string): void {
      const m = block.match(/^data:\s*(.+)$/m);
      if (!m) return;
      try {
        const event = JSON.parse(m[1].trim()) as { type: string; query?: string; index?: number; total?: number; count?: number; success?: boolean; error?: string; message?: string; totalResults?: number; successfulQueries?: number; failedQueries?: number; testQueries?: string[]; sampleResults?: any[]; apiKeyTest?: { valid: boolean; message: string } };
        if ((event.type === 'query_done' || event.type === 'api_key_test_done') && onProgress) onProgress(event);
        if (event.type === 'complete') finalData = event;
      } catch (_) {}
    }
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        const lines = buf.split('\n\n');
        buf = lines.pop() ?? '';
        for (const block of lines) processBlock(block);
      }
      if (buf.trim()) processBlock(buf);
    } finally {
      reader.releaseLock();
    }
    if (finalData) {
      return {
        success: true,
        data: {
          success: finalData.success,
          message: finalData.message,
          totalResults: finalData.totalResults,
          resultsCount: finalData.resultsCount,
          successfulQueries: finalData.successfulQueries,
          failedQueries: finalData.failedQueries,
          testQueries: finalData.testQueries,
          sampleResults: finalData.sampleResults,
          apiKeyTest: finalData.apiKeyTest,
          downloadTest: finalData.downloadTest,
        },
      };
    }
    return { success: false, error: 'BackendError', message: 'Test incomplet' };
  },

  async getBulkTorrentZipPreferences(
    this: ServerApiClientIndexersAccess,
    indexerId: string
  ): Promise<ApiResponse<BulkTorrentZipPreferences>> {
    const res = await this.backendRequest<BulkTorrentZipPreferences>(
      `/api/client/admin/indexers/${encodeURIComponent(indexerId)}/bulk-torrent-zip/preferences`,
      { method: 'GET' }
    );
    if (!res.success) return res as ApiResponse<BulkTorrentZipPreferences>;
    const d = res.data as BulkTorrentZipPreferences | undefined;
    return {
      success: true,
      data: {
        sourceUrl: d?.sourceUrl ?? null,
        selectedRelativePaths: Array.isArray(d?.selectedRelativePaths) ? d.selectedRelativePaths : [],
      },
    };
  },

  async putBulkTorrentZipPreferences(
    this: ServerApiClientIndexersAccess,
    indexerId: string,
    body: BulkTorrentZipPreferences
  ): Promise<ApiResponse<BulkTorrentZipPreferences>> {
    return this.backendRequest<BulkTorrentZipPreferences>(
      `/api/client/admin/indexers/${encodeURIComponent(indexerId)}/bulk-torrent-zip/preferences`,
      {
        method: 'PUT',
        body: JSON.stringify({
          sourceUrl: body.sourceUrl ?? null,
          selectedRelativePaths: body.selectedRelativePaths,
        }),
      }
    );
  },

  async previewBulkTorrentZipFromFile(
    this: ServerApiClientIndexersAccess,
    indexerId: string,
    file: File
  ): Promise<ApiResponse<BulkTorrentZipPreview>> {
    const fd = new FormData();
    fd.append('file', file);
    const res = await this.backendRequest<BulkTorrentZipPreview>(
      `/api/client/admin/indexers/${encodeURIComponent(indexerId)}/bulk-torrent-zip/preview`,
      { method: 'POST', body: fd }
    );
    return normalizeBulkPreview(res);
  },

  async previewBulkTorrentZipFromUrl(
    this: ServerApiClientIndexersAccess,
    indexerId: string,
    url: string
  ): Promise<ApiResponse<BulkTorrentZipPreview>> {
    const res = await this.backendRequest<BulkTorrentZipPreview>(
      `/api/client/admin/indexers/${encodeURIComponent(indexerId)}/bulk-torrent-zip/preview-url`,
      { method: 'POST', body: JSON.stringify({ url: url.trim() }) }
    );
    return normalizeBulkPreview(res);
  },

  async importBulkTorrentZip(
    this: ServerApiClientIndexersAccess,
    indexerId: string,
    previewId: string,
    paths: string[]
  ): Promise<ApiResponse<BulkTorrentZipImportResult>> {
    return this.backendRequest<BulkTorrentZipImportResult>(
      `/api/client/admin/indexers/${encodeURIComponent(indexerId)}/bulk-torrent-zip/import`,
      { method: 'POST', body: JSON.stringify({ previewId, paths }) }
    );
  },
};

function normalizeBulkPreview(res: ApiResponse<BulkTorrentZipPreview>): ApiResponse<BulkTorrentZipPreview> {
  if (!res.success) return res as ApiResponse<BulkTorrentZipPreview>;
  const raw = res.data as Record<string, unknown> | undefined;
  if (!raw || typeof raw !== 'object') {
    return { success: false, error: 'BackendError', message: 'Réponse aperçu invalide' };
  }
  const previewId = (raw.previewId ?? raw.preview_id) as string | undefined;
  const torrentCount = (raw.torrentCount ?? raw.torrent_count) as number | undefined;
  const entries = (raw.entries as BulkTorrentZipEntry[] | undefined) ?? [];
  if (!previewId) {
    return { success: false, error: 'BackendError', message: 'Réponse aperçu invalide' };
  }
  return {
    success: true,
    data: {
      previewId,
      torrentCount: typeof torrentCount === 'number' ? torrentCount : entries.length,
      entries,
    },
  };
}
