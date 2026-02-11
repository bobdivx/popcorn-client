import type { ApiResponse } from './types.js';

interface ServerApiClientSystemAccess {
  backendRequest<T>(endpoint: string, options?: RequestInit): Promise<ApiResponse<T>>;
}

export interface CleanupCacheResponse {
  cleaned_count: number;
}

export interface TranscodingConfigResponse {
  max_concurrent_transcodings: number;
}

export const systemMethods = {
  async resetBackendDatabase(this: ServerApiClientSystemAccess): Promise<ApiResponse<void>> {
    return this.backendRequest<void>('/api/admin/database/reset', { method: 'POST' });
  },

  async forceCacheCleanup(this: ServerApiClientSystemAccess): Promise<ApiResponse<CleanupCacheResponse>> {
    return this.backendRequest<CleanupCacheResponse>('/api/media/cache/cleanup', { method: 'POST' });
  },

  async getTranscodingConfig(
    this: ServerApiClientSystemAccess
  ): Promise<ApiResponse<TranscodingConfigResponse>> {
    return this.backendRequest<TranscodingConfigResponse>('/api/media/config/transcoding', {
      method: 'GET',
    });
  },

  async updateTranscodingConfig(
    this: ServerApiClientSystemAccess,
    body: { max_concurrent_transcodings: number }
  ): Promise<ApiResponse<TranscodingConfigResponse>> {
    return this.backendRequest<TranscodingConfigResponse>('/api/media/config/transcoding', {
      method: 'PUT',
      body: JSON.stringify(body),
    });
  },

  async getSystemResources(
    this: ServerApiClientSystemAccess
  ): Promise<ApiResponse<SystemResourcesResponse>> {
    return this.backendRequest<SystemResourcesResponse>('/api/media/resources', {
      method: 'GET',
    });
  },
};

export interface SystemResourcesResponse {
  process_memory_mb: number;
  process_cpu_usage_percent: number;
  system_memory_total_mb: number | null;
  system_memory_used_mb: number | null;
  gpu_available: boolean;
  hwaccels: string[];
}
