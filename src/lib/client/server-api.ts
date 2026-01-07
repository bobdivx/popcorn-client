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

// Ré-exporter les types pour compatibilité
export type { ApiResponse } from './types';

export interface AuthResponse {
  user: {
    id: string;
    email: string;
  };
  accessToken: string;
  refreshToken: string;
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

  constructor(baseUrl?: string) {
    // Initialiser avec une valeur par défaut pour éviter undefined
    this.baseUrl = 'http://localhost:4321';
    
    // Récupérer l'URL du serveur depuis l'environnement ou le localStorage
    if (baseUrl && baseUrl.trim() && baseUrl !== 'undefined') {
      this.baseUrl = baseUrl.trim();
    } else {
      const url = this.getServerUrl();
      if (url && url !== 'undefined') {
        this.baseUrl = url;
      }
    }
    
    this.loadTokens();
  }

  /**
   * Récupère l'URL du serveur depuis l'environnement ou le localStorage
   */
  private getServerUrl(): string {
    // D'abord, essayer de récupérer depuis localStorage si disponible
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('server_url');
      if (stored && stored.trim() && stored !== 'undefined') {
        return stored.trim();
      }
    }
    
    // Ensuite, essayer depuis les variables d'environnement (.env)
    // Le client se connecte au frontend Astro du serveur (port 4321 par défaut)
    // qui fait office d'API gateway et expose les routes /api/v1/
    try {
      const envUrl = import.meta.env.PUBLIC_SERVER_URL;
      if (envUrl && envUrl !== 'undefined' && envUrl.trim()) {
        return envUrl.trim();
      }
    } catch (e) {
      // Ignorer les erreurs d'accès à import.meta.env côté serveur
    }
    
    // Retourner une valeur par défaut
    return 'http://localhost:4321';
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
    // Utiliser getServerUrl() qui réinitialise l'URL si nécessaire
    let baseUrl = this.getServerUrl();
    
    // Vérification de sécurité supplémentaire
    if (!baseUrl || baseUrl === 'undefined' || baseUrl.trim() === '') {
      baseUrl = 'http://localhost:4321';
      this.baseUrl = baseUrl;
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

    // Ajouter le token d'accès si disponible
    if (this.accessToken) {
      headers['Authorization'] = `Bearer ${this.accessToken}`;
    }

    try {
      const response = await fetch(url, {
        ...options,
        headers,
      });

      // Si token expiré, essayer de le rafraîchir
      if (response.status === 401 && this.refreshToken) {
        const refreshed = await this.refreshAccessToken();
        if (refreshed) {
          // Réessayer la requête avec le nouveau token
          headers['Authorization'] = `Bearer ${this.accessToken}`;
          const retryResponse = await fetch(url, {
            ...options,
            headers,
          });
          return await this.handleResponse<T>(retryResponse);
        }
      }

      return await this.handleResponse<T>(response);
    } catch (error) {
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
      // Les erreurs 401 (Unauthorized) sont normales si l'utilisateur n'est pas connecté
      // On ne les log pas comme des erreurs critiques
      if (response.status === 401) {
        return {
          success: false,
          error: 'Unauthorized',
          message: 'Non authentifié',
        };
      }

      return {
        success: false,
        error: data.error || 'UnknownError',
        message: data.message || `Erreur ${response.status}`,
      };
    }

    return {
      success: true,
      data: data.data || data,
    };
  }

  /**
   * Rafraîchit le token d'accès
   */
  private async refreshAccessToken(): Promise<boolean> {
    if (!this.refreshToken) return false;

    try {
      const response = await fetch(`${this.baseUrl}/api/v1/auth/refresh`, {
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
   * Le nouveau système utilise MediaDetailPage avec WebTorrent
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
              // Construire l'URL HLS (pour compatibilité, mais le nouveau système utilise WebTorrent)
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
    try {
      // Le frontend Astro expose /api/v1/health qui fait un proxy vers le backend
      const response = await fetch(`${this.baseUrl}/api/v1/health`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        return {
          success: false,
          error: 'ServerError',
          message: `Serveur non disponible (${response.status})`,
        };
      }

      const data = await response.json().catch(() => ({}));
      return {
        success: true,
        data: data.data || data || { status: 'ok' },
      };
    } catch (error) {
      return {
        success: false,
        error: 'NetworkError',
        message: error instanceof Error ? error.message : 'Erreur réseau',
      };
    }
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
      method: 'POST',
      body: JSON.stringify(settings),
    });
  }

  /**
   * Supprime tous les torrents synchronisés
   */
  async clearSyncTorrents(): Promise<ApiResponse<void>> {
    return this.request<void>('/api/v1/sync/clear-torrents', {
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
   * Définit l'URL du serveur
   * Normalise l'URL (supprime le port pour les domaines HTTPS, conserve pour HTTP local)
   */
  setServerUrl(url: string): void {
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
    
    this.baseUrl = normalizedUrl;
    if (typeof window !== 'undefined') {
      localStorage.setItem('server_url', normalizedUrl);
    }
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
   * Récupère l'URL du serveur (pour usage interne dans les endpoints API)
   * Réinitialise l'URL si elle n'est pas définie
   */
  getServerUrl(): string {
    // S'assurer que baseUrl est défini et valide
    if (!this.baseUrl || this.baseUrl === 'undefined' || this.baseUrl.trim() === '') {
      // Récupérer depuis localStorage si disponible
      if (typeof window !== 'undefined') {
        const stored = localStorage.getItem('server_url');
        if (stored && stored.trim() && stored !== 'undefined') {
          this.baseUrl = stored.trim();
          return this.baseUrl;
        }
      }
      // Sinon utiliser l'URL de l'environnement ou la valeur par défaut
      try {
        const envUrl = import.meta.env.PUBLIC_SERVER_URL;
        if (envUrl && envUrl !== 'undefined' && envUrl.trim()) {
          this.baseUrl = envUrl.trim();
        } else {
          this.baseUrl = 'http://localhost:4321';
        }
      } catch (e) {
        // En cas d'erreur, utiliser la valeur par défaut
        this.baseUrl = 'http://localhost:4321';
      }
    }
    // S'assurer qu'on retourne toujours une valeur valide
    return this.baseUrl || 'http://localhost:4321';
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
