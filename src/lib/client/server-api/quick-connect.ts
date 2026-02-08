/**
 * Méthodes pour la connexion rapide via QR code
 */

import type { ApiResponse } from './types.js';
import { getPopcornWebApiUrl } from '../../api/popcorn-web.js';
import { TokenManager } from '../storage.js';
import { isTauri } from '../../utils/tauri.js';

/**
 * Interface pour accéder aux méthodes nécessaires pour quick-connect
 */
interface ServerApiClientQuickConnectAccess {
  saveTokens(accessToken: string, refreshToken: string): void;
  saveUser(user: any): void;
}

// Fonction helper pour faire des requêtes à popcorn-web
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
      if (isTauri() && (error instanceof TypeError || (error instanceof Error && error.message.includes('Failed to fetch')))) {
        try {
          const { invoke } = await import('@tauri-apps/api/core');
          const method = (options.method || 'GET') as string;
          const headerPairs: Array<[string, string]> = [];
          const headersObj = new Headers(headers);
          headersObj.forEach((value, key) => headerPairs.push([key, value]));
          
          const body = typeof options.body === 'string' ? options.body : undefined;
          
          try {
            const nativeRes = await invoke('native-fetch', {
              url: fullUrl,
              method,
              headers: headerPairs,
              body,
              timeoutMs: 10000,
            } as any);
            
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

export const quickConnectMethods = {
  /**
   * Initialise une requête de connexion rapide
   * Retourne un code à 6 caractères et un secret unique
   */
  async initQuickConnect(this: ServerApiClientQuickConnectAccess): Promise<ApiResponse<{
    code: string;
    secret: string;
    expiresAt: number;
  }>> {
    return requestPopcornWeb<{
      code: string;
      secret: string;
      expiresAt: number;
    }>('/auth/quick-connect/init', {
      method: 'POST',
    });
  },

  /**
   * Autorise une requête de connexion rapide (depuis un device déjà connecté)
   * @param code Code à 6 caractères à autoriser
   */
  async authorizeQuickConnect(
    this: ServerApiClientQuickConnectAccess,
    code: string
  ): Promise<ApiResponse<{ message: string; secret?: string }>> {
    return requestPopcornWeb<{ message: string; secret?: string }>('/auth/quick-connect/authorize', {
      method: 'POST',
      body: JSON.stringify({ code }),
    });
  },

  /**
   * Récupère l'état d'une requête de connexion rapide
   * @param secret Secret de la requête
   */
  async getQuickConnectStatus(
    this: ServerApiClientQuickConnectAccess,
    secret: string
  ): Promise<ApiResponse<{
    status: 'pending' | 'authorized' | 'used' | 'expired';
    authorized: boolean;
    userId?: string;
  }>> {
    return requestPopcornWeb<{
      status: 'pending' | 'authorized' | 'used' | 'expired';
      authorized: boolean;
      userId?: string;
    }>('/auth/quick-connect/status', {
      method: 'POST',
      body: JSON.stringify({ secret }),
    });
  },

  /**
   * Connecte un device en utilisant une requête de connexion rapide autorisée
   * @param secret Secret de la requête
   */
  async connectQuickConnect(
    this: ServerApiClientQuickConnectAccess,
    secret: string
  ): Promise<ApiResponse<{
    user: { id: string; email: string };
    accessToken: string;
    refreshToken: string;
    jwtSecret?: string;
    backendUrl?: string;
  }>> {
    const result = await requestPopcornWeb<{
      user: { id: string; email: string };
      accessToken: string;
      refreshToken: string;
      jwtSecret?: string;
      backendUrl?: string;
    }>('/auth/quick-connect/connect', {
      method: 'POST',
      body: JSON.stringify({ secret }),
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
