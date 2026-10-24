/**
 * Modules optionnels du serveur (installés depuis une URL fournie par l'administrateur).
 * Routes admin : /api/client/admin/modules (voir popcorn-modules SPEC.md).
 * Le jeton d'accès éventuel n'est jamais renvoyé par le serveur (`has_token`).
 */

import type { ApiResponse } from '../types.js';

interface ServerApiClientAccess {
  backendRequest<T>(endpoint: string, options?: RequestInit): Promise<ApiResponse<T>>;
}

export interface InstalledModule {
  id: string;
  name: string;
  version: string;
  description?: string | null;
  kind: 'data' | 'native' | 'http' | string;
  provides: string[];
  permissions: string[];
  source_url: string;
  source_ref?: string | null;
  has_token: boolean;
  data_type?: string | null;
  definitions_count?: number | null;
  native_features: string[];
  active: boolean;
  installed_at: string;
  updated_at: string;
}

export interface ModulesList {
  modules: InstalledModule[];
  spec_version: number;
  compiled_features: string[];
}

export interface ModuleInstallResult {
  module: InstalledModule;
  replaced: boolean;
  warnings: string[];
}

export interface ModuleInstallRequest {
  url: string;
  token?: string;
  ref?: string;
}

const BASE = '/api/client/admin/modules';

export const modulesMethods = {
  async listModules(this: ServerApiClientAccess): Promise<ApiResponse<ModulesList>> {
    return this.backendRequest<ModulesList>(BASE, { method: 'GET' });
  },

  async installModule(
    this: ServerApiClientAccess,
    request: ModuleInstallRequest
  ): Promise<ApiResponse<ModuleInstallResult>> {
    const body: ModuleInstallRequest = { url: request.url.trim() };
    const token = request.token?.trim();
    if (token) body.token = token;
    const ref = request.ref?.trim();
    if (ref) body.ref = ref;
    return this.backendRequest<ModuleInstallResult>(`${BASE}/install`, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },

  async updateModule(this: ServerApiClientAccess, id: string): Promise<ApiResponse<ModuleInstallResult>> {
    return this.backendRequest<ModuleInstallResult>(`${BASE}/${encodeURIComponent(id)}/update`, {
      method: 'POST',
    });
  },

  async uninstallModule(
    this: ServerApiClientAccess,
    id: string
  ): Promise<ApiResponse<{ id: string; removed: boolean }>> {
    return this.backendRequest<{ id: string; removed: boolean }>(`${BASE}/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    });
  },
};

// ---------------------------------------------------------------------------
// Modules « process » : binaires signés (minisign + sha256) lancés et supervisés par le serveur.
// Routes admin : /api/client/admin/modules/process (popcorn-modules docs/RUNTIME.md §8.1).
// Un serveur qui ne les connaît pas répond 404 ou 405 : la section est alors masquée.
// ---------------------------------------------------------------------------

export type ProcessModuleState = 'starting' | 'running' | 'degraded' | 'stopped' | 'failed' | string;

export interface ProcessModule {
  id: string;
  kind: 'process';
  enabled: boolean;
  state: ProcessModuleState;
  version: string | null;
  installed_versions: string[];
  pid: number | null;
  restarts: number;
  last_error: string | null;
  health: { status?: string; details?: unknown } | null;
  provides: string[];
  routes?: unknown[];
  ui?: unknown;
  scopes: string[];
  release_url: string;
  signed_by: string | null;
  installed_at: string | null;
}

export interface ProcessModulesList {
  modules: ProcessModule[];
  platform: string | null;
  protocol_version: number;
  allow_unsigned: boolean;
}

export interface ProcessPreviewRequest {
  release_url: string;
  signature_url?: string;
  public_key?: string;
  token?: string;
}

export interface ProcessPreview {
  release: { id: string; version: string; protocol?: number; released_at?: string | null };
  platform: string;
  artifact: { url: string; sha256: string; size: number; entry: string };
  signed: boolean;
  key_id: string | null;
  key_trusted: boolean;
  key_label: string | null;
  offered_public_key: string | null;
  installed_version: string | null;
  is_update: boolean;
}

export interface ProcessJobEvent {
  step: string;
  received?: number;
  total?: number | null;
  version?: string;
  from?: string;
  to?: string;
  code?: string;
  error?: string;
}

export interface ProcessJob {
  job_id: string;
  module_id: string;
  done: boolean;
  events: ProcessJobEvent[];
}

export interface ProcessLogLine {
  /** Millisecondes depuis l'époque Unix. */
  ts: number;
  stream: 'stdout' | 'stderr' | string;
  line: string;
}

export interface TrustedKey {
  /** Identifiant minisign (16 caractères hexadécimaux). */
  key_id: string;
  /** Clé publique base64 (2e ligne d'un fichier .pub minisign). */
  public_key: string;
  label: string;
  added_at?: string | null;
}

export interface TrustKeys {
  keys: TrustedKey[];
  /** id de module → key_id de la clé qui le signe. */
  bindings: Record<string, string>;
  allow_unsigned: boolean;
}

const PBASE = '/api/client/admin/modules/process';
const enc = encodeURIComponent;

/** `true` si l'échec signifie « serveur sans modules process » (route inconnue). */
export function isProcessModulesUnsupported(res: { success: boolean; error?: string; message?: string }): boolean {
  if (res.success) return false;
  if (res.error === 'NotFound') return true;
  return /^Erreur (404|405)$/.test((res.message || '').trim());
}

/**
 * URL de dépôt GitHub → URL de `release.json` de la dernière release ; autre URL inchangée.
 * `https://github.com/o/r` → `https://github.com/o/r/releases/latest/download/release.json`.
 */
export function normalizeReleaseUrl(input: string): string {
  const u = input.trim();
  const m = /^https:\/\/github\.com\/([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/i.exec(u);
  if (m) return `https://github.com/${m[1]}/${m[2]}/releases/latest/download/release.json`;
  return u;
}

export const processModulesMethods = {
  async listProcessModules(this: ServerApiClientAccess): Promise<ApiResponse<ProcessModulesList>> {
    return this.backendRequest<ProcessModulesList>(PBASE, { method: 'GET' });
  },

  async previewProcessModule(
    this: ServerApiClientAccess,
    request: ProcessPreviewRequest
  ): Promise<ApiResponse<{ preview_id: string; preview: ProcessPreview }>> {
    const body: ProcessPreviewRequest = { release_url: normalizeReleaseUrl(request.release_url) };
    if (request.signature_url?.trim()) body.signature_url = request.signature_url.trim();
    if (request.public_key?.trim()) body.public_key = request.public_key.trim();
    if (request.token?.trim()) body.token = request.token.trim();
    return this.backendRequest(`${PBASE}/preview`, { method: 'POST', body: JSON.stringify(body) });
  },

  async installProcessModule(
    this: ServerApiClientAccess,
    previewId: string,
    options: { accept_key?: boolean; approve_key_change?: boolean; reinstall?: boolean } = {}
  ): Promise<ApiResponse<{ job_id: string; module_id: string }>> {
    return this.backendRequest(`${PBASE}/install`, {
      method: 'POST',
      body: JSON.stringify({ preview_id: previewId, ...options }),
    });
  },

  async getProcessJob(this: ServerApiClientAccess, jobId: string): Promise<ApiResponse<ProcessJob>> {
    return this.backendRequest<ProcessJob>(`${PBASE}/jobs/${enc(jobId)}`, { method: 'GET' });
  },

  async processModuleAction(
    this: ServerApiClientAccess,
    id: string,
    action: 'start' | 'stop' | 'restart' | 'rollback' | 'update'
  ): Promise<ApiResponse<{ id?: string; version?: string; job_id?: string; module_id?: string }>> {
    return this.backendRequest(`${PBASE}/${enc(id)}/${action}`, { method: 'POST' });
  },

  async uninstallProcessModule(
    this: ServerApiClientAccess,
    id: string,
    removeData = false
  ): Promise<ApiResponse<{ id: string; data_removed: boolean }>> {
    return this.backendRequest(`${PBASE}/${enc(id)}${removeData ? '?remove_data=true' : ''}`, { method: 'DELETE' });
  },

  async getProcessModuleLogs(
    this: ServerApiClientAccess,
    id: string,
    tail = 200
  ): Promise<ApiResponse<{ id: string; lines: ProcessLogLine[] }>> {
    return this.backendRequest(`${PBASE}/${enc(id)}/logs?tail=${tail}`, { method: 'GET' });
  },

  async getProcessModuleSettings(
    this: ServerApiClientAccess,
    id: string
  ): Promise<ApiResponse<Record<string, unknown>>> {
    return this.backendRequest(`${PBASE}/${enc(id)}/settings`, { method: 'GET' });
  },

  async putProcessModuleSettings(
    this: ServerApiClientAccess,
    id: string,
    settings: Record<string, unknown>
  ): Promise<ApiResponse<{ id: string }>> {
    return this.backendRequest(`${PBASE}/${enc(id)}/settings`, { method: 'PUT', body: JSON.stringify(settings) });
  },

  async addTrustKey(
    this: ServerApiClientAccess,
    publicKey: string,
    label: string
  ): Promise<ApiResponse<{ key_id: string }>> {
    return this.backendRequest(`${PBASE}/trust-keys`, {
      method: 'POST',
      body: JSON.stringify({ public_key: publicKey.trim(), label: label.trim() }),
    });
  },

  async listTrustKeys(this: ServerApiClientAccess): Promise<ApiResponse<TrustKeys>> {
    return this.backendRequest<TrustKeys>(`${PBASE}/trust-keys`, { method: 'GET' });
  },

  async removeTrustKey(
    this: ServerApiClientAccess,
    keyId: string
  ): Promise<ApiResponse<{ key_id: string; removed: boolean }>> {
    return this.backendRequest(`${PBASE}/trust-keys/${enc(keyId)}`, { method: 'DELETE' });
  },
};
