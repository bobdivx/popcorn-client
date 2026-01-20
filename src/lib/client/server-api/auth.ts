/**
 * Méthodes d'authentification
 */

import type { ApiResponse } from './types.js';
import type { AuthResponse } from './types.js';
import { TokenManager } from '../storage.js';
import { loginCloud as popcornWebLogin, registerCloud as popcornWebRegister } from '../../api/popcorn-web.js';

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

export const authMethods = {
  /**
   * Inscription utilisateur
   * Unifié : génération de tokens JWT côté client pour tous les modes
   */
  async register(
    this: ServerApiClientAuthAccess,
    email: string,
    password: string,
    inviteCode: string
  ): Promise<ApiResponse<{ user: { id: string; email: string } }>> {
    // Le backend Rust attend aussi un username.
    const username = (email.split('@')[0] || email || 'user').trim();
    const res = await this.backendRequest<any>('/api/client/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        email,
        username,
        password,
        invite_code: inviteCode,
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
   * Détecte automatiquement si un secret JWT existe :
   * - Si OUI : connexion au backend local
   * - Si NON : connexion au cloud pour récupérer le secret, puis génération de tokens locaux
   */
  async login(this: ServerApiClientAuthAccess, email: string, password: string): Promise<ApiResponse<AuthResponse>> {
    // Log pour debug : voir ce qui est envoyé
    if (typeof window !== 'undefined') {
      console.log('[server-api] Tentative de login:', { email, passwordLength: password?.length || 0 });
    }
    
    // Vérifier si un secret JWT existe déjà dans localStorage
    const hasJWTSecret = typeof window !== 'undefined' && TokenManager.getJWTSecret() !== null;
    
    if (!hasJWTSecret) {
      // Pas de secret JWT : se connecter au cloud pour le récupérer
      console.log('[server-api] Aucun secret JWT trouvé, connexion au cloud pour le récupérer...');
      const cloudResponse = await this.loginCloud(email, password);
      
      if (!cloudResponse.success) {
        // Si la connexion cloud échoue, retourner l'erreur
        return cloudResponse;
      }
      
      // La connexion cloud a réussi et le secret JWT est stocké
      // On génère des tokens locaux avec les informations de l'utilisateur cloud
      // Pas besoin de se connecter au backend local car l'utilisateur n'y existe peut-être pas
      console.log('[server-api] Connexion cloud réussie, génération de tokens locaux...');
      
      const user = cloudResponse.data?.user;
      if (user) {
        const userId = user.id || '';
        const userEmail = user.email || email;
        const username = userEmail.split('@')[0] || email || 'user';
        
        // Générer des tokens locaux JWT pour l'app
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
      }
      
      // Si pas d'utilisateur dans la réponse cloud, retourner la réponse cloud telle quelle
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
        // Connexion cloud réussie, générer des tokens locaux
        const user = cloudResponse.data?.user;
        if (user) {
          const userId = user.id || '';
          const userEmail = user.email || email;
          const username = userEmail.split('@')[0] || email || 'user';
          
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

      // Stocker les tokens cloud
      TokenManager.setCloudTokens(result.accessToken, result.refreshToken);
      
      // Stocker le secret JWT si fourni (important pour les connexions suivantes)
      if (result.jwtSecret) {
        TokenManager.setJWTSecret(result.jwtSecret);
        console.log('[server-api] Secret JWT stocké depuis la connexion cloud');
      }

      // Stocker user localement pour pouvoir faire les appels backend qui demandent X-User-ID (TMDB/sync)
      this.saveUser(result.user);

      // Générer des tokens locaux JWT pour l'app (les tokens cloud restent dans TokenManager)
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
      // Log détaillé pour le diagnostic
      const errorMessage = e instanceof Error ? e.message : String(e);
      const errorName = e instanceof Error ? e.name : 'UnknownError';
      
      console.error('[AUTH] Erreur lors de la connexion cloud:', {
        error: e,
        message: errorMessage,
        name: errorName,
        stack: e instanceof Error ? e.stack : undefined,
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

  /**
   * Inscription avec compte cloud (popcorn-web)
   */
  async registerCloud(
    this: ServerApiClientAuthAccess,
    email: string,
    password: string,
    inviteCode: string
  ): Promise<ApiResponse<AuthResponse>> {
    // Unifié : appel direct à popcorn-web pour tous les modes
    try {
      const result = await popcornWebRegister(email, password, inviteCode);
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
