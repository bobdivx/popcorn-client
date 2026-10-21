/**
 * Méthodes pour la connexion rapide via QR code
 */

import type { ApiResponse } from './types.js';
import { getPopcornWebApiUrl } from '../../api/popcorn-web.js';
import { TokenManager } from '../storage.js';
import { setBackendUrl } from '../../backend-config.js';

/**
 * Interface pour accéder aux méthodes nécessaires pour quick-connect
 */
interface ServerApiClientQuickConnectAccess {
  saveTokens(accessToken: string, refreshToken: string): void;
  saveUser(user: any): void;
  backendRequest<T>(endpoint: string, options?: RequestInit): Promise<ApiResponse<T>>;
  generateClientTokens(userId: string, username: string): Promise<{ accessToken: string; refreshToken: string }>;
}

/**
 * Invité (utilisateur local) connecté par Quick Connect : échange son jeton popcorn-web contre
 * une session serveur `pls1.` (le serveur crée l'invité s'il ne le connaît pas encore).
 * Retourne true si la session serveur a été établie.
 */
async function establishGuestServerSession(
  ctx: ServerApiClientQuickConnectAccess,
  guestAccessToken: string,
  user: { id: string; email: string }
): Promise<boolean> {
  const res = await ctx.backendRequest<{
    user: { id: string; email?: string; username?: string; role?: string };
    access_token?: string;
  }>('/api/client/auth/local-session', {
    method: 'POST',
    headers: { Authorization: `Bearer ${guestAccessToken}` },
  });
  const token = res.success ? res.data?.access_token : undefined;
  if (typeof token !== 'string' || !token.startsWith('pls1.')) {
    return false;
  }
  if (typeof window === 'undefined') return false;
  // Même état que la connexion par mot de passe d'un invité (server-api/auth.ts) :
  // pas de jeton cloud, session serveur, jetons client locaux.
  TokenManager.clearCloudTokens();
  TokenManager.setServerSessionToken(token);
  if (!TokenManager.getJWTSecret() && typeof crypto !== 'undefined' && crypto.getRandomValues) {
    const arr = new Uint8Array(32);
    crypto.getRandomValues(arr);
    TokenManager.setJWTSecret(Array.from(arr, (b) => b.toString(16).padStart(2, '0')).join(''));
  }
  const userId = res.data?.user?.id || user.id;
  const email = res.data?.user?.email || user.email;
  const username = res.data?.user?.username || email || 'user';
  const { accessToken, refreshToken } = await ctx.generateClientTokens(userId, username);
  ctx.saveTokens(accessToken, refreshToken);
  ctx.saveUser({ id: userId, email, username });
  return true;
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
    const response = await fetch(fullUrl, {
      ...options,
      headers,
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    const rawText = await response.text().catch(() => '');
    const data = rawText ? JSON.parse(rawText) : {};
    if (response.ok) {
      return { success: true, data: data.data ?? data };
    }
    return {
      success: false,
      error: data.error || 'UnknownError',
      message: data.message || `Erreur ${response.status}`,
      details: typeof data.details === 'string' ? data.details : undefined,
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
    code: string,
    /** Optionnel : connecter l'appareil en tant que l'un de vos invités actifs. */
    userId?: string
  ): Promise<ApiResponse<{ message: string; secret?: string }>> {
    return requestPopcornWeb<{ message: string; secret?: string }>('/auth/quick-connect/authorize', {
      method: 'POST',
      body: JSON.stringify(userId ? { code, userId } : { code }),
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
    jwtSecret?: string | null;
    isLocalUser?: boolean;
    backendUrl?: string;
    clientUrl?: string;
  }>> {
    const result = await requestPopcornWeb<{
      user: { id: string; email: string };
      accessToken: string;
      refreshToken: string;
      jwtSecret?: string | null;
      isLocalUser?: boolean;
      backendUrl?: string;
      clientUrl?: string;
    }>('/auth/quick-connect/connect', {
      method: 'POST',
      body: JSON.stringify({ secret }),
    });
    
    if (result.success && result.data) {
      const isGuest = result.data.isLocalUser === true;
      if (!isGuest) {
        // Stocker les tokens
        TokenManager.setCloudTokens(result.data.accessToken, result.data.refreshToken);
        if (result.data.jwtSecret) {
          TokenManager.setJWTSecret(result.data.jwtSecret);
        }
        this.saveTokens(result.data.accessToken, result.data.refreshToken);
        this.saveUser(result.data.user);
      }
      // URL du backend (serveur API) renvoyée par popcorn-web : toujours l'enregistrer côté client
      // pour que le device utilise le bon backend (ex. backup.briseteia.me) après Quick Connect
      if (result.data.backendUrl && typeof result.data.backendUrl === 'string' && result.data.backendUrl.trim()) {
        try {
          setBackendUrl(result.data.backendUrl.trim().replace(/\/$/, ''));
        } catch {
          // ignore (ex. SSR)
        }
      }
      // URL du client local (pour webOS / lanceur) : permet d'ouvrir le client local après QR
      if (result.data.clientUrl && typeof localStorage !== 'undefined') {
        try {
          localStorage.setItem('webos_local_client_url', result.data.clientUrl.trim().replace(/\/$/, ''));
        } catch {
          // ignore
        }
      }
      if (isGuest) {
        // Invité : le serveur du propriétaire n'accepte que sa propre session (pls1.).
        let ok = false;
        try {
          ok = await establishGuestServerSession(this, result.data.accessToken, result.data.user);
        } catch {
          ok = false;
        }
        if (!ok) {
          return {
            success: false,
            error: 'GuestSessionFailed',
            message:
              'Connexion au serveur impossible pour ce compte invité. Vérifiez que le serveur est joignable, ou connectez-vous avec email et mot de passe.',
          };
        }
      }
    }
    
    return result;
  },
};
