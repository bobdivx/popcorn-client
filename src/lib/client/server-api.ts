/**
 * Client API pour communication avec le serveur principal (popcorn)
 * Ce client gère l'authentification, les requêtes API et le refresh automatique des tokens
 * 
 * Ce fichier assemble les modules modulaires depuis server-api/
 */

// Imports des types
import type {
  ApiResponse,
  SetupStatus,
  IndexerFormData,
  Indexer,
  IndexerTypeInfo,
  DashboardData,
  ContentItem,
  FilmData,
  SeriesData,
  SearchParams,
  SearchResult,
  StreamResponse,
  LibraryItem,
  AuthResponse,
} from './server-api/types.js';

// Imports des utilitaires
import { getBackendUrl } from '../backend-config.js';
import { isTauri } from '../utils/tauri.js';
// Utiliser la version client compatible navigateur pour JWT
import { generateAccessToken, generateRefreshToken } from '../auth/jwt-client.js';

// Imports des modules de méthodes
import { authMethods } from './server-api/auth.js';
import { mediaMethods } from './server-api/media.js';
import { libraryMethods } from './server-api/library.js';
import { healthMethods } from './server-api/health.js';
import { indexersMethods } from './server-api/indexers.js';
import { settingsMethods } from './server-api/settings.js';
import { syncMethods } from './server-api/sync.js';
import { dashboardMethods } from './server-api/dashboard.js';

// Ré-exporter les types pour compatibilité
export type {
  ApiResponse,
  SetupStatus,
  IndexerFormData,
  Indexer,
  IndexerTypeInfo,
  DashboardData,
  ContentItem,
  FilmData,
  SeriesData,
  SearchParams,
  SearchResult,
  StreamResponse,
  LibraryItem,
  AuthResponse,
} from './server-api/types.js';

class ServerApiClient {
  private baseUrl: string;
  private accessToken: string | null = null;
  private refreshToken: string | null = null;
  private static readonly STORAGE_USER_KEY = 'popcorn_user';

  private getBackendBaseUrl(): string {
    const raw = getBackendUrl();
    return (raw || 'http://127.0.0.1:3000').trim().replace(/\/$/, '');
  }

  private async nativeFetch(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
    // IMPORTANT:
    // - Dans Tauri (plugin-http), les options sont sérialisées vers Rust.
    //   Un AbortSignal n'est pas sérialisable -> peut provoquer un échec immédiat ("Erreur réseau").
    // - Dans le navigateur, on garde AbortController pour un vrai abort.
    if (isTauri()) {
      const logNative = async (message: string) => {
        try {
          const { invoke } = await import('@tauri-apps/api/core');
          await invoke('log-message', { message });
        } catch {
          // ignore
        }
      };

      // Sur Android/Tauri v2, essayer d'abord native-fetch, puis plugin-http en fallback
      // native-fetch est une commande personnalisée qui contourne les limitations ACL
      
      // Préparer les variables AVANT le try pour qu'elles soient accessibles dans le catch
      const method =
        (init as any)?.method && typeof (init as any).method === 'string' ? (init as any).method : 'GET';

      // Normaliser les headers vers une liste [k, v]
      const headerPairs: Array<[string, string]> = [];
      try {
        const h = (init as any)?.headers;
        if (h) {
          const headersObj = new Headers(h as any);
          headersObj.forEach((value, key) => headerPairs.push([key, value]));
        }
      } catch {
        // ignore
      }

      const body =
        typeof (init as any)?.body === 'string' || (init as any)?.body instanceof String
          ? String((init as any).body)
          : undefined;

      // Fonction helper pour le fallback plugin-http
      const usePluginHttpFallback = async (): Promise<Response> => {
        await logNative(`[popcorn-debug] Using plugin-http fallback for ${url}`);
        try {
          const { fetch: httpFetch } = await import('@tauri-apps/plugin-http');
          await logNative(`[popcorn-debug] plugin-http imported successfully`);
          
          const httpResponse = await httpFetch(url, {
            method: method as any,
            headers: Object.fromEntries(headerPairs),
            body: body,
          } as any);
          
          await logNative(`[popcorn-debug] plugin-http response: status=${httpResponse.status}`);
          
          const responseBody = await httpResponse.text();
          const responseHeaders = new Headers();
          httpResponse.headers.forEach((value, key) => {
            responseHeaders.set(key, value);
          });
          
          return new Response(responseBody, {
            status: httpResponse.status,
            headers: responseHeaders,
          });
        } catch (httpError) {
          const httpErrMsg = httpError instanceof Error ? httpError.message : String(httpError);
          const httpErrDetails = httpError instanceof Error 
            ? { name: httpError.name, message: httpError.message, stack: httpError.stack }
            : { value: httpError, type: typeof httpError };
          await logNative(`[popcorn-debug] plugin-http fallback failed: ${JSON.stringify(httpErrDetails)}`);
          throw httpError;
        }
      };

      try {
        const { invoke } = await import('@tauri-apps/api/core');

        // #region agent log
        await logNative(`[popcorn-debug] Attempting native-fetch: url=${url}, method=${method}`);
        // Log aussi dans la console JavaScript pour capture
        console.error('[popcorn-debug] Attempting native-fetch:', { url, method });
        // #endregion

        const res: any = await invoke('native-fetch', {
          url,
          method,
          headers: headerPairs,
          body,
          timeoutMs,
        } as any);

        // #region agent log
        await logNative(`[popcorn-debug] native-fetch success: status=${res?.status}, ok=${res?.ok}`);
        console.error('[popcorn-debug] native-fetch success:', { status: res?.status, ok: res?.ok });
        // #endregion

        const outHeaders = new Headers();
        try {
          for (const [k, v] of (res?.headers || []) as Array<[string, string]>) {
            if (k) outHeaders.set(k, v);
          }
        } catch {
          // ignore
        }

        return new Response(res?.body ?? '', { status: res?.status ?? 0, headers: outHeaders });
      } catch (e) {
        const err =
          e instanceof Error ? { name: e.name, message: e.message, stack: e.stack } : { value: e, type: typeof e };
        const errorMsg = e instanceof Error ? e.message : String(e);
        const errorStr = errorMsg.toLowerCase();
        const errorName = e instanceof Error ? e.name : '';
        
        // #region agent log
        await logNative(`[popcorn-debug] native-fetch error: name=${errorName}, message=${errorMsg}, full=${JSON.stringify(err)}`);
        // Log aussi dans la console JavaScript pour capture dans logcat
        console.error('[popcorn-debug] native-fetch ERROR:', { 
          name: errorName, 
          message: errorMsg, 
          errorStr, 
          full: err,
          url 
        });
        // #endregion
        
        // Détection robuste : vérifier plusieurs patterns d'erreur possibles
        // Tauri peut retourner différentes variantes selon la version
        const isCommandNotFound = 
          errorStr.includes('not found') || 
          errorStr.includes('command') && (errorStr.includes('native-fetch') || errorStr.includes('not found')) ||
          errorStr.includes('unknown command') ||
          errorStr.includes('command not found') ||
          errorName === 'CommandNotFound' ||
          errorName === 'TauriError' && errorStr.includes('not found');
        
        if (isCommandNotFound) {
          await logNative(`[popcorn-debug] Command not found detected, using plugin-http fallback`);
          return await usePluginHttpFallback();
        }
        
        // Si ce n'est pas une erreur "not found", mais qu'on est sur Android, 
        // essayer quand même plugin-http comme dernier recours
        // (certaines erreurs peuvent masquer le vrai problème)
        try {
          const { invoke: invokeCheck } = await import('@tauri-apps/api/core');
          const platform = await invokeCheck('get-platform').catch(() => 'unknown');
          if (platform === 'android') {
            await logNative(`[popcorn-debug] Android detected, trying plugin-http as last resort`);
            return await usePluginHttpFallback();
          }
        } catch {
          // Ignore si on ne peut pas vérifier la plateforme
        }
        
        await logNative(`[popcorn-debug] native-fetch failed (not recoverable) url=${url} err=${JSON.stringify(err)}`);
        throw e;
      }
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(url, { ...(init as any), signal: controller.signal });
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private saveUser(user: any): void {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(ServerApiClient.STORAGE_USER_KEY, JSON.stringify(user || null));
    } catch {
      // ignore
    }
  }

  private getUser(): any | null {
    if (typeof window === 'undefined') return null;
    try {
      const raw = localStorage.getItem(ServerApiClient.STORAGE_USER_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  private getCurrentUserId(): string | null {
    const u = this.getUser();
    const id = u?.id || u?.user?.id;
    return typeof id === 'string' && id.trim() ? id : null;
  }

  private async backendRequest<T>(endpoint: string, options: RequestInit = {}): Promise<ApiResponse<T>> {
    const base = this.getBackendBaseUrl();
    const url = `${base}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;

    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    };

    try {
      const timeoutMs = this.getTimeoutMs(endpoint);
      const response = await this.nativeFetch(url, { ...options, headers }, timeoutMs);

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        // Log pour debug : voir la réponse exacte du backend
        if (typeof window !== 'undefined' && endpoint.includes('/auth/login')) {
          const dataStr = JSON.stringify(data, null, 2);
          console.error('[server-api] Erreur login backend:', {
            status: response.status,
            statusText: response.statusText,
            url,
          });
          console.error('[server-api] Données complètes du backend:', dataStr);
          console.error('[server-api] Structure data:', data && typeof data === 'object' ? Object.keys(data) : []);
        }
        
        // Extraire le message d'erreur du backend
        // Le backend Rust renvoie : { success: false, data: null, error: "message" }
        let errorMessage = `Erreur ${response.status}`;
        let errorCode = 'BackendError';
        
        if (data && typeof data === 'object') {
          // Priorité 1 : Le champ error (format Rust)
          if ((data as any).error && typeof (data as any).error === 'string') {
            errorMessage = (data as any).error;
            errorCode = (data as any).error.includes('mot de passe') ? 'InvalidCredentials' : 'BackendError';
          }
          // Priorité 2 : Le champ message
          else if ((data as any).message && typeof (data as any).message === 'string') {
            errorMessage = (data as any).message;
          }
          // Priorité 3 : Le champ detail
          else if ((data as any).detail && typeof (data as any).detail === 'string') {
            errorMessage = (data as any).detail;
          }
        }
        
        return {
          success: false,
          error: errorCode,
          message: errorMessage,
        };
      }

      // Backend renvoie souvent { success, data }, on normalise.
      return {
        success: true,
        data: (data && typeof data === 'object' && 'data' in data ? (data as any).data : data) as T,
      };
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        return {
          success: false,
          error: 'Timeout',
          message: 'Timeout: le backend ne répond pas.',
        };
      }
      return {
        success: false,
        error: 'NetworkError',
        // Garder le message le plus informatif possible (utile pour diagnostiquer Android/Tauri).
        message: error instanceof Error ? (error.message || error.toString()) : String(error),
      };
    }
  }

  private getTimeoutMs(endpoint: string): number {
    // Valeurs conservatrices pour éviter les "spinners infinis"
    if (endpoint.includes('/torrents/magnet')) return 60000;
    if (endpoint.includes('/api/media/') || endpoint.includes('/api/torrents/')) return 30000;
    // Le setup peut impliquer des écritures DB + détection/validation indexer -> parfois lent
    if (endpoint.startsWith('/api/v1/setup/')) return 60000;
    if (endpoint.startsWith('/api/v1/sync/')) return 60000;
    // Health checks au démarrage : timeout plus court pour éviter les ANR sur Android
    if (endpoint.includes('/health') || endpoint.includes('/api/client/health')) return 5000;
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
    // Note: On n'appelle pas getServerUrl() dans le constructeur pour éviter des dépendances
    // trop précoces. getServerUrl() sera appelé à chaque fois qu'on en a besoin.
    
    this.loadTokens();
  }

  /**
   * Génère des tokens JWT côté client (comme en Tauri)
   * Utilisé pour unifier la logique entre web et Android
   * Utilise Web Crypto API pour compatibilité navigateur
   */
  private async generateClientTokens(userId: string, username: string): Promise<{ accessToken: string; refreshToken: string }> {
    const accessToken = await generateAccessToken({ userId, username });
    const refreshToken = await generateRefreshToken({ userId, username });
    return { accessToken, refreshToken };
  }

  /**
   * Récupère l'URL du backend Rust
   * Unifié pour web et Android : on utilise toujours l'URL du backend directement
   */
  getServerUrl(): string {
    // Unifié : on utilise toujours l'URL du backend Rust (pas de proxy Astro)
    const backend = this.getBackendBaseUrl();
    if (backend && backend !== 'undefined' && backend.trim()) {
      return backend;
    }
    
    // Fallback si backend non configuré (dev uniquement)
    if (typeof window !== 'undefined') {
      console.warn('[server-api] Backend URL non configuré, utilisation de localhost:3000 par défaut');
    }
    return 'http://127.0.0.1:3000';
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
    // Utiliser getServerUrl() qui retourne l'URL backend depuis getBackendBaseUrl()
    const baseUrl = this.getServerUrl();
    
    // Vérification de sécurité supplémentaire
    // Note: getServerUrl() retourne maintenant toujours getBackendBaseUrl(), donc cette vérification est rarement nécessaire
    if (!baseUrl || baseUrl === 'undefined' || baseUrl.trim() === '') {
      // En dernier recours, utiliser l'URL backend par défaut
      return this.backendRequest<T>(endpoint, options);
    }
    
    const url = `${baseUrl}${endpoint}`;
    
    // S'assurer que les tokens sont à jour avant de faire la requête
    if (typeof window !== 'undefined') {
      this.loadTokens();
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as any),
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
    if (this.accessToken && !isAuthBootstrapEndpoint) headers.Authorization = `Bearer ${this.accessToken}`;

    try {
      const timeoutMs = this.getTimeoutMs(endpoint);
      // NOTE: en Tauri, on passe par le client HTTP natif (plugin-http) pour éviter les limitations WebView/CORS.
      const response = await this.nativeFetch(url, { ...options, headers }, timeoutMs);

      // Si token expiré, essayer de le rafraîchir (sauf endpoints d'auth bootstrap)
      if (!isAuthBootstrapEndpoint && response.status === 401 && this.refreshToken) {
        const refreshed = await this.refreshAccessToken();
        if (refreshed) {
          // Réessayer la requête avec le nouveau token
          headers.Authorization = `Bearer ${this.accessToken}`;
          const retryResponse = await this.nativeFetch(url, { ...options, headers }, timeoutMs);
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
   * Désactivé : les tokens sont générés côté client, pas besoin de refresh via API
   */
  private async refreshAccessToken(): Promise<boolean> {
    // Les tokens JWT sont générés côté client, pas de refresh nécessaire
    // Cette méthode est conservée pour compatibilité mais ne fait rien
    return false;
  }

  // Les méthodes publiques sont ajoutées via Object.assign à la fin du fichier depuis les modules

  /**
   * Définit l'URL du serveur (client Astro)
   * Note: Dans le navigateur, cette méthode est ignorée car le client doit toujours se connecter à lui-même
   * via window.location.origin. Cette méthode est utile uniquement en SSR ou pour les tests.
   * L'URL du backend Rust est stockée dans localStorage (côté client) via backend-config.ts
   */
  setServerUrl(url: string): void {
    // Unifié : on utilise toujours l'URL backend depuis getBackendBaseUrl()
    // En mode web/navigateur, l'URL backend est déjà définie dans localStorage
    // Cette méthode permet de surcharger l'URL en mode SSR ou pour override en dev
    if (typeof window !== 'undefined') {
      // En mode navigateur, utiliser getServerUrl() qui lit depuis localStorage
      // setServerUrl() n'est pas nécessaire mais est toléré pour compatibilité
      if (typeof console !== 'undefined' && console.warn) {
        console.warn('[server-api] setServerUrl() appelé dans le navigateur - l\'URL backend est gérée par getBackendBaseUrl() via localStorage');
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

/**
 * Interface pour toutes les méthodes publiques de ServerApiClient
 * Ces méthodes sont ajoutées via Object.assign depuis les modules
 */
interface IServerApiClientPublic {
  // Auth methods
  register(email: string, password: string, inviteCode: string): Promise<ApiResponse<{ user: { id: string; email: string } }>>;
  login(email: string, password: string): Promise<ApiResponse<AuthResponse>>;
  loginCloud(email: string, password: string): Promise<ApiResponse<AuthResponse>>;
  registerCloud(email: string, password: string, inviteCode: string): Promise<ApiResponse<AuthResponse>>;
  logout(): void;
  getMe(): Promise<ApiResponse<{ id: string; email: string }>>;

  // Media methods
  search(params: SearchParams): Promise<ApiResponse<SearchResult[]>>;
  getTorrentGroup(slug: string): Promise<ApiResponse<any>>;
  getTorrentById(id: string): Promise<ApiResponse<any>>;
  getStream(contentId: string): Promise<ApiResponse<StreamResponse>>;

  // Library methods
  getLibrary(): Promise<ApiResponse<LibraryItem[]>>;
  addToLibrary(contentId: string, title: string, type: 'movie' | 'tv', encryptedData?: string): Promise<ApiResponse<LibraryItem>>;
  removeFromLibrary(libraryId: string): Promise<ApiResponse<void>>;
  getFavorites(): Promise<ApiResponse<LibraryItem[]>>;
  addFavorite(contentId: string, encryptedData?: string): Promise<ApiResponse<LibraryItem>>;
  removeFavorite(favoriteId: string): Promise<ApiResponse<void>>;

  // Health methods
  checkServerHealth(): Promise<ApiResponse<{ status: string }>>;
  getSetupStatus(): Promise<ApiResponse<SetupStatus>>;

  // Indexers methods
  getIndexers(): Promise<ApiResponse<Indexer[]>>;
  getIndexerTypes(): Promise<ApiResponse<IndexerTypeInfo[]>>;
  createIndexer(data: IndexerFormData): Promise<ApiResponse<Indexer>>;
  updateIndexer(id: string, data: Partial<IndexerFormData>): Promise<ApiResponse<Indexer>>;
  deleteIndexer(id: string): Promise<ApiResponse<void>>;
  getIndexerCategories(indexerId: string): Promise<ApiResponse<string[]>>;
  updateIndexerCategories(indexerId: string, categories: string[]): Promise<ApiResponse<void>>;
  getIndexerAvailableCategories(indexerId: string): Promise<ApiResponse<Array<{ id: string; name: string; description?: string }>>>;
  testIndexer(id: string): Promise<ApiResponse<any>>;

  // Settings methods
  getTmdbKey(): Promise<ApiResponse<{ apiKey: string | null; hasKey: boolean }>>;
  saveTmdbKey(key: string): Promise<ApiResponse<void>>;
  deleteTmdbKey(): Promise<ApiResponse<void>>;
  testTmdbKey(): Promise<ApiResponse<{ valid: boolean; message?: string }>>;
  getClientTorrentConfig(): Promise<ApiResponse<any>>;

  // Sync methods
  getSyncStatus(): Promise<ApiResponse<any>>;
  startSync(): Promise<ApiResponse<void>>;
  stopSync(): Promise<ApiResponse<void>>;
  getSyncSettings(): Promise<ApiResponse<any>>;
  updateSyncSettings(settings: any): Promise<ApiResponse<void>>;
  clearSyncTorrents(): Promise<ApiResponse<number>>;

  // Dashboard methods
  getDashboardData(): Promise<ApiResponse<DashboardData>>;
  getFilmsData(): Promise<ApiResponse<FilmData[]>>;
  getSeriesData(): Promise<ApiResponse<SeriesData[]>>;
}

// Fusionner les types pour que ServerApiClient ait toutes les méthodes publiques
type ServerApiClientComplete = ServerApiClient & IServerApiClientPublic;

// Assembler les méthodes des modules
Object.assign(ServerApiClient.prototype, 
  authMethods,
  mediaMethods,
  libraryMethods,
  healthMethods,
  indexersMethods,
  settingsMethods,
  syncMethods,
  dashboardMethods
);

// Augmenter le type ServerApiClient pour inclure toutes les méthodes publiques
// Cela permet à TypeScript de reconnaître les méthodes ajoutées via Object.assign
interface ServerApiClient extends IServerApiClientPublic {}

// Instance singleton
export const serverApi = new ServerApiClient() as ServerApiClientComplete;
