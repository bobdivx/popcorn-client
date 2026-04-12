/**
 * Méthodes pour l'authentification à deux facteurs (2FA)
 */

import type { ApiResponse } from './types.js';
import { getPopcornWebApiUrl } from '../../api/popcorn-web.js';
import { TokenManager } from '../storage.js';
import { isTauri } from '../../utils/tauri.js';

// Fonction helper pour faire des requêtes à popcorn-web avec authentification
async function requestPopcornWeb<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<ApiResponse<T>> {
  const apiUrl = getPopcornWebApiUrl();
  const fullUrl = `${apiUrl}${endpoint}`;
  
  const cloudToken = TokenManager.getCloudAccessToken();
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...(options.headers as any),
  };
  
  if (cloudToken) {
    headers['Authorization'] = `Bearer ${cloudToken}`;
  }
  
  try {
    // Utiliser fetch standard
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    
    let response: Response;
    try {
      response = await fetch(fullUrl, {
        ...options,
        headers,
        signal: controller.signal,
      });
    } catch (error) {
      clearTimeout(timeoutId);
      // Si fetch échoue et qu'on est en Tauri, essayer native-fetch
      if (isTauri() && (error instanceof TypeError || (error instanceof Error && error.message.includes('Failed to fetch')))) {
        try {
          const { invoke } = await import('@tauri-apps/api/core');
          const method = (options.method || 'GET') as string;
          const headerPairs: Array<[string, string]> = [];
          const headersObj = new Headers(headers);
          headersObj.forEach((value, key) => headerPairs.push([key, value]));
          
          const body = typeof options.body === 'string' ? options.body : undefined;
          
          try {
            const nativeRes = (await invoke('native-fetch', {
              url: fullUrl,
              method,
              headers: headerPairs,
              body,
              timeoutMs: 10000,
            } as any)) as { body?: string; status?: number; headers?: Array<[string, string]> };
            
            const response = new Response(nativeRes?.body ?? '', {
              status: nativeRes?.status ?? 0,
              headers: (() => {
                const h = new Headers();
                for (const [k, v] of (nativeRes?.headers || []) as Array<[string, string]>) {
                  if (k) h.set(k, v);
                }
                return h;
              })(),
            });
            
            const rawText = await response.text().catch(() => '');
            const data = rawText ? JSON.parse(rawText) : {};
            
            if (response.ok) {
              return {
                success: true,
                data: data.data || data,
              };
            }
            
            return {
              success: false,
              error: data.error || 'UnknownError',
              message: data.message || `Erreur ${response.status}`,
            };
          } catch (invokeError) {
            const errorMsg = invokeError instanceof Error ? invokeError.message : String(invokeError);
            if (errorMsg.includes('not found') || errorMsg.includes('Command native-fetch')) {
              const { fetch: httpFetch } = await import('@tauri-apps/plugin-http');
              const httpResponse = await httpFetch(fullUrl, {
                method: method as any,
                headers: Object.fromEntries(headerPairs),
                body: body,
              } as any);
              
              const responseBody = await httpResponse.text();
              const data = responseBody ? JSON.parse(responseBody) : {};
              
              if (httpResponse.ok) {
                return {
                  success: true,
                  data: data.data || data,
                };
              }
              
              return {
                success: false,
                error: data.error || 'UnknownError',
                message: data.message || `Erreur ${httpResponse.status}`,
              };
            }
            throw invokeError;
          }
        } catch (tauriError) {
          return {
            success: false,
            error: 'NetworkError',
            message: tauriError instanceof Error ? tauriError.message : 'Erreur réseau',
          };
        }
      }
      throw error;
    }
    
    clearTimeout(timeoutId);
    const rawText = await response.text().catch(() => '');
    const data = rawText ? JSON.parse(rawText) : {};
    
    if (response.ok) {
      return {
        success: true,
        data: data.data || data,
      };
    }
    
    return {
      success: false,
      error: data.error || 'UnknownError',
      message: data.message || `Erreur ${response.status}`,
    };
  } catch (error) {
    return {
      success: false,
      error: 'NetworkError',
      message: error instanceof Error ? error.message : 'Erreur réseau',
    };
  }
}

export const twoFactorMethods = {
  /**
   * Récupère l'état de la 2FA pour l'utilisateur connecté
   */
  async getTwoFactorStatus(this: ServerApiClientTwoFactorAccess): Promise<ApiResponse<{ enabled: boolean }>> {
    return requestPopcornWeb<{ enabled: boolean }>('/auth/two-factor/status', {
      method: 'GET',
    });
  },

  /**
   * Active l'authentification à deux facteurs
   */
  async enableTwoFactor(this: ServerApiClientTwoFactorAccess): Promise<ApiResponse<{ message: string }>> {
    return requestPopcornWeb<{ message: string }>('/auth/two-factor/enable', {
      method: 'POST',
    });
  },

  /**
   * Désactive l'authentification à deux facteurs
   */
  async disableTwoFactor(this: ServerApiClientTwoFactorAccess): Promise<ApiResponse<{ message: string }>> {
    return requestPopcornWeb<{ message: string }>('/auth/two-factor/disable', {
      method: 'POST',
    });
  },

  /**
   * Envoie un code de vérification 2FA par email
   */
  async sendTwoFactorCode(this: ServerApiClientTwoFactorAccess): Promise<ApiResponse<{ message: string; expiresAt?: number }>> {
    return requestPopcornWeb<{ message: string; expiresAt?: number }>('/auth/two-factor/send-code', {
      method: 'POST',
    });
  },

  /**
   * Vérifie un code 2FA et génère les tokens complets
   * @param tempToken Token temporaire reçu lors du login avec 2FA
   * @param code Code à 6 chiffres reçu par email
   */
  async verifyTwoFactorCode(
    this: ServerApiClientTwoFactorAccess,
    tempToken: string,
    code: string
  ): Promise<ApiResponse<{
    user: { id: string; email: string };
    accessToken: string;
    refreshToken: string;
    jwtSecret?: string;
  }>> {
    const result = await requestPopcornWeb<{
      user: { id: string; email: string };
      accessToken: string;
      refreshToken: string;
      jwtSecret?: string;
    }>('/auth/two-factor/verify', {
      method: 'POST',
      body: JSON.stringify({ tempToken, code }),
    });
    
    if (result.success && result.data) {
      // Stocker les tokens
      TokenManager.setCloudTokens(result.data.accessToken, result.data.refreshToken);
      if (result.data.jwtSecret) {
        TokenManager.setJWTSecret(result.data.jwtSecret);
      }
      this.saveTokens(result.data.accessToken, result.data.refreshToken);
      this.saveUser(result.data.user);
    }
    
    return result;
  },
};

/**
 * Interface pour accéder aux méthodes nécessaires pour la 2FA
 */
interface ServerApiClientTwoFactorAccess {
  saveTokens(accessToken: string, refreshToken: string): void;
  saveUser(user: any): void;
}
