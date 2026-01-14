/**
 * Client API pour communication avec le serveur principal (popcorn)
 * Ce client gère l'authentification, les requêtes API et le refresh automatique des tokens
 */

import type {
  ApiResponse,
  SetupStatus,
  IndexerFormData,
  Indexer,
  IndexerTypeInfo,
  DashboardData,
  FilmData,
  SeriesData,
} from './types';
import { getClientUrl } from '../client-url.js';
import { getBackendUrl } from '../backend-config.js';

// Ré-exporter les types pour compatibilité
export type { ApiResponse } from './types';

export interface AuthResponse {
  user: {
    id: string;
    email: string;
  };
  accessToken: string;
  refreshToken: string;
  cloudAccessToken?: string;
  cloudRefreshToken?: string;
}

export interface SearchParams {
  q: string;
  type?: 'movie' | 'tv';
  year?: number;
  page?: number;
}

export interface SearchResult {
  id: string;
  title: string;
  type: 'movie' | 'tv';
  poster?: string;
  year?: number;
  overview?: string;
}

export interface StreamResponse {
  streamUrl: string;
  hlsUrl: string;
  subtitles?: Array<{
    lang: string;
    url: string;
  }>;
}

export interface LibraryItem {
  id: string;
  contentId: string;
  title: string;
  type: 'movie' | 'tv';
  poster?: string;
  addedAt: string;
  encryptedData?: string; // Données chiffrées E2E
}

class ServerApiClient {
  private baseUrl: string;
  private accessToken: string | null = null;
  private refreshToken: string | null = null;

  private getTimeoutMs(endpoint: string): number {
    // Valeurs conservatrices pour éviter les "spinners infinis"
    if (endpoint.includes('/torrents/magnet')) return 60000;
    if (endpoint.includes('/api/media/') || endpoint.includes('/api/torrents/')) return 30000;
    // Le setup peut impliquer des écritures DB + détection/validation indexer -> parfois lent
    if (endpoint.startsWith('/api/v1/setup/')) return 60000;
    if (endpoint.startsWith('/api/v1/sync/')) return 60000;
    return 15000;
  }

  constructor(baseUrl?: string) {
    // Initialiser baseUrl à vide
    this.baseUrl = '';
    
    // Si une URL explicite est fournie (pour override en développement), l'utiliser
    // Sinon, getServerUrl() sera appelé à chaque fois et retournera window.location.origin dans le navigateur
    if (baseUrl && baseUrl.trim() && baseUrl !== 'undefined') {
      this.baseUrl = baseUrl.trim();
    }
    // Note: On n'appelle pas getServerUrl() dans le constructeur car window.location.origin
    // pourrait ne pas être disponible encore. On l'appellera à chaque fois qu'on en a besoin.
    
    this.loadTokens();
  }

  /**
   * Récupère l'URL du serveur (client Astro)
   * Le client se connecte toujours à lui-même via window.location.origin
   * Les routes /api/v1/* du client Astro font ensuite le proxy vers le backend Rust
   * dont l'URL est stockée dans la base de données (table app_config)
   * 
   * Priorité:
   * 1. window.location.origin (dans le navigateur - TOUJOURS utilisé dans le navigateur)
   * 2. Variables d'environnement (PUBLIC_SERVER_URL, PUBLIC_CLIENT_URL) - pour override en SSR uniquement
   * 3. getClientUrl() (fallback - retourne window.location.origin ou port par défaut)
   */
  getServerUrl(): string {
    // 1. Si on est dans le navigateur, TOUJOURS utiliser window.location.origin
    // Le client doit toujours se connecter à lui-même, peu importe les variables d'environnement
    if (typeof window !== 'undefined' && window.location && window.location.origin) {
      const currentOrigin = window.location.origin;
      // Toujours réinitialiser pour garantir que le client se connecte à lui-même
      // Ignorer toute valeur stockée précédemment ou dans les variables d'environnement
      if (this.baseUrl !== currentOrigin) {
        if (typeof console !== 'undefined' && console.log) {
          console.log(`[server-api] Réinitialisation de baseUrl: "${this.baseUrl}" -> "${currentOrigin}"`);
        }
        this.baseUrl = currentOrigin;
      }
      return this.baseUrl;
    }
    
    // 2. Si pas dans le navigateur (SSR), utiliser les variables d'environnement
    if (!this.baseUrl || this.baseUrl === 'undefined' || this.baseUrl.trim() === '') {
      try {
        const envUrl = import.meta.env.PUBLIC_SERVER_URL || import.meta.env.PUBLIC_CLIENT_URL;
        if (envUrl && envUrl !== 'undefined' && envUrl.trim()) {
          this.baseUrl = envUrl.trim();
        } else {
          // 3. Utiliser getClientUrl() comme fallback
          this.baseUrl = getClientUrl();
        }
      } catch (e) {
        // En cas d'erreur, utiliser getClientUrl() comme fallback
        this.baseUrl = getClientUrl();
      }
    }
    
    return this.baseUrl;
  }

  /**
   * Charge les tokens depuis le stockage local
   */
  private loadTokens(): void {
    if (typeof window === 'undefined') return;
    
    this.accessToken = localStorage.getItem('access_token');
    this.refreshToken = localStorage.getItem('refresh_token');
  }

  /**
   * Sauvegarde les tokens dans le stockage local
   */
  private saveTokens(accessToken: string, refreshToken: string): void {
    if (typeof window === 'undefined') return;
    
    localStorage.setItem('access_token', accessToken);
    localStorage.setItem('refresh_token', refreshToken);
    this.accessToken = accessToken;
    this.refreshToken = refreshToken;
  }

  /**
   * Supprime les tokens du stockage local
   */
  private clearTokens(): void {
    if (typeof window === 'undefined') return;
    
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    this.accessToken = null;
    this.refreshToken = null;
  }

  /**
   * Effectue une requête HTTP avec gestion automatique de l'authentification
   */
  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<ApiResponse<T>> {
    // S'assurer que baseUrl est défini avant de faire la requête
    // Utiliser getServerUrl() qui FORCE l'utilisation de window.location.origin dans le navigateur
    const baseUrl = this.getServerUrl();
    
    // Vérification de sécurité supplémentaire
    if (!baseUrl || baseUrl === 'undefined' || baseUrl.trim() === '') {
      // En dernier recours, utiliser getClientUrl() qui retourne window.location.origin
      this.baseUrl = getClientUrl();
      return this.request(endpoint, options); // Réessayer avec la nouvelle URL
    }
    
    const url = `${baseUrl}${endpoint}`;
    
    // S'assurer que les tokens sont à jour avant de faire la requête
    if (typeof window !== 'undefined') {
      this.loadTokens();
    }

    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    // Transmettre l'URL du backend configurée côté client aux routes API Astro (SSR).
    // Sinon, côté serveur Astro on retombe sur BACKEND_URL / valeur par défaut, ce qui peut viser une autre DB/port.
    try {
      if (typeof window !== 'undefined') {
        const backendUrl = getBackendUrl();
        if (backendUrl && backendUrl !== 'undefined' && backendUrl.trim()) {
          (headers as any)['X-Popcorn-Backend-Url'] = backendUrl.trim();
        }
      }
    } catch {
      // Ignorer: on garde les fallbacks côté serveur.
    }

    // Endpoints qui NE doivent PAS envoyer de token local
    // et ne doivent pas déclencher de refresh automatique.
    // Ex: login/register (sinon boucle refresh + message trompeur).
    const isAuthBootstrapEndpoint =
      endpoint === '/api/v1/auth/login' ||
      endpoint === '/api/v1/auth/register' ||
      endpoint === '/api/v1/auth/login-cloud' ||
      endpoint === '/api/v1/auth/register-cloud';

    // Ajouter le token d'accès si disponible
    if (this.accessToken && !isAuthBootstrapEndpoint) {
      headers['Authorization'] = `Bearer ${this.accessToken}`;
    }

    try {
      const controller = new AbortController();
      const timeoutMs = this.getTimeoutMs(endpoint);
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      // Si un signal existe déjà, on essaie de le combiner (si supporté),
      // sinon on privilégie le signal existant et on ne force pas le timeout.
      let signalToUse: AbortSignal | undefined = controller.signal;
      if (options.signal) {
        // @ts-expect-error AbortSignal.any pas toujours typé selon TS/DOM libs
        const anyFn = (AbortSignal as any)?.any;
        if (typeof anyFn === 'function') {
          signalToUse = anyFn([options.signal, controller.signal]);
        } else {
          // fallback: on respecte le signal existant (pas de timeout côté client)
          signalToUse = options.signal;
          clearTimeout(timeoutId);
        }
      }

      const response = await fetch(url, {
        ...options,
        headers,
        signal: signalToUse,
      });
      clearTimeout(timeoutId);

      // Si token expiré, essayer de le rafraîchir (sauf endpoints d'auth bootstrap)
      if (!isAuthBootstrapEndpoint && response.status === 401 && this.refreshToken) {
        const refreshed = await this.refreshAccessToken();
        if (refreshed) {
          // Réessayer la requête avec le nouveau token
          headers['Authorization'] = `Bearer ${this.accessToken}`;
          const retryResponse = await fetch(url, {
            ...options,
            headers,
            signal: signalToUse,
          });
          return await this.handleResponse<T>(retryResponse);
        }
      }

      return await this.handleResponse<T>(response);
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        return {
          success: false,
          error: 'Timeout',
          message: 'Timeout: le serveur ne répond pas (backend probablement non accessible).',
        };
      }
      // Ne pas logger les erreurs réseau comme des erreurs critiques
      // (peut être une erreur 401 normale si l'utilisateur n'est pas connecté)
      if (error instanceof Error && !error.message.includes('401')) {
        console.error('Erreur API:', error);
      }
      return {
        success: false,
        error: 'NetworkError',
        message: error instanceof Error ? error.message : 'Erreur réseau',
      };
    }
  }

  /**
   * Gère la réponse HTTP
   */
  private async handleResponse<T>(response: Response): Promise<ApiResponse<T>> {
    const data = await response.json().catch(() => ({}));

    if (!response.ok) {
      // 401:
      // - Sur les endpoints protégés, c'est "normal" si l'utilisateur n'est pas connecté
      // - Sur les endpoints d'auth (login/register/refresh), on veut afficher le vrai message (ex: mauvais mot de passe)
      if (response.status === 401) {
        const err = (data && typeof data === 'object' ? (data as any).error : undefined) as string | undefined;
        const msg = (data && typeof data === 'object' ? (data as any).message : undefined) as string | undefined;
        return {
          success: false,
          error: err || 'Unauthorized',
          message: msg || err || 'Non authentifié',
        };
      }

      return {
        success: false,
        error: data.error || 'UnknownError',
        message: data.message || `Erreur ${response.status}`,
      };
    }

    // Log pour debug : voir la structure de la réponse AVANT transformation
    if (typeof window !== 'undefined' && response.url?.includes('/api/torrents/group/')) {
      console.log('[server-api] handleResponse AVANT transformation pour /api/torrents/group:', {
        url: response.url,
        originalData: data,
        hasData: !!data.data,
        hasSuccess: !!data.success,
        dataType: typeof data.data,
        dataKeys: data.data ? Object.keys(data.data) : [],
        originalDataKeys: Object.keys(data),
        fullOriginalData: JSON.stringify(data, null, 2),
      });
    }

    // Gérer la double imbrication : si data.data existe et contient success, utiliser data.data
    // Sinon, utiliser data directement
    let responseData = data.data || data;
    
    // Si responseData contient success et data, c'est une double imbrication
    if (responseData && typeof responseData === 'object' && 'success' in responseData && 'data' in responseData) {
      responseData = responseData.data || responseData;
    }
    
    // Log pour debug : voir la structure de la réponse APRÈS transformation
    if (typeof window !== 'undefined' && response.url?.includes('/api/torrents/group/')) {
      console.log('[server-api] handleResponse APRÈS transformation pour /api/torrents/group:', {
        responseData,
        hasVariants: !!(responseData as any)?.variants,
        hasTorrents: !!(responseData as any)?.torrents,
        variantsCount: (responseData as any)?.variants?.length,
        torrentsCount: (responseData as any)?.torrents?.length,
        responseDataKeys: responseData ? Object.keys(responseData) : [],
        fullResponseData: JSON.stringify(responseData, null, 2),
      });
    }

    return {
      success: true,
      data: responseData,
    };
  }

  /**
   * Rafraîchit le token d'accès
   */
  private async refreshAccessToken(): Promise<boolean> {
    if (!this.refreshToken) return false;

    try {
      // S'assurer d'utiliser la bonne URL (window.location.origin dans le navigateur)
      const serverUrl = this.getServerUrl();
      
      const response = await fetch(`${serverUrl}/api/v1/auth/refresh`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ refreshToken: this.refreshToken }),
      });

      if (!response.ok) {
        this.clearTokens();
        return false;
      }

      const result = await response.json();
      if (result.success && result.data) {
        this.saveTokens(result.data.accessToken, result.data.refreshToken || this.refreshToken);
        return true;
      }

      return false;
    } catch (error) {
      console.error('Erreur lors du rafraîchissement du token:', error);
      this.clearTokens();
      return false;
    }
  }

  // ==================== AUTHENTIFICATION ====================

  /**
   * Inscription utilisateur
   */
  async register(
    email: string,
    password: string,
    inviteCode: string
  ): Promise<ApiResponse<{ user: { id: string; email: string } }>> {
    return this.request<{ user: { id: string; email: string } }>('/api/v1/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, inviteCode }),
    });
  }

  /**
   * Connexion utilisateur
   */
  async login(email: string, password: string): Promise<ApiResponse<AuthResponse>> {
    const response = await this.request<AuthResponse>('/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });

    if (response.success && response.data) {
      this.saveTokens(response.data.accessToken, response.data.refreshToken);
    }

    return response;
  }

  /**
   * Connexion avec compte cloud (popcorn-web)
   */
  async loginCloud(email: string, password: string): Promise<ApiResponse<AuthResponse>> {
    const response = await this.request<AuthResponse>('/api/v1/auth/login-cloud', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });

    if (response.success && response.data) {
      this.saveTokens(response.data.accessToken, response.data.refreshToken);
      // Sauvegarder aussi les tokens cloud pour les appels à popcorn-web
      if (response.data.cloudAccessToken && response.data.cloudRefreshToken) {
        const { TokenManager } = await import('./storage.js');
        TokenManager.setCloudTokens(response.data.cloudAccessToken, response.data.cloudRefreshToken);
      }
    }

    return response;
  }

  /**
   * Inscription avec compte cloud (popcorn-web)
   */
  async registerCloud(email: string, password: string, inviteCode: string): Promise<ApiResponse<AuthResponse>> {
    const response = await this.request<AuthResponse>('/api/v1/auth/register-cloud', {
      method: 'POST',
      body: JSON.stringify({ email, password, inviteCode }),
    });

    if (response.success && response.data) {
      this.saveTokens(response.data.accessToken, response.data.refreshToken);
      // Sauvegarder aussi les tokens cloud pour les appels à popcorn-web
      if (response.data.cloudAccessToken && response.data.cloudRefreshToken) {
        const { TokenManager } = await import('./storage.js');
        TokenManager.setCloudTokens(response.data.cloudAccessToken, response.data.cloudRefreshToken);
      }
    }

    return response;
  }

  /**
   * Déconnexion utilisateur
   */
  async logout(): Promise<void> {
    if (this.accessToken) {
      try {
        await this.request('/api/v1/auth/logout', {
          method: 'POST',
        });
      } catch (error) {
        console.error('Erreur lors de la déconnexion:', error);
      }
    }
    this.clearTokens();
  }

  /**
   * Récupère les informations de l'utilisateur connecté
   */
  async getMe(): Promise<ApiResponse<{ id: string; email: string }>> {
    // Ne pas appeler l'API si on n'a pas de token
    if (!this.accessToken) {
      return {
        success: false,
        error: 'Unauthorized',
        message: 'Non authentifié',
      };
    }
    return this.request('/api/v1/auth/me');
  }

  // ==================== RECHERCHE ====================

  /**
   * Recherche de contenu
   */
  async search(params: SearchParams): Promise<ApiResponse<SearchResult[]>> {
    const queryParams = new URLSearchParams();
    queryParams.set('q', params.q);
    if (params.type) queryParams.set('type', params.type);
    if (params.year) queryParams.set('year', params.year.toString());
    if (params.page) queryParams.set('page', params.page.toString());

    return this.request<SearchResult[]>(`/api/v1/search?${queryParams.toString()}`);
  }

  // ==================== TORRENTS ====================

  /**
   * Récupère un torrent groupé par slug
   */
  async getTorrentGroup(slug: string): Promise<ApiResponse<any>> {
    return this.request(`/api/torrents/group/${encodeURIComponent(slug)}`);
  }

  /**
   * Récupère un torrent par ID
   */
  async getTorrentById(id: string): Promise<ApiResponse<any>> {
    return this.request(`/api/torrents/${encodeURIComponent(id)}`);
  }

  // ==================== STREAMING ====================

  /**
   * Récupère l'URL de stream pour un contenu
   * Le contentId peut être un slug (ex: "une-zone-a-defendre-2023") ou un infoHash
   * Note: Cette méthode est conservée pour compatibilité avec VideoPlayer.tsx
   * Le nouveau système utilise MediaDetailPage avec le backend Rust
   */
  async getStream(contentId: string): Promise<ApiResponse<StreamResponse>> {
    try {
      // D'abord, essayer de récupérer le torrent groupé par slug
      // Cela nous donnera l'infoHash du torrent
      const baseUrl = this.getServerUrl();
      
      // Essayer de récupérer le torrent groupé
      const groupResponse = await fetch(`${baseUrl}/api/torrents/group/${encodeURIComponent(contentId)}`, {
        headers: {
          'Authorization': `Bearer ${this.getAccessToken()}`,
        },
      });

      if (groupResponse.ok) {
        const groupData = await groupResponse.json();
        if (groupData.success && groupData.data) {
          // Extraire l'infoHash du premier variant disponible
          const variants = groupData.data.variants || [];
          if (variants.length > 0) {
            // Prendre le premier variant disponible
            const firstVariant = variants[0];
            const infoHash = firstVariant.infoHash || firstVariant.info_hash;
            
            if (infoHash) {
              // Construire l'URL HLS (pour compatibilité, mais le nouveau système utilise le backend Rust)
              const hlsUrl = `${baseUrl}/api/media/hls/${infoHash}/master.m3u8`;
              
              return {
                success: true,
                data: {
                  streamUrl: hlsUrl,
                  hlsUrl: hlsUrl,
                },
              };
            }
          }
        }
      }

      // Si le slug ne fonctionne pas, essayer directement avec l'infoHash
      // (au cas où contentId est déjà un infoHash)
      const hlsUrl = `${baseUrl}/api/media/hls/${contentId}/master.m3u8`;
      return {
        success: true,
        data: {
          streamUrl: hlsUrl,
          hlsUrl: hlsUrl,
        },
      };
    } catch (error) {
      return {
        success: false,
        message: error instanceof Error ? error.message : 'Erreur lors de la récupération du stream',
      };
    }
  }

  // ==================== BIBLIOTHÈQUE ====================

  /**
   * Récupère la bibliothèque de l'utilisateur
   */
  async getLibrary(): Promise<ApiResponse<LibraryItem[]>> {
    return this.request<LibraryItem[]>('/api/v1/library');
  }

  /**
   * Ajoute un élément à la bibliothèque
   */
  async addToLibrary(
    contentId: string,
    title: string,
    type: 'movie' | 'tv',
    encryptedData?: string
  ): Promise<ApiResponse<LibraryItem>> {
    return this.request<LibraryItem>('/api/v1/library', {
      method: 'POST',
      body: JSON.stringify({
        contentId,
        title,
        type,
        encryptedData,
      }),
    });
  }

  /**
   * Supprime un élément de la bibliothèque
   */
  async removeFromLibrary(libraryId: string): Promise<ApiResponse<void>> {
    return this.request<void>(`/api/v1/library/${libraryId}`, {
      method: 'DELETE',
    });
  }

  // ==================== FAVORIS ====================

  /**
   * Récupère les favoris de l'utilisateur
   */
  async getFavorites(): Promise<ApiResponse<LibraryItem[]>> {
    return this.request<LibraryItem[]>('/api/v1/favorites');
  }

  /**
   * Ajoute un favori
   */
  async addFavorite(
    contentId: string,
    encryptedData?: string
  ): Promise<ApiResponse<LibraryItem>> {
    return this.request<LibraryItem>('/api/v1/favorites', {
      method: 'POST',
      body: JSON.stringify({
        contentId,
        encryptedData,
      }),
    });
  }

  /**
   * Supprime un favori
   */
  async removeFavorite(favoriteId: string): Promise<ApiResponse<void>> {
    return this.request<void>(`/api/v1/favorites/${favoriteId}`, {
      method: 'DELETE',
    });
  }

  // ==================== HEALTH CHECK ====================

  /**
   * Vérifie la santé du serveur
   */
  async checkServerHealth(): Promise<ApiResponse<{ status: string }>> {
    // Passer par request() pour bénéficier:
    // - du header X-Popcorn-Backend-Url (backend configuré dans localStorage)
    // - des timeouts (évite les spinners infinis)
    return this.request<{ status: string }>('/api/v1/health', { method: 'GET' });
  }

  // ==================== SETUP WIZARD ====================

  /**
   * Récupère le statut du setup
   */
  async getSetupStatus(): Promise<ApiResponse<SetupStatus>> {
    return this.request<SetupStatus>('/api/v1/setup/status');
  }

  /**
   * Récupère tous les indexers
   */
  async getIndexers(): Promise<ApiResponse<Indexer[]>> {
    return this.request<Indexer[]>('/api/v1/setup/indexers');
  }

  /**
   * Récupère les types d'indexers disponibles
   */
  async getIndexerTypes(): Promise<ApiResponse<IndexerTypeInfo[]>> {
    return this.request<IndexerTypeInfo[]>('/api/v1/setup/indexers/types');
  }

  /**
   * Crée un nouvel indexer
   */
  async createIndexer(data: IndexerFormData): Promise<ApiResponse<Indexer>> {
    return this.request<Indexer>('/api/v1/setup/indexers', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  /**
   * Met à jour un indexer existant
   */
  async updateIndexer(
    id: string,
    data: Partial<IndexerFormData>
  ): Promise<ApiResponse<Indexer>> {
    return this.request<Indexer>(`/api/v1/setup/indexers/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  /**
   * Supprime un indexer
   */
  async deleteIndexer(id: string): Promise<ApiResponse<void>> {
    return this.request<void>(`/api/v1/setup/indexers/${id}`, {
      method: 'DELETE',
    });
  }

  /**
   * Récupère les catégories configurées pour un indexer
   */
  async getIndexerCategories(indexerId: string): Promise<ApiResponse<string[]>> {
    return this.request<string[]>(`/api/v1/indexers/${indexerId}/categories`);
  }

  /**
   * Met à jour les catégories configurées pour un indexer
   */
  async updateIndexerCategories(indexerId: string, categories: string[]): Promise<ApiResponse<void>> {
    return this.request<void>(`/api/v1/indexers/${indexerId}/categories`, {
      method: 'PUT',
      body: JSON.stringify({ categories }),
    });
  }

  /**
   * Récupère les catégories disponibles depuis l'indexer (via Torznab caps)
   */
  async getIndexerAvailableCategories(indexerId: string): Promise<ApiResponse<Array<{ id: string; name: string; description?: string }>>> {
    return this.request<Array<{ id: string; name: string; description?: string }>>(`/api/v1/indexers/${indexerId}/categories/available`);
  }

  /**
   * Teste la connexion à un indexer
   */
  async testIndexer(id: string): Promise<ApiResponse<{
    success: boolean;
    message?: string;
    totalResults?: number;
    resultsCount?: number;
    successfulQueries?: number;
    failedQueries?: Array<[string, string]>;
    testQueries?: string[];
    categoriesFound?: string[];
    sampleResults?: Array<{
      title?: string;
      size?: number;
      seeders?: number;
      peers?: number;
      leechers?: number;
      category?: string;
      tmdbId?: number;
      slug?: string;
    }>;
    sampleResult?: any;
  }>> {
    return this.request(`/api/v1/indexers/test`, {
      method: 'POST',
      body: JSON.stringify({ id }),
    });
  }

  /**
   * Récupère la clé API TMDB (masquée)
   */
  async getTmdbKey(): Promise<ApiResponse<{ apiKey: string | null; hasKey: boolean }>> {
    return this.request<{ apiKey: string | null; hasKey: boolean }>('/api/v1/setup/tmdb');
  }

  /**
   * Sauvegarde la clé API TMDB
   */
  async saveTmdbKey(key: string): Promise<ApiResponse<void>> {
    return this.request<void>('/api/v1/setup/tmdb', {
      method: 'POST',
      body: JSON.stringify({ apiKey: key }),
    });
  }

  /**
   * Supprime la clé API TMDB
   */
  async deleteTmdbKey(): Promise<ApiResponse<void>> {
    return this.request<void>('/api/v1/setup/tmdb', {
      method: 'DELETE',
    });
  }

  /**
   * Teste la clé API TMDB existante (via le backend)
   */
  async testTmdbKey(): Promise<ApiResponse<{ valid: boolean; message?: string }>> {
    return this.request<{ valid: boolean; message?: string }>('/api/v1/setup/tmdb/test', {
      method: 'POST',
    });
  }

  /**
   * Récupère la configuration du client torrent (download_dir, etc.)
   */
  async getClientTorrentConfig(): Promise<ApiResponse<{
    config: {
      download_dir: string;
      max_downloads: number;
      max_upload_slots: number;
      librqbit_api_url: string;
    };
    download_paths: {
      films_path: string;
      films_exists: boolean;
      films_subdirs_count: number;
      series_path: string;
      series_exists: boolean;
      series_subdirs_count: number;
      stream_temp_path: string;
      stream_temp_exists: boolean;
    };
    subdirectory_creation: {
      enabled: boolean;
      description: string;
      example: string;
    };
  }>> {
    return this.request('/api/v1/admin/client-torrent/config');
  }

  // ==================== SYNCHRONISATION TORRENTS ====================

  /**
   * Récupère le statut de la synchronisation des torrents
   */
  async getSyncStatus(): Promise<ApiResponse<any>> {
    return this.request('/api/v1/sync/status');
  }

  /**
   * Démarre la synchronisation des torrents
   */
  async startSync(): Promise<ApiResponse<void>> {
    return this.request<void>('/api/v1/sync/start', {
      method: 'POST',
    });
  }

  /**
   * Arrête la synchronisation en cours
   */
  async stopSync(): Promise<ApiResponse<void>> {
    return this.request<void>('/api/v1/sync/stop', {
      method: 'POST',
    });
  }

  /**
   * Récupère les paramètres de synchronisation
   */
  async getSyncSettings(): Promise<ApiResponse<any>> {
    return this.request('/api/v1/sync/settings');
  }

  /**
   * Met à jour les paramètres de synchronisation
   */
  async updateSyncSettings(settings: any): Promise<ApiResponse<void>> {
    return this.request<void>('/api/v1/sync/settings', {
      method: 'PUT',
      body: JSON.stringify(settings),
    });
  }

  /**
   * Supprime tous les torrents synchronisés
   */
  async clearSyncTorrents(): Promise<ApiResponse<number>> {
    return this.request<number>('/api/v1/sync/clear-torrents', {
      method: 'POST',
    });
  }

  // ==================== DASHBOARD ====================

  /**
   * Récupère les données du dashboard
   */
  async getDashboardData(): Promise<ApiResponse<DashboardData>> {
    return this.request<DashboardData>('/api/v1/dashboard');
  }

  /**
   * Récupère les films
   */
  async getFilmsData(): Promise<ApiResponse<FilmData[]>> {
    return this.request<FilmData[]>('/api/v1/films');
  }

  /**
   * Récupère les séries
   */
  async getSeriesData(): Promise<ApiResponse<SeriesData[]>> {
    return this.request<SeriesData[]>('/api/v1/series');
  }

  // ==================== CONFIGURATION ====================

  /**
   * Définit l'URL du serveur (client Astro)
   * Note: Dans le navigateur, cette méthode est ignorée car le client doit toujours se connecter à lui-même
   * via window.location.origin. Cette méthode est utile uniquement en SSR ou pour les tests.
   * L'URL du backend Rust est stockée dans localStorage (côté client) via backend-config.ts
   */
  setServerUrl(url: string): void {
    // Dans le navigateur, ignorer cette méthode car le client doit toujours se connecter à lui-même
    // via window.location.origin (géré par getServerUrl())
    if (typeof window !== 'undefined' && window.location && window.location.origin) {
      // Ne pas mettre à jour baseUrl dans le navigateur - getServerUrl() utilisera toujours window.location.origin
      if (typeof console !== 'undefined' && console.warn) {
        console.warn('[server-api] setServerUrl() appelé dans le navigateur - ignoré. Le client se connecte toujours à lui-même via window.location.origin');
      }
      return;
    }
    
    // En SSR uniquement, permettre de définir une URL personnalisée
    let normalizedUrl = url.trim();
    
    // Normaliser l'URL : supprimer le port pour les domaines HTTPS
    try {
      const urlObj = new URL(normalizedUrl);
      // Si c'est HTTPS et qu'on a un port par défaut (443), le supprimer
      if (urlObj.protocol === 'https:' && urlObj.port === '443') {
        urlObj.port = '';
        normalizedUrl = urlObj.toString();
      }
      // Si c'est HTTP et qu'on a un port par défaut (80), le supprimer
      if (urlObj.protocol === 'http:' && urlObj.port === '80') {
        urlObj.port = '';
        normalizedUrl = urlObj.toString();
      }
      // Supprimer le slash final
      normalizedUrl = normalizedUrl.replace(/\/$/, '');
    } catch (e) {
      // URL invalide, on garde tel quel
    }
    
    // Mettre à jour l'URL en mémoire (SSR uniquement)
    this.baseUrl = normalizedUrl;
  }

  /**
   * Vérifie si l'utilisateur est authentifié
   */
  isAuthenticated(): boolean {
    // Recharger les tokens au cas où ils ont changé
    if (typeof window !== 'undefined') {
      this.loadTokens();
    }
    return !!this.accessToken;
  }


  /**
   * Récupère le token d'accès (pour usage interne dans les endpoints API)
   * Recharge les tokens depuis localStorage si nécessaire
   */
  getAccessToken(): string | null {
    // Recharger les tokens depuis localStorage au cas où ils ont changé
    if (typeof window !== 'undefined') {
      this.loadTokens();
    }
    return this.accessToken;
  }
}

// Instance singleton
export const serverApi = new ServerApiClient();
