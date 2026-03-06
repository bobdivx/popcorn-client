import type { ClientApi } from './index.js';
import { handleResponse, handleError } from './utils.js';

/**
 * Service pour les vérifications de santé du serveur
 */
export class HealthService {
  constructor(private clientApi: ClientApi) {}

  /**
   * Obtenir l'URL de requête
   */
  private async getRequestUrl(path: string): Promise<string> {
    return this.clientApi['getRequestUrl'](path);
  }

  /**
   * Vérifier la santé du serveur
   */
  async healthCheck(): Promise<boolean> {
    try {
      const url = await this.getRequestUrl('health');
      const response = await fetch(url);
      const data = await handleResponse<string>(response);
      return data.success && data.data === 'OK';
    } catch (error) {
      console.error('Health check failed:', handleError(error));
      return false;
    }
  }
}
