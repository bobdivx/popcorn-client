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
