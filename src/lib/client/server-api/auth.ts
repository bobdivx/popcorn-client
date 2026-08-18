/**
 * Méthodes d'authentification
 */

import type { ApiResponse } from './types.js';
import type { AuthResponse } from './types.js';
import { TokenManager } from '../storage.js';
import { loginCloud as popcornWebLogin, registerCloud as popcornWebRegister, completeOidcTicket } from '../../api/popcorn-web.js';

/**
 * Interface pour accéder aux méthodes privées de ServerApiClient nécessaires pour l'authentification
 */
interface ServerApiClientAuthAccess {
  backendRequest<T>(endpoint: string, options?: RequestInit): Promise<ApiResponse<T>>;
  generateClientTokens(userId: string, username: string): Promise<{ accessToken: string; refreshToken: string }>;
  saveTokens(accessToken: string, refreshToken: string): void;
  saveUser(user: any): void;
  getUser(): any | null;
  clearTokens(): void;
}

async function persistCloudLogin(
  ctx: ServerApiClientAuthAccess,
  result: {
    user: { id: string; email: string; is_admin?: boolean; username?: string };
    accessToken: string;
    refreshToken: string;
    jwtSecret?: string;
  }
): Promise<ApiResponse<AuthResponse>> {
  TokenManager.setCloudTokens(result.accessToken, result.refreshToken);
  if (result.jwtSecret) {
    TokenManager.setJWTSecret(result.jwtSecret);
  }
  ctx.saveUser(result.user);

  if (result.user?.id && result.user?.email) {
    try {
      const username = result.user.username || result.user.email.split('@')[0];
      await ctx.backendRequest('/api/client/auth/users/sync-cloud', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-User-ID': result.user.id,
        },
        body: JSON.stringify({
          id: result.user.id,
          email: result.user.email,
          username,
          is_admin: result.user.is_admin,
        }),
      });
    } catch (syncError) {
      console.error('[server-api] Erreur sync cloud après SSO:', syncError);
    }
  }

  ctx.saveTokens(result.accessToken, result.refreshToken);
  return {
    success: true,
    data: {
      user: result.user,
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      cloudAccessToken: result.accessToken,
      cloudRefreshToken: result.refreshToken,
    },
  };
}

export const authMethods = {
  /**
   * Inscription utilisateur
   * Unifié : génération de tokens JWT côté client pour tous les modes
   */
  async register(
    this: ServerApiClientAuthAccess,
    email: string,
    password: string
  ): Promise<ApiResponse<{ user: { id: string; email: string } }>> {
    // Le backend Rust attend aussi un username.
    const username = (email.split('@')[0] || email || 'user').trim();
    const res = await this.backendRequest<any>('/api/client/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        email,
        username,
        password,
      }),
    });
    if (!res.success) return res as ApiResponse<{ user: { id: string; email: string } }>;

    // Le backend renvoie l'user; on génère des tokens JWT côté client
    const user = res.data?.user || res.data;
    const userId = user?.id || '';
    const userEmail = user?.email || email;
    const usernameForToken = user?.username || username;

    // Générer les tokens JWT côté client (comme en Tauri mais avec de vrais tokens)
    const { accessToken, refreshToken } = await this.generateClientTokens(userId, usernameForToken);
    this.saveTokens(accessToken, refreshToken);
    this.saveUser(user);

    return { success: true, data: { user: { id: userId, email: userEmail } } };
  },

  /**
   * Connexion utilisateur
   * - Si pas de secret JWT : tente d'abord le backend (compte local), puis le cloud
   * - Si secret JWT présent : tente le backend puis le cloud en secours
   */
  async login(this: ServerApiClientAuthAccess, email: string, password: string): Promise<ApiResponse<AuthResponse>> {
    // Log pour debug : voir ce qui est envoyé
    if (typeof window !== 'undefined') {
      console.log('[server-api] Tentative de login:', { email, passwordLength: password?.length || 0 });
    }

    const hasJWTSecret = typeof window !== 'undefined' && TokenManager.getJWTSecret() !== null;

    // Sans secret JWT : tenter d'abord le backend (compte local invité), puis le cloud
    if (!hasJWTSecret) {
      console.log('[server-api] Aucun secret JWT, tentative de connexion au backend (compte local possible)...');
      const backendRes = await this.backendRequest<{ user: { id: string; email?: string; username?: string }; jwt_secret?: string }>(
        '/api/client/auth/login',
        { method: 'POST', body: JSON.stringify({ email, password }) }
      );

      if (backendRes.success && backendRes.data?.user) {
        const user = backendRes.data.user;
        const userId = user.id || '';
        const username = user.username || user.email || email.split('@')[0] || 'user';
        // Secret fourni par le backend ou généré côté client pour les comptes locaux
        let secret = backendRes.data.jwt_secret;
        if (!secret && typeof crypto !== 'undefined' && crypto.getRandomValues) {
          const arr = new Uint8Array(32);
          crypto.getRandomValues(arr);
          secret = Array.from(arr, (b) => b.toString(16).padStart(2, '0')).join('');
        }
        if (secret) {
          TokenManager.setJWTSecret(secret);
        }
        const { accessToken, refreshToken } = await this.generateClientTokens(userId, username);
        this.saveTokens(accessToken, refreshToken);
        this.saveUser({ id: userId, email: user.email || email, username });
        console.log('[server-api] Connexion backend (compte local) réussie');
        return {
          success: true,
          data: {
            user: { id: userId, email: user.email || email },
            accessToken,
            refreshToken,
          },
        };
      }

      // Backend a échoué ou pas d'utilisateur : essayer le cloud
      console.log('[server-api] Backend échoué ou pas de compte local, connexion au cloud...');
      const cloudResponse = await this.loginCloud(email, password);

      if (!cloudResponse.success) {
        return cloudResponse;
      }

      const user = cloudResponse.data?.user;
      if (user) {
        const cloudAccessToken = cloudResponse.data?.cloudAccessToken || TokenManager.getCloudAccessToken();
        const cloudRefreshToken = cloudResponse.data?.cloudRefreshToken || TokenManager.getCloudRefreshToken();
        if (cloudAccessToken && cloudRefreshToken) {
          this.saveTokens(cloudAccessToken, cloudRefreshToken);
        }
        this.saveUser(user);
        return {
          success: true,
          data: {
            user: { id: user.id || '', email: user.email || email },
            accessToken: cloudAccessToken || '',
            refreshToken: cloudRefreshToken || '',
          },
        };
      }
      return cloudResponse;
    }
    
    // Secret JWT présent : essayer de se connecter au backend local
    console.log('[server-api] Secret JWT présent, tentative de connexion au backend local...');
    const res = await this.backendRequest<any>('/api/client/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    
    // Log pour debug : voir la réponse
    if (typeof window !== 'undefined') {
      console.log('[server-api] Réponse login:', { success: res.success, error: res.error, message: res.message });
    }
    
    if (!res.success) {
      // Si la connexion locale échoue, essayer quand même avec le cloud
      // (peut-être que l'utilisateur n'existe que dans le cloud)
      console.log('[server-api] Connexion locale échouée, tentative avec le cloud...');
      const cloudResponse = await this.loginCloud(email, password);
      
      if (cloudResponse.success) {
        // Connexion cloud réussie, utiliser les tokens cloud directement
        const user = cloudResponse.data?.user;
        if (user) {
          // Les tokens cloud sont déjà stockés par loginCloud
          // Utiliser ces tokens directement (même tokens, même secret JWT)
          const cloudAccessToken = cloudResponse.data?.cloudAccessToken || TokenManager.getCloudAccessToken();
          const cloudRefreshToken = cloudResponse.data?.cloudRefreshToken || TokenManager.getCloudRefreshToken();
          
          if (cloudAccessToken && cloudRefreshToken) {
            this.saveTokens(cloudAccessToken, cloudRefreshToken);
          }
          
          this.saveUser(user);
          
          return {
            success: true,
            data: {
              user: { id: user.id || '', email: user.email || email },
              accessToken: cloudAccessToken || '',
              refreshToken: cloudRefreshToken || '',
            },
          };
        }
      }
      
      // Si le cloud échoue aussi, retourner l'erreur locale
      return res as ApiResponse<AuthResponse>;
    }

    const user = res.data?.user || res.data;
    const userId = user?.id || '';
    const userEmail = user?.email || email;
    const username = user?.username || (email.split('@')[0] || email || 'user').trim();

    // Générer les tokens JWT côté client (comme en Tauri mais avec de vrais tokens)
    const { accessToken, refreshToken } = await this.generateClientTokens(userId, username);
    this.saveTokens(accessToken, refreshToken);
    this.saveUser(user);

    return {
      success: true,
      data: {
        user: { id: userId, email: userEmail },
        accessToken,
        refreshToken,
      },
    };
  },

  /**
   * Connexion avec compte cloud (popcorn-web)
   * Unifié : appel direct à popcorn-web pour tous les modes
   */
  async loginCloud(this: ServerApiClientAuthAccess, email: string, password: string): Promise<ApiResponse<AuthResponse>> {
    try {
      const result = await popcornWebLogin(email, password);
      if (!result) {
        return {
          success: false,
          error: 'CloudUnavailable',
          message: 'API cloud indisponible',
        };
      }

      // Si la 2FA est requise, retourner cette information
      if (result.requires2FA && result.tempToken) {
        return {
          success: true,
          data: {
            requires2FA: true,
            tempToken: result.tempToken,
            message: 'Un code de vérification a été envoyé par email. Veuillez entrer ce code pour compléter la connexion.',
          } as any,
        };
      }

      return persistCloudLogin(this, result);
    } catch (e) {
      // Log détaillé pour le diagnostic
      const errorMessage = e instanceof Error ? e.message : String(e);
      const errorName = e instanceof Error ? e.name : 'UnknownError';
      
      console.error('[AUTH] Erreur lors de la connexion cloud:', {
        error: e,
        message: errorMessage,
        name: errorName,
        stack: e instanceof Error ? e.stack : undefined,
        errorString: JSON.stringify(e, Object.getOwnPropertyNames(e), 2),
      });
      
      // Messages d'erreur plus clairs
      let userMessage = 'Erreur de connexion cloud';
      if (errorMessage.includes('401') || errorMessage.includes('Unauthorized')) {
        userMessage = 'Email ou mot de passe incorrect';
      } else if (errorMessage.includes('timeout') || errorMessage.includes('Timeout')) {
        userMessage = 'Le service cloud ne répond pas. Vérifiez votre connexion internet.';
      } else if (errorMessage.includes('network') || errorMessage.includes('fetch') || errorMessage.includes('Failed to fetch')) {
        userMessage = 'Impossible de contacter le service cloud. Vérifiez votre connexion internet.';
      } else if (errorMessage) {
        userMessage = errorMessage;
      }
      
      return {
        success: false,
        error: 'CloudLoginError',
        message: userMessage,
      };
    }
  },

  async completeCloudSso(this: ServerApiClientAuthAccess, ticket: string): Promise<ApiResponse<AuthResponse>> {
    try {
      const result = await completeOidcTicket(ticket);
      if (!result) {
        return {
          success: false,
          error: 'CloudUnavailable',
          message: 'API cloud indisponible',
        };
      }
      return persistCloudLogin(this, result);
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : String(e);
      return {
        success: false,
        error: 'SsoError',
        message: errorMessage || 'Connexion Pocket ID échouée',
      };
    }
  },

  /**
   * Inscription avec compte cloud (popcorn-web)
   */
  async registerCloud(
    this: ServerApiClientAuthAccess,
    email: string,
    password: string
  ): Promise<ApiResponse<AuthResponse>> {
    // Unifié : appel direct à popcorn-web pour tous les modes
    try {
      const result = await popcornWebRegister(email, password);
      if (!result) {
        return {
          success: false,
          error: 'CloudUnavailable',
          message: 'API cloud indisponible',
        };
      }

      TokenManager.setCloudTokens(result.accessToken, result.refreshToken);
      
      // Stocker le secret JWT si fourni
      if (result.jwtSecret) {
        TokenManager.setJWTSecret(result.jwtSecret);
      }
      
      this.saveUser(result.user);

      // Générer des tokens locaux JWT pour l'app
      const userId = result.user?.id || '';
      const username = result.user?.email || email;
      const { accessToken, refreshToken } = await this.generateClientTokens(userId, username);
      this.saveTokens(accessToken, refreshToken);

      return {
        success: true,
        data: {
          user: result.user,
          accessToken,
          refreshToken,
          cloudAccessToken: result.accessToken,
          cloudRefreshToken: result.refreshToken,
        },
      };
    } catch (e) {
      return {
        success: false,
        error: 'CloudRegisterError',
        message: e instanceof Error ? e.message : "Erreur d'inscription cloud",
      };
    }
  },

  /**
   * Déconnexion de l'utilisateur
   * Unifié : simple nettoyage local pour tous les modes
   */
  logout(this: ServerApiClientAuthAccess): void {
    this.clearTokens();
    this.saveUser(null);
  },

  /**
   * Récupère les informations de l'utilisateur connecté
   * Unifié : lecture depuis localStorage pour tous les modes
   */
  async getMe(this: ServerApiClientAuthAccess): Promise<ApiResponse<{ id: string; email: string }>> {
    const user = this.getUser();
    if (user?.id) {
      return { success: true, data: { id: user.id, email: user.email || '' } };
    }
    return { success: false, error: 'Unauthorized', message: 'Non authentifié' };
  },
};
