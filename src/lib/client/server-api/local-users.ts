/**
 * Méthodes pour gérer les utilisateurs locaux depuis le backend Rust
 */

import type { ApiResponse } from './types.js';

/**
 * Interface pour accéder aux méthodes privées de ServerApiClient
 */
interface ServerApiClientAccess {
  backendRequest<T>(endpoint: string, options?: RequestInit): Promise<ApiResponse<T>>;
}

export interface LocalUser {
  id: string;
  cloud_account_id: string;
  email: string;
  display_name: string | null;
  is_active: boolean;
  email_verified: boolean;
  created_at: number;
  updated_at: number;
}

export interface CreateLocalUserRequest {
  cloud_account_id: string;
  email: string;
  password_hash: string;
  display_name?: string;
}

export const localUsersMethods = {
  /**
   * Crée un utilisateur local dans le backend Rust
   * Appelé depuis popcorn-web lors de la synchronisation
   */
  async createLocalUser(
    this: ServerApiClientAccess,
    request: CreateLocalUserRequest
  ): Promise<ApiResponse<LocalUser>> {
    return this.backendRequest<LocalUser>('/api/client/admin/local-users', {
      method: 'POST',
      body: JSON.stringify(request),
    });
  },

  /**
   * Liste tous les utilisateurs locaux pour un compte cloud
   */
  async listLocalUsers(
    this: ServerApiClientAccess,
    cloudAccountId: string
  ): Promise<ApiResponse<LocalUser[]>> {
    return this.backendRequest<LocalUser[]>(`/api/client/admin/local-users/list`, {
      method: 'POST',
      body: JSON.stringify({ cloud_account_id: cloudAccountId }),
    });
  },

  /**
   * Récupère un utilisateur local par son ID
   */
  async getLocalUser(
    this: ServerApiClientAccess,
    userId: string
  ): Promise<ApiResponse<LocalUser>> {
    return this.backendRequest<LocalUser>(`/api/client/admin/local-users/${userId}`, {
      method: 'GET',
    });
  },

  /**
   * Met à jour un utilisateur local
   */
  async updateLocalUser(
    this: ServerApiClientAccess,
    userId: string,
    displayName?: string
  ): Promise<ApiResponse<LocalUser>> {
    return this.backendRequest<LocalUser>(`/api/client/admin/local-users/${userId}`, {
      method: 'PUT',
      body: JSON.stringify({ display_name: displayName }),
    });
  },

  /**
   * Supprime un utilisateur local
   */
  async deleteLocalUser(
    this: ServerApiClientAccess,
    userId: string
  ): Promise<ApiResponse<void>> {
    return this.backendRequest<void>(`/api/client/admin/local-users/${userId}`, {
      method: 'DELETE',
    });
  },
};
