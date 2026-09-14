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

export interface RepairDatabaseResponse {
  dry_run: boolean;
  preview: {
    table_counts: Record<string, number>;
    total_rows: number;
  };
  run_result?: {
    backup_path?: string | null;
    deleted_rows_by_table: Record<string, number>;
    total_deleted_rows: number;
  } | null;
  scanned_local_media?: number | null;
  seed_diagnostic?: {
    ratio_mode_enabled: boolean;
    upnp_enabled: boolean;
    librqbit_ok: boolean;
    listen_port?: number | null;
    active_torrents: number;
    seeding_torrents: number;
    warnings: string[];
  } | null;
}

export interface IndexerTmdbCoverageStat {
  indexer_name: string;
  total_torrents: number;
  with_tmdb: number;
  without_tmdb: number;
  tmdb_rate_percent: number;
  tmdb_from_indexer: number;
  tmdb_from_api: number;
  tmdb_from_cache_cloud: number;
  tmdb_from_cache_local: number;
  tmdb_from_manual: number;
}

export interface TmdbCoverageResponse {
  global_total: number;
  global_with_tmdb: number;
  global_without_tmdb: number;
  global_tmdb_rate_percent: number;
  indexers: IndexerTmdbCoverageStat[];
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

  async getDockerUpdateStatus(this: ServerApiClientSystemAccess): Promise<
    ApiResponse<{
      enabled: boolean;
      reason?: string | null;
      compose_dir?: string | null;
      client_channel?: string;
      server_channel?: string;
    }>
  > {
    return this.backendRequest('/api/client/docker-update/status', { method: 'GET' });
  },

  async startDockerUpdate(
    this: ServerApiClientSystemAccess
  ): Promise<ApiResponse<{ started: boolean; message: string; helper_container?: string | null }>> {
    return this.backendRequest('/api/admin/system/docker-update', {
      method: 'POST',
      body: JSON.stringify({ confirm: true }),
    });
  },

  async forceCacheCleanup(this: ServerApiClientSystemAccess): Promise<ApiResponse<CleanupCacheResponse>> {
    return this.backendRequest<CleanupCacheResponse>('/api/media/cache/cleanup', { method: 'POST' });
  },

  async repairDatabase(
    this: ServerApiClientSystemAccess,
    body: {
      dry_run: boolean;
      create_backup?: boolean;
      run_library_scan?: boolean;
      enrich_existing?: boolean;
      confirm_phrase?: string;
    }
  ): Promise<ApiResponse<RepairDatabaseResponse>> {
    return this.backendRequest<RepairDatabaseResponse>('/api/admin/database/repair', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },

  async getTmdbCoverageStats(
    this: ServerApiClientSystemAccess
  ): Promise<ApiResponse<TmdbCoverageResponse>> {
    return this.backendRequest<TmdbCoverageResponse>('/api/admin/database/tmdb-coverage', {
      method: 'GET',
    });
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

  /** Récupère la liste des jobs de transcodage actifs + snapshot ressources */
  async getTranscodeJobs(
    this: ServerApiClientSystemAccess
  ): Promise<ApiResponse<TranscodeJobsResponse>> {
    return this.backendRequest<TranscodeJobsResponse>('/api/admin/transcode/jobs', {
      method: 'GET',
    });
  },

  /** Kill un job de transcodage par ID */
  async killTranscodeJob(
    this: ServerApiClientSystemAccess,
    jobId: string
  ): Promise<ApiResponse<KillTranscodeJobResponse>> {
    return this.backendRequest<KillTranscodeJobResponse>(`/api/admin/transcode/jobs/${encodeURIComponent(jobId)}`, {
      method: 'DELETE',
    });
  },

  /** Récupère le snapshot ressources système (alternative si besoin) */
  async getAdminResources(
    this: ServerApiClientSystemAccess
  ): Promise<ApiResponse<AdminResourcesResponse>> {
    return this.backendRequest<AdminResourcesResponse>('/api/admin/system/resources', {
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
  encoding_hwaccel?: string | null;
  cuda_decode_available?: boolean;
}

export interface ServerLogsResponse {
  lines: string[];
}

/** Job de transcodage actif */
export interface TranscodeJob {
  id: string;
  file_name: string;
  job_type: 'DirectPlay' | 'QuickTranscode' | 'FullTranscode';
  encoder: string; // ex: 'libx264', 'h264_nvenc', 'h264_qsv'
  started_at: string; // ISO timestamp
  duration_seconds: number;
  is_cpu_intensive?: boolean;
}

/** Snapshot des ressources système avec warning optionnel */
export interface AdminResourcesResponse {
  load_avg_1min?: number | null;
  load_avg_5min?: number | null;
  load_avg_15min?: number | null;
  cpu_percent?: number | null;
  memory_used_mb?: number | null;
  memory_total_mb?: number | null;
  gpu_available?: boolean;
  heavy_transcode_warning?: boolean;
}

/** Liste des jobs de transcodage actifs */
export interface TranscodeJobsResponse {
  jobs: TranscodeJob[];
  resources?: AdminResourcesResponse;
}

/** Réponse après kill d'un job */
export interface KillTranscodeJobResponse {
  success: boolean;
  message: string;
}
