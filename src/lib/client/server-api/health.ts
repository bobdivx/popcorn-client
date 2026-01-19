/**
 * Méthodes Health Check et Setup
 */

import type { ApiResponse, SetupStatus } from './types.js';
import { PreferencesManager } from '../storage.js';

/**
 * Interface pour accéder aux méthodes privées de ServerApiClient
 */
interface ServerApiClientAccess {
  backendRequest<T>(endpoint: string, options?: RequestInit): Promise<ApiResponse<T>>;
}

export const healthMethods = {
  /**
   * Vérifie la santé du serveur
   */
  async checkServerHealth(this: ServerApiClientAccess): Promise<ApiResponse<{ status: string }>> {
    // Unifié : appel direct au backend Rust
    const res = await this.backendRequest<any>('/api/client/health', { method: 'GET' });
    if (!res.success) return res as ApiResponse<{ status: string }>;
    return { success: true, data: { status: 'ok' } };
  },

  /**
   * Récupère le statut du setup
   */
  async getSetupStatus(this: ServerApiClientAccess): Promise<ApiResponse<SetupStatus>> {
    // Unifié : on calcule le statut directement depuis le backend Rust + prefs locales
    // Appeler directement backendRequest pour éviter une référence circulaire
    const healthRes = await this.backendRequest<any>('/api/client/health', { method: 'GET' });
    const backendReachable = healthRes.success;
    if (!backendReachable) {
      return {
        success: true,
        data: {
          needsSetup: false,
          hasUsers: false,
          hasIndexers: false,
          hasBackendConfig: true,
          hasTmdbKey: false,
          hasTorrents: false,
          hasDownloadLocation: false,
          backendReachable: false,
        },
      };
    }

    const usersCount = await this.backendRequest<number>('/api/client/auth/users/count', { method: 'GET' });
    const hasUsers = usersCount.success ? (typeof usersCount.data === 'number' ? usersCount.data > 0 : false) : false;

    const indexersRes = await this.backendRequest<any[]>('/api/client/admin/indexers', { method: 'GET' });
    const hasIndexers = indexersRes.success
      ? (Array.isArray(indexersRes.data) ? indexersRes.data.some((i: any) => i?.is_enabled === 1 || i?.is_enabled === true) : false)
      : false;

    const downloadLocation = PreferencesManager.getDownloadLocation();
    const hasDownloadLocation = !!(downloadLocation && downloadLocation.trim());

    // Important: le token TMDB est lié à un user_id (header X-User-ID).
    // Sur mobile, l'utilisateur peut être cloud/local, et on ne veut pas forcer le wizard juste parce qu'on ne peut pas le vérifier ici.
    const hasTmdbKey = true;

    // Critère simple et robuste:
    // - si aucun user sur le backend => setup requis (première installation)
    // - sinon, ne pas bloquer le démarrage (le reste se configure dans les settings si besoin)
    const needsSetup = !hasUsers;

    return {
      success: true,
      data: {
        needsSetup,
        hasUsers,
        hasIndexers,
        hasBackendConfig: true,
        hasTmdbKey,
        hasTorrents: false,
        hasDownloadLocation,
        backendReachable: true,
      },
    };
  },
};
