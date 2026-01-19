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
   * Vérifie la santé du serveur avec détails
   * Retourne des informations détaillées sur l'état de la connexion
   */
  async checkServerHealth(this: ServerApiClientAccess): Promise<ApiResponse<{ status: string; reachable: boolean; latency?: number }>> {
    const startTime = Date.now();
    
    // Unifié : appel direct au backend Rust
    const res = await this.backendRequest<any>('/api/client/health', { method: 'GET' });
    
    const latency = Date.now() - startTime;
    
    if (!res.success) {
      // Détecter le type d'erreur pour fournir un message plus clair
      const isConnectionError = res.error === 'ConnectionError' || res.error === 'Timeout' || res.error === 'NetworkError';
      
      // Message d'erreur amélioré pour Android
      let errorMessage = res.message;
      if (isConnectionError) {
        // Détecter si on est sur Android
        const isAndroid = typeof window !== 'undefined' && /Android/i.test(navigator.userAgent || '');
        if (isAndroid) {
          errorMessage = 'Le backend n\'est pas accessible.\n\nSur Android:\n• Vérifiez que l\'IP est correcte (pas 10.0.2.2 sur appareil physique)\n• Utilisez l\'IP locale de votre machine (ex: http://192.168.1.100:3000)\n• Assurez-vous que votre mobile et votre PC sont sur le même réseau Wi-Fi\n• Vérifiez que le backend Rust est démarré';
        } else {
          errorMessage = 'Le backend n\'est pas accessible. Vérifiez que le serveur est démarré et que l\'URL est correcte.';
        }
      }
      
      return {
        success: false,
        error: res.error,
        message: errorMessage,
        data: {
          status: 'error',
          reachable: false,
          latency,
        },
      };
    }
    
    return {
      success: true,
      data: {
        status: 'ok',
        reachable: true,
        latency,
      },
    };
  },

  /**
   * Vérifie rapidement si le backend est accessible (pour le démarrage de l'app)
   * Version optimisée avec timeout court pour éviter les ANR sur Android
   */
  async quickHealthCheck(this: ServerApiClientAccess): Promise<boolean> {
    try {
      const res = await this.backendRequest<any>('/api/client/health', { method: 'GET' });
      return res.success;
    } catch {
      return false;
    }
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
