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
    opts?: string | { device?: string; ip?: string; passphrase?: string }
  ): Promise<ApiResponse<WebOSInstallSimpleResponse>> {
    const params =
      typeof opts === 'string'
        ? { device: opts }
        : {
            device: opts?.device,
            ip: opts?.ip,
            passphrase: opts?.passphrase,
          };
    const body = JSON.stringify({
      device: params.device?.trim() || undefined,
      ip: params.ip?.trim() || undefined,
      passphrase: params.passphrase?.trim() || undefined,
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

  /** Récupère le status complet des transcodages (jobs + ressources + warning) - ENDPOINT PRÉFÉRÉ */
  async getTranscodeStatus(
    this: ServerApiClientSystemAccess
  ): Promise<ApiResponse<TranscodeJobsResponse>> {
    const rawRes = await this.backendRequest<TranscodeStatusResponse | RawTranscodeJob[]>(
      '/api/admin/transcode/status',
      { method: 'GET' }
    );
    
    if (!rawRes.success || !rawRes.data) {
      return rawRes as ApiResponse<TranscodeJobsResponse>;
    }

    // Cas 1: réponse serveur = array de jobs (ancien format /jobs)
    if (Array.isArray(rawRes.data)) {
      return {
        success: true,
        data: {
          jobs: rawRes.data.map(normalizeTranscodeJob),
        },
      };
    }

    // Cas 2: réponse serveur = TranscodeStatusResponse
    const status = rawRes.data;
    const jobs = (status.jobs || []).map(normalizeTranscodeJob);
    
    let resources: AdminResourcesResponse | undefined;
    if (status.system) {
      resources = normalizeResources(status.system);
      // Détecter warning via string warning ou heavy_transcode_warning
      if (status.warning && status.warning.trim()) {
        resources.heavy_transcode_warning = true;
      }
    }

    return {
      success: true,
      data: { jobs, resources },
    };
  },

  /** Récupère la liste des jobs de transcodage actifs + snapshot ressources (fallback) */
  async getTranscodeJobs(
    this: ServerApiClientSystemAccess
  ): Promise<ApiResponse<TranscodeJobsResponse>> {
    const rawRes = await this.backendRequest<TranscodeJobsResponse | RawTranscodeJob[]>(
      '/api/admin/transcode/jobs',
      { method: 'GET' }
    );

    if (!rawRes.success || !rawRes.data) {
      return rawRes as ApiResponse<TranscodeJobsResponse>;
    }

    // Cas 1: array de jobs bruts
    if (Array.isArray(rawRes.data)) {
      return {
        success: true,
        data: {
          jobs: rawRes.data.map(normalizeTranscodeJob),
        },
      };
    }

    // Cas 2: déjà normalisé (client-friendly) mais re-normaliser pour sécurité
    const existing = rawRes.data as TranscodeJobsResponse;
    return {
      success: true,
      data: {
        jobs: existing.jobs.map(j => normalizeTranscodeJob(j as any)),
        resources: existing.resources ? normalizeResources(existing.resources as any) : undefined,
      },
    };
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

  /** Récupère le snapshot ressources système (optionnel, fallback si status unavailable) */
  async getAdminResources(
    this: ServerApiClientSystemAccess
  ): Promise<ApiResponse<AdminResourcesResponse>> {
    const rawRes = await this.backendRequest<RawSystemResources>(
      '/api/admin/system/resources',
      { method: 'GET' }
    );

    if (!rawRes.success || !rawRes.data) {
      return rawRes as ApiResponse<AdminResourcesResponse>;
    }

    return {
      success: true,
      data: normalizeResources(rawRes.data),
    };
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

/** Job de transcodage actif - format serveur brut */
interface RawTranscodeJob {
  job_id?: string;
  id?: string;
  pid?: number;
  file_name?: string;
  job_type?: 'HLS' | 'MP4' | 'CAR' | 'DirectPlay' | 'QuickTranscode' | 'FullTranscode';
  encoder?: string;
  started_at?: string;
  cpu_percent?: number;
  memory_mb?: number;
}

/** Job de transcodage actif - format normalisé client */
export interface TranscodeJob {
  id: string;
  pid?: number;
  file_name: string;
  job_type: 'HLS' | 'MP4' | 'CAR' | 'DirectPlay' | 'QuickTranscode' | 'FullTranscode';
  encoder: string;
  started_at: string;
  duration_seconds: number;
  cpu_percent?: number;
  memory_mb?: number;
  is_cpu_intensive?: boolean;
}

/** Ressources système - format serveur brut */
interface RawSystemResources {
  load_average_1m?: number | null;
  load_average_5m?: number | null;
  load_average_15m?: number | null;
  load_avg_1min?: number | null;
  load_avg_5min?: number | null;
  load_avg_15min?: number | null;
  cpu_percent?: number | null;
  memory_used_mb?: number | null;
  memory_total_mb?: number | null;
  gpu_available?: boolean;
  heavy_transcode_warning?: boolean;
}

/** Snapshot des ressources système avec warning optionnel - format normalisé */
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

/** Status complet des transcodages - réponse de /api/admin/transcode/status */
export interface TranscodeStatusResponse {
  active_jobs: number;
  active_mp4_count?: number;
  active_hls_count?: number;
  jobs?: RawTranscodeJob[];
  system?: RawSystemResources;
  warning?: string | null;
}

/** Liste des jobs de transcodage actifs - réponse de /api/admin/transcode/jobs */
export interface TranscodeJobsResponse {
  jobs: TranscodeJob[];
  resources?: AdminResourcesResponse;
}

/** Réponse après kill d'un job */
export interface KillTranscodeJobResponse {
  success: boolean;
  message: string;
}

/**
 * Normalise un job brut du serveur en format client
 */
function normalizeTranscodeJob(raw: RawTranscodeJob): TranscodeJob {
  const id = raw.id || raw.job_id || 'unknown';
  const file_name = raw.file_name || id;
  const job_type = raw.job_type || 'HLS';
  const encoder = raw.encoder || 'unknown';
  const started_at = raw.started_at || new Date().toISOString();
  
  // Calculer duration_seconds si started_at est disponible
  let duration_seconds = 0;
  try {
    const start = new Date(started_at);
    duration_seconds = Math.floor((Date.now() - start.getTime()) / 1000);
  } catch {
    duration_seconds = 0;
  }

  // CPU intensif si libx264 (CPU) ou cpu_percent élevé
  const is_cpu_intensive = encoder.includes('libx264') || (raw.cpu_percent != null && raw.cpu_percent > 50);

  return {
    id,
    pid: raw.pid,
    file_name,
    job_type,
    encoder,
    started_at,
    duration_seconds,
    cpu_percent: raw.cpu_percent,
    memory_mb: raw.memory_mb,
    is_cpu_intensive,
  };
}

/**
 * Normalise les ressources système du serveur en format client
 */
function normalizeResources(raw: RawSystemResources): AdminResourcesResponse {
  return {
    load_avg_1min: raw.load_avg_1min ?? raw.load_average_1m,
    load_avg_5min: raw.load_avg_5min ?? raw.load_average_5m,
    load_avg_15min: raw.load_avg_15min ?? raw.load_average_15m,
    cpu_percent: raw.cpu_percent,
    memory_used_mb: raw.memory_used_mb,
    memory_total_mb: raw.memory_total_mb,
    gpu_available: raw.gpu_available,
    heavy_transcode_warning: raw.heavy_transcode_warning,
  };
}
