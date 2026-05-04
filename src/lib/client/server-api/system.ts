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

export interface RestartBackendResponse {
  will_exit: boolean;
}

/** Réponse backend pour POST /api/admin/deployment/webos/install-simple */
export interface WebOSInstallSimpleResponse {
  success: boolean;
  message: string;
  ipk_path?: string | null;
  logs: string;
  stderr: string;
}

/** Réponse backend pour POST /api/admin/deployment/webos/relaunch */
export interface WebOSRelaunchResponse {
  success: boolean;
  message: string;
  logs: string;
}

export const systemMethods = {
  async resetBackendDatabase(this: ServerApiClientSystemAccess): Promise<ApiResponse<void>> {
    return this.backendRequest<void>('/api/admin/database/reset', { method: 'POST' });
  },

  async restartBackend(this: ServerApiClientSystemAccess): Promise<ApiResponse<RestartBackendResponse>> {
    return this.backendRequest<RestartBackendResponse>('/api/admin/system/restart', { method: 'POST' });
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

  async getServerLogs(
    this: ServerApiClientSystemAccess,
    params?: { limit?: number }
  ): Promise<ApiResponse<ServerLogsResponse>> {
    const limit = params?.limit ?? 500;
    return this.backendRequest<ServerLogsResponse>(
      `/api/client/server/logs?limit=${Math.min(1000, limit)}`,
      { method: 'GET' }
    );
  },

  async installWebOSSimple(
    this: ServerApiClientSystemAccess,
    device?: string
  ): Promise<ApiResponse<WebOSInstallSimpleResponse>> {
    const body = JSON.stringify({
      device: device && device.trim() ? device.trim() : undefined,
    });
    return this.backendRequest<WebOSInstallSimpleResponse>(
      '/api/admin/deployment/webos/install-simple',
      { method: 'POST', body }
    );
  },

  async relaunchWebOSApp(
    this: ServerApiClientSystemAccess,
    device?: string
  ): Promise<ApiResponse<WebOSRelaunchResponse>> {
    const body = JSON.stringify({
      device: device && device.trim() ? device.trim() : undefined,
    });
    return this.backendRequest<WebOSRelaunchResponse>('/api/admin/deployment/webos/relaunch', {
      method: 'POST',
      body,
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

export interface ServerLogsResponse {
  lines: string[];
}
