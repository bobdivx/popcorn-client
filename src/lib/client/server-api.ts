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
import { getBackendUrl, isDemoMode } from '../backend-config.js';
import { isTauri } from '../utils/tauri.js';
import { getDemoServerApi } from './server-api-demo.js';
// Utiliser la version client compatible navigateur pour JWT
import { generateAccessToken, generateRefreshToken } from '../auth/jwt-client.js';

// Imports des modules de méthodes
import { authMethods } from './server-api/auth.js';
import { mediaMethods } from './server-api/media.js';
import { libraryMethods, type LibraryMediaEntry } from './server-api/library.js';
import { localMediaMethods } from './server-api/local-media.js';
import { uploadTrackerMethods } from './server-api/upload-tracker.js';
import type {
  CreateTorrentParams,
  PublishC411Params,
  PublishC411Response,
  C411UploadCookiesResponse,
  C411BatchEvent,
  UploaderPreviewResponse,
  UploadMediaValidationResponse,
  PublishedUploadMediaEntry,
  CheckDuplicateResponse,
  CancelTorrentCreationResponse,
  ActiveTorrentCreationEntry,
} from './server-api/upload-tracker.js';
import { healthMethods } from './server-api/health.js';
import { indexersMethods } from './server-api/indexers.js';
import { settingsMethods } from './server-api/settings.js';
import { syncMethods } from './server-api/sync.js';
import { dashboardMethods } from './server-api/dashboard.js';
import { twoFactorMethods } from './server-api/two-factor.js';
import { quickConnectMethods } from './server-api/quick-connect.js';
import { localUsersMethods } from './server-api/local-users.js';
import { friendsMethods } from './server-api/friends.js';
import { requestsMethods } from './server-api/requests.js';
import { systemMethods } from './server-api/system.js';

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

/** Callbacks appelés quand une requête échoue avec ConnectionError/Timeout (serveur hors ligne). Utilisé par le store pour remonter l'état dans l'UI. */
export type ConnectionFailureListener = () => void;

/** Callbacks appelés quand une requête backend réussit (2xx). Permet au store de repasser en "online" après un offline. */
export type ConnectionSuccessListener = () => void;

class ServerApiClient {
  private baseUrl: string;
  private accessToken: string | null = null;
  private refreshToken: string | null = null;
  private static readonly STORAGE_USER_KEY = 'popcorn_user';
  private connectionFailureListeners: ConnectionFailureListener[] = [];
  private connectionSuccessListeners: ConnectionSuccessListener[] = [];

  private getBackendBaseUrl(): string {
    const raw = getBackendUrl();
    return (raw || 'http://127.0.0.1:3000').trim().replace(/\/$/, '');
  }

  private async nativeFetch(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
    // IMPORTANT:
    // - En production Android, fetch standard fonctionne et est prioritaire
    // - Les méthodes Tauri (native-fetch, plugin-http) sont utilisées en fallback seulement si fetch standard échoue
    // - Dans Tauri (plugin-http), les options sont sérialisées vers Rust.
    //   Un AbortSignal n'est pas sérialisable -> peut provoquer un échec immédiat ("Erreur réseau").
    
    // Tenter fetch standard d'abord (même en Tauri - c'est ce qui fonctionne en production Android)
    let fetchStandardError: unknown = null;
    const timeoutController = new AbortController();
    const timeoutId = setTimeout(
      () => timeoutController.abort(new DOMException('Request timeout', 'AbortError')),
      timeoutMs
    );
    const externalSignal = init.signal;
    const combinedController = new AbortController();
    const abortCombined = (reason?: unknown) => {
      if (!combinedController.signal.aborted) {
        combinedController.abort(reason);
      }
    };
    const onTimeoutAbort = () => {
      abortCombined(timeoutController.signal.reason ?? new DOMException('Request timeout', 'AbortError'));
    };
    const onExternalAbort = () => {
      abortCombined(externalSignal?.reason ?? new DOMException('Request aborted', 'AbortError'));
    };
    timeoutController.signal.addEventListener('abort', onTimeoutAbort, { once: true });
    if (externalSignal) {
      if (externalSignal.aborted) {
        onExternalAbort();
      } else {
        externalSignal.addEventListener('abort', onExternalAbort, { once: true });
      }
    }
    try {
      const { signal: _ignoredSignal, ...restInit } = init;
      const response = await fetch(url, { ...(restInit as any), signal: combinedController.signal });
      // Si fetch standard réussit, retourner directement
      return response;
    } catch (fetchError) {
      fetchStandardError = fetchError;
      
      // Si on n'est pas en Tauri, relancer l'erreur
      if (!isTauri()) {
        throw fetchError;
      }
      
      // En Tauri, si fetch standard échoue, essayer les méthodes Tauri en fallback
      // Exception : si c'est un AbortError (timeout), ne pas essayer les fallbacks (ce serait trop lent)
      const isAbortError = fetchError instanceof Error && fetchError.name === 'AbortError';
      if (isAbortError) {
        // Timeout = relancer directement sans essayer les méthodes Tauri (ce serait trop lent)
        throw fetchError;
      }
      
      // Pour toutes les autres erreurs (CORS, réseau, etc.), essayer les méthodes Tauri en fallback
      // (continuer vers le bloc ci-dessous)
    } finally {
      clearTimeout(timeoutId);
      timeoutController.signal.removeEventListener('abort', onTimeoutAbort);
      if (externalSignal) {
        externalSignal.removeEventListener('abort', onExternalAbort);
      }
    }

    // Fallback vers les méthodes Tauri uniquement si fetch standard a échoué et qu'on est en Tauri
    if (isTauri() && fetchStandardError) {
      const logNative = async (message: string) => {
        try {
          const { invoke } = await import('@tauri-apps/api/core');
          await invoke('log-message', { message });
        } catch {
          // ignore
        }
      };

      await logNative(`[popcorn-debug] fetch standard failed, trying Tauri methods as fallback for ${url}`);
      console.warn('[popcorn-debug] fetch standard failed, falling back to Tauri methods:', { url });
      
      // Essayer native-fetch, puis plugin-http en fallback
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
      // Retourne null si échoue pour permettre un fallback supplémentaire vers fetch standard
      const usePluginHttpFallback = async (): Promise<Response | null> => {
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
          // Retourner null au lieu de lancer une erreur pour permettre le fallback vers fetch standard
          return null;
        }
      };

      try {
        const { invoke } = await import('@tauri-apps/api/core');

        // Debug logging removed for production security

        const res: any = await invoke('native-fetch', {
          url,
          method,
          headers: headerPairs,
          body,
          timeoutMs,
        } as any);

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
        
        // Debug logging removed for production security
        
        // Détection robuste : vérifier plusieurs patterns d'erreur possibles
        // Tauri peut retourner différentes variantes selon la version
        const isCommandNotFound = 
          errorStr.includes('not found') || 
          errorStr.includes('command') && (errorStr.includes('native-fetch') || errorStr.includes('not found')) ||
          errorStr.includes('unknown command') ||
          errorStr.includes('command not found') ||
          errorName === 'CommandNotFound' ||
          errorName === 'TauriError' && errorStr.includes('not found');
        
        // Essayer plugin-http en fallback
        let pluginHttpResult: Response | null = null;
        if (isCommandNotFound) {
          await logNative(`[popcorn-debug] Command not found detected, using plugin-http fallback`);
          pluginHttpResult = await usePluginHttpFallback();
        } else {
          // Si ce n'est pas une erreur "not found", mais qu'on est sur Android, 
          // essayer quand même plugin-http comme dernier recours
          // (certaines erreurs peuvent masquer le vrai problème)
          try {
            const { invoke: invokeCheck } = await import('@tauri-apps/api/core');
            const platform = await invokeCheck('get-platform').catch(() => 'unknown');
            if (platform === 'android') {
              await logNative(`[popcorn-debug] Android detected, trying plugin-http as last resort`);
              pluginHttpResult = await usePluginHttpFallback();
            }
          } catch {
            // Ignore si on ne peut pas vérifier la plateforme
          }
        }
        
        // Si plugin-http a réussi, retourner le résultat
        if (pluginHttpResult !== null) {
          return pluginHttpResult;
        }
        
        // Si plugin-http a échoué aussi, relancer l'erreur originale de fetch standard
        // (on est déjà ici parce que fetch standard a échoué en premier)
        await logNative(`[popcorn-debug] native-fetch and plugin-http both failed for ${url}`);
        console.error('[popcorn-debug] All fetch methods failed:', { url, method });
        
        // Relancer l'erreur originale de fetch standard
        // Cela permettra au gestionnaire d'erreurs de la méthode appelante de gérer proprement
        throw fetchStandardError;
      }
    }
    
    // Si on arrive ici, cela signifie qu'on n'est pas en Tauri et que fetch standard a réussi
    // (ce qui ne devrait jamais arriver car on retourne directement dans le try au-dessus)
    // Cette ligne ne devrait jamais être atteinte
    throw new Error('Unreachable code in nativeFetch');
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

  /**
   * Détecte si une erreur est récupérable (peut être retentée).
   * Connexion refusée / Failed to fetch / DNS (ERR_NAME_NOT_RESOLVED) : pas de retry (backend injoignable, évite le spam).
   */
  private isRetryableError(error: unknown, response?: Response): boolean {
    // Erreurs réseau sans réponse (connexion refusée, failed to fetch, DNS) : ne pas retenter
    if (error instanceof Error) {
      const msg = error.message.toLowerCase();
      if (
        msg.includes('failed to fetch') ||
        msg.includes('networkerror') ||
        msg.includes('connection refused') ||
        msg.includes('err_connection_refused') ||
        msg.includes('err_name_not_resolved') ||
        msg.includes('getaddrinfo') ||
        msg.includes('enotfound')
      ) {
        return false;
      }
      // Timeout / Abort : retenter une fois peut aider
      if (error.name === 'AbortError' || msg.includes('timeout')) {
        return true;
      }
    }

    // Erreurs HTTP 5xx (erreurs serveur temporaires)
    if (response && response.status >= 500 && response.status < 600) {
      return true;
    }

    return false;
  }

  /**
   * Empêche les requêtes HTTP depuis une page HTTPS (Mixed Content).
   */
  private getMixedContentError(url: string): string | null {
    if (typeof window === 'undefined') return null;
    if (window.location.protocol !== 'https:') return null;
    try {
      const urlObj = new URL(url, window.location.origin);
      if (urlObj.protocol !== 'http:') return null;
      const host = urlObj.hostname.toLowerCase();
      const isLocalhost =
        host === 'localhost' ||
        host === '127.0.0.1' ||
        host === '::1' ||
        host.endsWith('.localhost');
      if (isLocalhost) return null;
      return 'Le site est en HTTPS et le backend est en HTTP. Le navigateur bloque cette requête (Mixed Content). Configure un backend HTTPS (reverse proxy) ou utilise une URL backend HTTPS.';
    } catch {
      return null;
    }
  }

  /**
   * Retourne un message d'erreur clair pour l'utilisateur
   */
  private getErrorMessage(error: unknown, response?: Response, endpoint?: string, url?: string): { code: string; message: string } {
    // Erreur de timeout
    if (error instanceof Error && error.name === 'AbortError') {
      const urlInfo = url ? `\n\nURL utilisée: ${url}` : '';
      return {
        code: 'Timeout',
        message: `Le backend ne répond pas. Vérifiez que le serveur est démarré et accessible.${urlInfo}`,
      };
    }
    
    // Erreur de connexion réseau
    if (error instanceof Error) {
      const msg = error.message.toLowerCase();
      if (msg.includes('failed to fetch') || msg.includes('networkerror') || msg.includes('connection')) {
        const urlInfo = url ? `\n\nURL utilisée: ${url}` : '';
        const isAndroid = typeof window !== 'undefined' && /Android/i.test(navigator.userAgent || '');
        let message = `Impossible de se connecter au backend.${urlInfo}`;
        
        if (isAndroid) {
          message += `\n\nSur Android:\n• Vérifiez que l'IP est correcte (pas 10.0.2.2 sur appareil physique)\n• Utilisez l'IP locale de votre machine (ex: http://192.168.1.100:3000)\n• Assurez-vous que votre mobile et votre PC sont sur le même réseau Wi-Fi\n• Vérifiez que le backend Rust est démarré\n• Testez depuis le navigateur mobile: ${url || 'http://VOTRE_IP:3000'}/api/client/health`;
        } else {
          message += `\n\nVérifiez votre connexion réseau et que le serveur est démarré.`;
        }
        
        return {
          code: 'ConnectionError',
          message,
        };
      }
    }
    
    // Erreur HTTP avec réponse
    if (response) {
      if (response.status === 401) {
        return {
          code: 'Unauthorized',
          message: 'Authentification requise. Veuillez vous connecter.',
        };
      }
      if (response.status === 403) {
        return {
          code: 'Forbidden',
          message: 'Accès refusé. Vous n\'avez pas les permissions nécessaires.',
        };
      }
      if (response.status === 404) {
        return {
          code: 'NotFound',
          message: 'Ressource non trouvée sur le serveur.',
        };
      }
      if (response.status >= 500) {
        return {
          code: 'ServerError',
          message: 'Erreur serveur. Veuillez réessayer dans quelques instants.',
        };
      }
    }
    
    // Erreur générique
    return {
      code: 'NetworkError',
      message: error instanceof Error ? error.message : 'Erreur réseau inconnue.',
    };
  }

  private async backendRequest<T>(endpoint: string, options: RequestInit = {}, retryCount = 0, baseUrlOverride?: string): Promise<ApiResponse<T>> {
    const base = baseUrlOverride ?? this.getBackendBaseUrl();
    // Après "vider les torrents", les listes doivent être vides pour l'utilisateur courant : envoyer user_id sur list et fast
    let finalEndpoint = endpoint;
    if (endpoint.includes('/api/torrents/list') || endpoint.includes('/api/torrents/fast')) {
      const uid = this.getCurrentUserId();
      if (uid) {
        finalEndpoint += (endpoint.includes('?') ? '&' : '?') + 'user_id=' + encodeURIComponent(uid);
      }
    }
    const url = `${base}${finalEndpoint.startsWith('/') ? '' : '/'}${finalEndpoint}`;
    const maxRetries = 2; // Maximum 2 retries (3 tentatives au total)
    
    const mixedContentError = this.getMixedContentError(url);
    if (mixedContentError) {
      return {
        success: false,
        error: 'MixedContent',
        message: mixedContentError,
      };
    }

    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    };
    // Indiquer au backend si la requête vient du client cloud ou d'un client local.
    // On n'envoie le header que en same-origin pour éviter les erreurs CORS avec les backends
    // qui n'incluent pas encore x-popcorn-client-origin dans Access-Control-Allow-Headers.
    if (typeof window !== 'undefined' && window.location?.origin) {
      try {
        const requestOrigin = new URL(url).origin;
        if (requestOrigin === window.location.origin) {
          const h = (window.location.hostname || '').toLowerCase();
          const isCloud = h === 'client.popcornn.app' || h.endsWith('.client.popcornn.app');
          (headers as Record<string, string>)['X-Popcorn-Client-Origin'] = isCloud ? 'cloud' : 'local';
        }
      } catch {
        // URL invalide, ne pas ajouter le header
      }
    }

    // Ne jamais utiliser le cache navigateur pour les listes torrents et le statut sync
    // (après "vider les torrents", les prochains chargements doivent voir la liste vide)
    const noCache =
      (options.method === 'GET' || !options.method) &&
      (endpoint.includes('/api/torrents/list') || endpoint.includes('/api/torrents/fast') || endpoint.includes('/api/sync/status'));
    const fetchOptions = noCache ? { ...options, headers, cache: 'no-store' as RequestCache } : { ...options, headers };

    try {
      const timeoutMs = this.getTimeoutMs(endpoint);
      const response = await this.nativeFetch(url, fetchOptions, timeoutMs);

      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        // 401 sur login = pas de compte local, le client tente le cloud ensuite → ne pas polluer la console
        const isLogin401 = response.status === 401 && endpoint.includes('/auth/login');
        if (typeof window !== 'undefined' && !isLogin401 && (endpoint.includes('/auth/login') || endpoint.includes('/sync/start'))) {
          const dataStr = JSON.stringify(data, null, 2);
          console.error(`[server-api] Erreur backend (${endpoint}):`, {
            status: response.status,
            statusText: response.statusText,
            url,
          });
          console.error('[server-api] Données complètes du backend:', dataStr);
          console.error('[server-api] Structure data:', data && typeof data === 'object' ? Object.keys(data) : []);
        }
        if (typeof window !== 'undefined' && isLogin401) {
          console.log('[server-api] Pas de compte local sur le backend, tentative de connexion cloud...');
        }
        
        // Vérifier si l'erreur est récupérable et retenter si nécessaire
        // Ne pas retenter le 502 pour l'ajout de tracker : le message du backend (librqbit injoignable, route absente) doit s'afficher tout de suite.
        const isAddTracker502 =
          response.status === 502 && endpoint.includes('/trackers') && (options.method === 'POST' || (options as any).method === 'POST');
        // Ne pas retenter les endpoints non-idempotents : un retry relance des jobs coûteux (captures, hash, upload).
        const isNonIdempotentPost =
          (options.method === 'POST' || (options as any).method === 'POST') &&
          (endpoint.includes('/api/library/uploader/upload-one') ||
            endpoint.includes('/api/library/uploader/generate-screenshots') ||
            endpoint.includes('/api/library/upload-tracker/create-torrent') ||
            endpoint.includes('/api/admin/system/restart'));
        if (
          retryCount < maxRetries &&
          !isAddTracker502 &&
          !isNonIdempotentPost &&
          this.isRetryableError(null, response)
        ) {
          const delay = Math.min(1000 * Math.pow(2, retryCount), 3000); // Exponential backoff, max 3s
          console.warn(`[server-api] Erreur récupérable ${response.status}, retry dans ${delay}ms (tentative ${retryCount + 1}/${maxRetries})`);
          await new Promise(resolve => setTimeout(resolve, delay));
          return this.backendRequest<T>(endpoint, options, retryCount + 1, baseUrlOverride);
        }
        
        // Extraire le message d'erreur du backend
        // Le backend Rust renvoie : { success: false, data: null, error: "message" }
        let errorMessage = `Erreur ${response.status}`;
        let errorCode = 'BackendError';
        if (response.status === 404) {
          errorCode = 'NotFound';
        }
        
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
        
        // Log explicite pour les erreurs C411 cookies (éviter de ne voir que "400" dans la console)
        if (typeof window !== 'undefined' && endpoint.includes('c411-upload-cookies') && response.status >= 400) {
          console.warn('[server-api] C411 cookies — erreur backend:', response.status, errorMessage);
        }
        
        return {
          success: false,
          error: errorCode,
          message: errorMessage,
        };
      }

      // Succès : notifier les listeners pour remettre le store en "online" si besoin
      this.connectionSuccessListeners.forEach((cb) => { try { cb(); } catch (_) { /* ignore */ } });
      // Backend renvoie souvent { success, data }, on normalise.
      return {
        success: true,
        data: (data && typeof data === 'object' && 'data' in data ? (data as any).data : data) as T,
      };
    } catch (error) {
      const errorDetails = error instanceof Error ? {name:error.name,message:error.message,stack:error.stack} : {value:String(error),type:typeof error};
      const userAborted = options.signal?.aborted && error instanceof Error && error.name === 'AbortError';
      if (userAborted) {
        return {
          success: false,
          error: 'Aborted',
          message: 'Requête annulée.',
        };
      }
      // Vérifier si l'erreur est récupérable et retenter si nécessaire
      const isNonIdempotentPost =
        (options.method === 'POST' || (options as any).method === 'POST') &&
        (endpoint.includes('/api/library/uploader/upload-one') ||
          endpoint.includes('/api/library/uploader/generate-screenshots') ||
          endpoint.includes('/api/library/upload-tracker/create-torrent') ||
          endpoint.includes('/api/admin/system/restart'));
      if (retryCount < maxRetries && !isNonIdempotentPost && this.isRetryableError(error)) {
        const delay = Math.min(1000 * Math.pow(2, retryCount), 3000); // Exponential backoff, max 3s
        // Ne pas logger les retries quand le serveur est hors ligne (évite le spam en console)
        const errorInfoForRetry = this.getErrorMessage(error, undefined, endpoint, url);
        if (errorInfoForRetry.code !== 'ConnectionError' && errorInfoForRetry.code !== 'Timeout') {
          console.warn(`[server-api] Erreur réseau récupérable, retry dans ${delay}ms (tentative ${retryCount + 1}/${maxRetries})`);
        }
        await new Promise(resolve => setTimeout(resolve, delay));
        return this.backendRequest<T>(endpoint, options, retryCount + 1, baseUrlOverride);
      }
      
      // Obtenir un message d'erreur clair pour l'utilisateur
      const errorInfo = this.getErrorMessage(error, undefined, endpoint, url);
      // Ne pas polluer la console quand le serveur est simplement hors ligne (comportement attendu)
      const isOffline = errorInfo.code === 'ConnectionError' || errorInfo.code === 'Timeout';
      if (!isOffline) {
        console.error('[server-api] Erreur de connexion:', {
          url,
          endpoint,
          error: error instanceof Error ? error.message : String(error),
          errorCode: errorInfo.code,
        });
      }
      if (isOffline) {
        this.connectionFailureListeners.forEach((cb) => { try { cb(); } catch (_) { /* ignore */ } });
      }
      return {
        success: false,
        error: errorInfo.code,
        message: errorInfo.message,
      };
    }
  }

  /**
   * Requête backend qui retourne un blob (ex. fichier .torrent).
   * Même auth/URL que backendRequest mais réponse binaire.
   */
  async requestBlob(endpoint: string, options: RequestInit = {}): Promise<ApiResponse<Blob>> {
    const base = this.getBackendBaseUrl();
    const url = `${base}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;
    const mixedContentError = this.getMixedContentError(url);
    if (mixedContentError) {
      return { success: false, error: 'MixedContent', message: mixedContentError };
    }
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    };
    if (this.accessToken) (headers as Record<string, string>).Authorization = `Bearer ${this.accessToken}`;
    if (typeof window !== 'undefined' && window.location?.origin) {
      try {
        const requestOrigin = new URL(url).origin;
        if (requestOrigin === window.location.origin) {
          const h = (window.location.hostname || '').toLowerCase();
          const isCloud = h === 'client.popcornn.app' || h.endsWith('.client.popcornn.app');
          (headers as Record<string, string>)['X-Popcorn-Client-Origin'] = isCloud ? 'cloud' : 'local';
        }
      } catch { /* ignore */ }
    }
    try {
      const timeoutMs = this.getTimeoutMs(endpoint);
      const response = await this.nativeFetch(url, { ...options, headers }, timeoutMs);
      if (!response.ok) {
        const text = await response.text();
        let errorMessage = `Erreur ${response.status}`;
        try {
          const data = JSON.parse(text);
          if (data && typeof data === 'object') {
            if (typeof (data as any).error === 'string') errorMessage = (data as any).error;
            else if (typeof (data as any).message === 'string') errorMessage = (data as any).message;
          }
        } catch { /* use errorMessage */ }
        return { success: false, error: 'BackendError', message: errorMessage };
      }
      const cd = response.headers.get('Content-Disposition');
      let filename: string | undefined;
      if (cd) {
        const m = cd.match(/filename="?([^";\n]+)"?/);
        if (m) filename = m[1].trim();
      }
      const blob = await response.blob();
      this.connectionSuccessListeners.forEach((cb) => { try { cb(); } catch (_) { /* ignore */ } });
      const out: ApiResponse<Blob> & { filename?: string; c411Result?: { success: boolean; message: string; torrentUrl?: string } } = {
        success: true,
        data: blob,
        filename,
      };
      const c411Upload = response.headers.get('X-C411-Upload');
      if (c411Upload != null) {
        out.c411Result = {
          success: c411Upload === 'true',
          message: response.headers.get('X-C411-Message') ?? '',
          torrentUrl: response.headers.get('X-C411-Torrent-URL') ?? undefined,
        };
      }
      return out;
    } catch (error) {
      const err = error instanceof Error ? error.message : String(error);
      return { success: false, error: 'NetworkError', message: err };
    }
  }

  private getTimeoutMs(endpoint: string): number {
    // Valeurs conservatrices pour éviter les "spinners infinis"
    if (endpoint.includes('/torrents/magnet')) return 60000;
    // Augmenter le timeout pour /api/torrents/list car le mapping peut prendre du temps
    if (endpoint.includes('/api/torrents/list')) return 60000; // 60 secondes pour les listes de torrents
    if (endpoint.includes('/api/media/') || endpoint.includes('/api/torrents/')) return 30000;
    // Le setup peut impliquer des écritures DB + détection/validation indexer -> parfois lent
    if (endpoint.startsWith('/api/v1/setup/')) return 60000;
    if (endpoint.startsWith('/api/v1/sync/')) return 60000;
    // Test d'indexer : peut prendre du temps (plusieurs requêtes + tests téléchargement + RSS)
    if (endpoint.includes('/api/indexers/test')) return 60000; // 60 secondes pour les tests d'indexers (test et test-stream)
    // Création .torrent et publication C411 : lecture + hash du fichier peut être long (gros médias, chemins réseau / NAS)
    if (endpoint.includes('/api/library/upload-tracker/create-torrent') || endpoint.includes('/api/library/upload-tracker/publish-c411')) {
      return 300000; // 5 minutes (fichiers sur NAS/réseau = très lent)
    }
    // Upload one (P-upload) : création .torrent + envoi trackers, peut être très long (hash de gros fichiers)
    if (endpoint.includes('/api/library/uploader/upload-one')) {
      return 1800000; // 30 minutes (hash sur gros fichiers / NAS peut dépasser 5 min)
    }
    // Prévisualisation NFO/description (peut inclure ffprobe → lent)
    if (endpoint.includes('/api/library/uploader/preview')) {
      return 60000; // 1 minute
    }
    if (endpoint.includes('/api/library/uploader/validate-media')) {
      return 120000; // 2 minutes
    }
    if (endpoint.includes('/api/library/uploader/generate-screenshots')) {
      return 120000; // 2 minutes (FFmpeg sur NAS/volume réseau peut être lent)
    }
    // Health checks : timeout plus long sur Android pour gérer les réseaux lents
    if (endpoint.includes('/health') || endpoint.includes('/api/client/health')) {
      const isAndroid = typeof window !== 'undefined' && /Android/i.test(navigator.userAgent || '');
      return isAndroid ? 10000 : 5000; // 10 secondes sur Android, 5 secondes ailleurs
    }
    return 15000;
  }

  /**
   * Enregistre un callback appelé à chaque échec de requête pour cause de serveur hors ligne (ConnectionError/Timeout).
   * Permet au store UI de remonter l'état "serveur hors ligne" sans dépendance circulaire.
   */
  addConnectionFailureListener(cb: ConnectionFailureListener): void {
    this.connectionFailureListeners.push(cb);
  }

  /**
   * Enregistre un callback appelé à chaque requête backend réussie (réponse 2xx).
   * Permet au store de repasser en "online" après avoir été marqué "offline".
   */
  addConnectionSuccessListener(cb: ConnectionSuccessListener): void {
    this.connectionSuccessListeners.push(cb);
  }

  /**
   * Télécharge le journal de la synchronisation (en cours ou dernière exécution) en fichier .txt.
   */
  async downloadSyncLog(): Promise<ApiResponse<void>> {
    if (typeof window === 'undefined') {
      return { success: false, error: 'Unavailable', message: 'Disponible uniquement côté client.' };
    }
    const base = this.getBackendBaseUrl();
    const url = `${base}/api/sync/log`;
    this.loadTokens();
    const headers: Record<string, string> = {};
    if (this.accessToken) headers.Authorization = `Bearer ${this.accessToken}`;
    try {
      const response = await this.nativeFetch(url, { method: 'GET', headers }, 30000);
      if (!response.ok) {
        const text = await response.text().catch(() => '');
        return {
          success: false,
          error: 'BackendError',
          message: text || `Erreur ${response.status}`,
        };
      }
      const blob = await response.blob();
      const disposition = response.headers.get('Content-Disposition');
      let filename = 'sync-log.txt';
      if (disposition) {
        const match = /filename="?([^";\n]+)"?/.exec(disposition);
        if (match) filename = match[1].trim();
      }
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objectUrl;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(objectUrl);
      return { success: true, data: undefined };
    } catch (error) {
      return {
        success: false,
        error: 'NetworkError',
        message: error instanceof Error ? error.message : 'Erreur lors du téléchargement du journal.',
      };
    }
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
   * 
   * ⚠️ Cette méthode ne doit être appelée que côté client (navigateur/Tauri)
   * Ne pas appeler en SSR (Server-Side Rendering)
   */
  private async generateClientTokens(userId: string, username: string): Promise<{ accessToken: string; refreshToken: string }> {
    // Vérifier qu'on est dans un contexte client (pas SSR)
    if (typeof window === 'undefined') {
      throw new Error(
        'generateClientTokens can only be called in a client context (browser or Tauri). ' +
        'It cannot be called during SSR. ' +
        'Make sure this code is only executed in client-side components or use client:only directive in Astro.'
      );
    }
    
    try {
      const accessToken = await generateAccessToken({ userId, username });
      const refreshToken = await generateRefreshToken({ userId, username });
      return { accessToken, refreshToken };
    } catch (error) {
      // Améliorer le message d'erreur si c'est une erreur Web Crypto API
      if (error instanceof Error && error.message.includes('Web Crypto API')) {
        // Le message d'erreur de generateAccessToken contient déjà les solutions détaillées
        // On propage simplement l'erreur avec un préfixe clair
        throw new Error(`Erreur de génération de tokens JWT: ${error.message}`);
      }
      throw error;
    }
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

  async getScrubThumbnailsMeta(localMediaId: string) {
    const baseUrl = this.getServerUrl();
    const url = `${baseUrl}/api/library/scrub-thumbnails/meta/${encodeURIComponent(localMediaId)}`;
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Failed to fetch scrub thumbnails meta (${res.status})`);
    }
    return res.json();
  }

  async generateScrubThumbnails(localMediaId: string, opts?: { force?: boolean }) {
    const baseUrl = this.getServerUrl();
    const url = `${baseUrl}/api/library/scrub-thumbnails/generate`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ local_media_id: localMediaId, force: opts?.force === true }),
    });
    if (!res.ok) {
      throw new Error(`Failed to trigger scrub thumbnails generation (${res.status})`);
    }
    return res.json();
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
    window.dispatchEvent(new Event('popcorn-auth-changed'));
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
    const mixedContentError = this.getMixedContentError(url);
    if (mixedContentError) {
      return {
        success: false,
        error: 'MixedContent',
        message: mixedContentError,
      };
    }
    
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

      // Si 401 sur un endpoint protégé alors qu'on avait un token → session invalide (backend reboot, token expiré, etc.)
      // On vide la session et on signale pour redirection vers /login
      if (!isAuthBootstrapEndpoint && response.status === 401 && this.accessToken) {
        this.clearTokens();
        this.saveUser(null);
        this.accessToken = null;
        this.refreshToken = null;
        if (typeof window !== 'undefined') {
          try {
            window.dispatchEvent(new CustomEvent('popcorn:session-expired'));
          } catch {
            // ignore
          }
        }
      }

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
    // Gérer la double imbrication : si data.data existe et contient success, utiliser data.data
    // Sinon, utiliser data directement
    let responseData = data.data || data;
    
    // Si responseData contient success et data, c'est une double imbrication
    if (responseData && typeof responseData === 'object' && 'success' in responseData && 'data' in responseData) {
      responseData = responseData.data || responseData;
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

  // Two-Factor Authentication methods
  getTwoFactorStatus(): Promise<ApiResponse<{ enabled: boolean }>>;
  enableTwoFactor(): Promise<ApiResponse<{ message: string }>>;
  disableTwoFactor(): Promise<ApiResponse<{ message: string }>>;
  sendTwoFactorCode(): Promise<ApiResponse<{ message: string; expiresAt?: number }>>;
  verifyTwoFactorCode(tempToken: string, code: string): Promise<ApiResponse<{
    user: { id: string; email: string };
    accessToken: string;
    refreshToken: string;
    jwtSecret?: string;
  }>>;

  // Quick Connect methods
  initQuickConnect(): Promise<ApiResponse<{ code: string; secret: string; expiresAt: number }>>;
  authorizeQuickConnect(code: string): Promise<ApiResponse<{ message: string; secret?: string }>>;
  getQuickConnectStatus(secret: string): Promise<ApiResponse<{
    status: 'pending' | 'authorized' | 'used' | 'expired';
    authorized: boolean;
    userId?: string;
  }>>;
  connectQuickConnect(secret: string): Promise<ApiResponse<{
    user: { id: string; email: string };
    accessToken: string;
    refreshToken: string;
    jwtSecret?: string;
    backendUrl?: string; // URL du backend récupérée depuis le cloud
  }>>;

  // Media methods
  search(params: SearchParams): Promise<ApiResponse<SearchResult[]>>;
  getTorrentGroup(slug: string): Promise<ApiResponse<any>>;
  getTorrentGroupByTmdbId(tmdbId: number, title?: string): Promise<ApiResponse<any>>;
  getTorrentById(id: string): Promise<ApiResponse<any>>;
  getStream(contentId: string): Promise<ApiResponse<StreamResponse>>;

  // Library methods
  getLibrary(): Promise<ApiResponse<LibraryItem[]>>;
  getLibraryFromBaseUrl(baseUrl: string): Promise<ApiResponse<LibraryItem[]>>;
  getLibrarySyncStatusFromBaseUrl(baseUrl: string): Promise<ApiResponse<{ sync_in_progress: boolean; scanning_source_id?: string }>>;
  addToLibrary(contentId: string, title: string, type: 'movie' | 'tv', encryptedData?: string): Promise<ApiResponse<LibraryItem>>;
  removeFromLibrary(libraryId: string): Promise<ApiResponse<void>>;
  getFavorites(): Promise<ApiResponse<LibraryItem[]>>;
  addFavorite(contentId: string, encryptedData?: string): Promise<ApiResponse<LibraryItem>>;
  removeFavorite(favoriteId: string): Promise<ApiResponse<void>>;
  scanLocalMedia(): Promise<ApiResponse<string>>;
  findLocalMediaByInfoHash(infoHash: string): Promise<ApiResponse<any>>;

  // Connection status (pour remonter "serveur hors ligne" dans l'UI)
  addConnectionFailureListener(cb: ConnectionFailureListener): void;
  addConnectionSuccessListener(cb: ConnectionSuccessListener): void;

  // Health methods
  checkServerHealth(): Promise<ApiResponse<{ status: string }>>;
  getSetupStatus(): Promise<ApiResponse<SetupStatus>>;
  getStorageStats(): Promise<ApiResponse<{ used_bytes: number; total_bytes?: number; available_bytes?: number; storage_retention_days?: number }>>;
  patchStorageRetention(storageRetentionDays: number | null): Promise<ApiResponse<{ used_bytes: number; total_bytes?: number; available_bytes?: number; storage_retention_days?: number }>>;

  // Indexers methods
  getIndexers(): Promise<ApiResponse<Indexer[]>>;
  getIndexerTypes(): Promise<ApiResponse<IndexerTypeInfo[]>>;
  createIndexer(data: IndexerFormData): Promise<ApiResponse<Indexer>>;
  updateIndexer(id: string, data: Partial<IndexerFormData>): Promise<ApiResponse<Indexer>>;
  deleteIndexer(id: string): Promise<ApiResponse<void>>;
  getIndexerCategories(indexerId: string): Promise<ApiResponse<Record<string, { enabled: boolean; genres?: number[] }>>>;
  updateIndexerCategories(indexerId: string, categories: string[] | Record<string, { enabled: boolean; genres?: number[] }>): Promise<ApiResponse<void>>;
  getIndexerAvailableCategories(indexerId: string): Promise<ApiResponse<Array<{ id: string; name: string; description?: string }>>>;
  getTmdbGenres(): Promise<ApiResponse<{ movies: Array<{ id: number; name: string }>; tv: Array<{ id: number; name: string }> }>>;
  testIndexer(id: string): Promise<ApiResponse<any>>;
  testIndexerStream(id: string, onProgress?: (event: { type: string; query?: string; index?: number; total?: number; count?: number; success?: boolean; error?: string }) => void): Promise<ApiResponse<any>>;

  // Settings methods
  getTmdbKey(): Promise<ApiResponse<{ apiKey: string | null; hasKey: boolean }>>;
  getTmdbKeyExport(): Promise<ApiResponse<{ apiKey: string | null; hasKey: boolean }>>;
  saveTmdbKey(key: string): Promise<ApiResponse<void>>;
  deleteTmdbKey(): Promise<ApiResponse<void>>;
  testTmdbKey(): Promise<ApiResponse<{ valid: boolean; message?: string }>>;
  getClientTorrentConfig(): Promise<ApiResponse<any>>;
  updateClientTorrentListenPort(port: number): Promise<ApiResponse<{ listen_port: number }>>;
  getRatioConfig(): Promise<ApiResponse<{ mode_enabled: boolean; source: string }>>;
  getSeedingDiagnostic(): Promise<ApiResponse<{ upnp_enabled: boolean; ratio_mode_enabled: boolean; librqbit_ok: boolean; listen_port: number | null }>>;
  updateRatioConfig(mode_enabled: boolean): Promise<ApiResponse<{ mode_enabled: boolean; source: string }>>;
  getRatioStats(): Promise<ApiResponse<{
    total_uploaded_bytes: number;
    total_downloaded_bytes: number;
    ratio: number;
    torrent_count: number;
    seeding_count: number;
    torrents: Array<{ info_hash: string; name: string; state: string; progress: number; uploaded_bytes: number; downloaded_bytes: number; ratio: number }>;
  }>>;
  getRatioTorrentTrackers(infoHash: string): Promise<ApiResponse<{ tracker_urls: string[] }>>;
  postRatioTest(): Promise<ApiResponse<{ mode_enabled: boolean; librqbit_ok: boolean; torrent_count: number; message: string }>>;
  postRatioTestSeed(options?: { tracker_url?: string; uploaded_mb?: number; info_hash?: string }): Promise<ApiResponse<{ success: boolean; tracker_url: string; uploaded_bytes: number; response_status: number; message: string }>>;
  getMediaPaths(): Promise<ApiResponse<{ download_dir_root: string; films_path: string | null; series_path: string | null; default_path: string | null; films_root: string; series_root: string }>>;
  putMediaPaths(body: { films_path?: string | null; series_path?: string | null; default_path?: string | null }): Promise<ApiResponse<{ download_dir_root: string; films_path: string | null; series_path: string | null; default_path: string | null; films_root: string; series_root: string }>>;
  listExplorerFiles(path?: string): Promise<ApiResponse<Array<{ name: string; path: string; is_directory: boolean; size?: number; modified?: number }>>>;
  listLibrarySourceExplorerFiles(path?: string): Promise<ApiResponse<Array<{ name: string; path: string; is_directory: boolean; size?: number; modified?: number }>>>;
  setLibrarySourceEnabled(id: string, is_enabled: boolean): Promise<ApiResponse<void>>;
  getLibraryMedia(): Promise<ApiResponse<LibraryMediaEntry[]>>;
  updateLibraryMedia(id: string, file_path: string): Promise<ApiResponse<LibraryMediaEntry>>;
  deleteLibraryMedia(id: string): Promise<ApiResponse<void>>;
  deleteLibraryMediaFile(id: string): Promise<ApiResponse<void>>;
  createTorrentForLibraryMedia(params: CreateTorrentParams): Promise<ApiResponse<void>>;
  publishC411(params: PublishC411Params): Promise<ApiResponse<PublishC411Response>>;
  getC411UploadCookies(): Promise<ApiResponse<C411UploadCookiesResponse>>;
  putC411UploadCookies(body: { raw_cookie?: string; session_cookie?: string; csrf_cookie?: string; passkey?: string; api_key?: string }): Promise<ApiResponse<void>>;
  publishC411Batch(params: { announce_url: string; local_media_ids?: string[] }, onEvent: (event: C411BatchEvent) => void): Promise<ApiResponse<void>>;
  uploadLibraryMedia(params: {
    local_media_id: string;
    trackers: string[];
    piece_size_override?: number;
    screenshot_base_url?: string;
    signal?: AbortSignal;
  }): Promise<ApiResponse<MultiTrackerUploadResult>>;
  getTorrentProgress(localMediaId: string): Promise<ApiResponse<{ progress?: number | null }>>;
  getActiveTorrentCreations(): Promise<ApiResponse<ActiveTorrentCreationEntry[]>>;
  cancelTorrentCreation(localMediaId: string): Promise<ApiResponse<CancelTorrentCreationResponse>>;
  validateUploadMedia(localMediaId: string): Promise<ApiResponse<UploadMediaValidationResponse>>;
  getPublishedUploads(): Promise<ApiResponse<PublishedUploadMediaEntry[]>>;
  clearFailedUploads(): Promise<ApiResponse<{ deleted: number }>>;
  generateScreenshots(localMediaId: string): Promise<ApiResponse<{ count: number; screenshot_base_url: string }>>;
  checkDuplicateOnIndexer(params: { indexer_id: string; local_media_ids: string[] }): Promise<ApiResponse<CheckDuplicateResponse>>;
  getUploadPreview(localMediaId: string, tracker?: string, screenshotBaseUrl?: string): Promise<ApiResponse<UploaderPreviewResponse>>;
  getTorrentFilesForReseed(): Promise<ApiResponse<import('./server-api/upload-tracker.js').ReseedTorrentInfo[]>>;
  downloadTorrentFileForReseed(infoHash: string): Promise<ApiResponse<Blob> & { filename?: string }>;

  // Sync methods
  getSyncStatus(): Promise<ApiResponse<any>>;
  startSync(indexerIds?: string | string[]): Promise<ApiResponse<string>>;
  stopSync(): Promise<ApiResponse<void>>;
  getSyncSettings(): Promise<ApiResponse<any>>;
  updateSyncSettings(settings: any): Promise<ApiResponse<void>>;
  clearSyncTorrents(): Promise<ApiResponse<number>>;
  downloadSyncLog(): Promise<ApiResponse<void>>;
  getSyncHistory(limit?: number): Promise<ApiResponse<import('./client/server-api/sync.js').SyncHistoryEntry[]>>;
  addSyncHistory(entry: Omit<import('./client/server-api/sync.js').SyncHistoryEntry, 'id'>): Promise<ApiResponse<import('./client/server-api/sync.js').SyncHistoryEntry>>;

  // System methods
  resetBackendDatabase(): Promise<ApiResponse<void>>;
  forceCacheCleanup(): Promise<ApiResponse<{ cleaned_count: number }>>;
  getTranscodingConfig(): Promise<ApiResponse<{ max_concurrent_transcodings: number }>>;
  updateTranscodingConfig(body: {
    max_concurrent_transcodings: number;
  }): Promise<ApiResponse<{ max_concurrent_transcodings: number }>>;
  getSystemResources(): Promise<
    ApiResponse<{
      process_memory_mb: number;
      process_cpu_usage_percent: number;
      system_memory_total_mb: number | null;
      system_memory_used_mb: number | null;
      gpu_available: boolean;
      hwaccels: string[];
    }>
  >;
  getServerLogs(params?: { limit?: number }): Promise<ApiResponse<{ lines: string[] }>>;
  restartBackend(): Promise<ApiResponse<{ will_exit: boolean }>>;

  // Dashboard methods
  getDashboardData(): Promise<ApiResponse<DashboardData>>;
  getDashboardDataPhase1(language?: string, options?: object): Promise<ApiResponse<DashboardData>>;
  getDashboardDataPhase2(
    language?: string,
    options?: object & { popularMovieIds?: string[]; popularSeriesIds?: string[] }
  ): Promise<ApiResponse<{ recentAdditions: ContentItem[]; fastTorrents: ContentItem[] }>>;
  getFilmsData(): Promise<ApiResponse<FilmData[]>>;
  getSeriesData(): Promise<ApiResponse<SeriesData[]>>;

  // Local Users methods
  createLocalUser(request: { cloud_account_id: string; email: string; password_hash: string; display_name?: string }): Promise<ApiResponse<{ id: string; cloud_account_id: string; email: string; display_name: string | null; is_active: boolean; email_verified: boolean; created_at: number; updated_at: number }>>;
  listLocalUsers(cloudAccountId: string): Promise<ApiResponse<Array<{ id: string; cloud_account_id: string; email: string; display_name: string | null; is_active: boolean; email_verified: boolean; created_at: number; updated_at: number }>>>;
  getLocalUser(userId: string): Promise<ApiResponse<{ id: string; cloud_account_id: string; email: string; display_name: string | null; is_active: boolean; email_verified: boolean; created_at: number; updated_at: number }>>;
  updateLocalUser(userId: string, displayName?: string): Promise<ApiResponse<{ id: string; cloud_account_id: string; email: string; display_name: string | null; is_active: boolean; email_verified: boolean; created_at: number; updated_at: number }>>;
  deleteLocalUser(userId: string): Promise<ApiResponse<void>>;

  // Friends methods (backend)
  syncFriendShares(payload: { replace_all: boolean; friends: Array<{ local_user_id: string; share_type: 'none' | 'all' | 'selected'; media_ids?: string[] }> }): Promise<ApiResponse<string>>;

  // Favoris / à regarder plus tard (sync cloud)
  listMediaFavorites(params?: { limit?: number; offset?: number }): Promise<ApiResponse<import('./server-api/requests.js').MediaFavorite[]>>;
  addMediaFavorite(data: { tmdb_id: number; tmdb_type: string; category: string }): Promise<ApiResponse<import('./server-api/requests.js').MediaFavorite>>;
  removeMediaFavorite(tmdbId: number, tmdbType: string): Promise<ApiResponse<boolean>>;
  checkMediaFavorite(tmdbId: number, tmdbType: string): Promise<ApiResponse<{ is_favorite: boolean }>>;
}

// Fusionner les types pour que ServerApiClient ait toutes les méthodes publiques
type ServerApiClientComplete = ServerApiClient & IServerApiClientPublic;

// Assembler les méthodes des modules
Object.assign(ServerApiClient.prototype, 
  authMethods,
  mediaMethods,
  libraryMethods,
  localMediaMethods,
  uploadTrackerMethods,
  healthMethods,
  indexersMethods,
  settingsMethods,
  syncMethods,
  dashboardMethods,
  twoFactorMethods,
  quickConnectMethods,
  localUsersMethods,
  friendsMethods,
  requestsMethods,
  systemMethods
);

// Augmenter le type ServerApiClient pour inclure toutes les méthodes publiques
// Cela permet à TypeScript de reconnaître les méthodes ajoutées via Object.assign
interface ServerApiClient extends IServerApiClientPublic {}

// Instance réelle (utilisée quand isDemoMode() est false)
const realServerApi = new ServerApiClient() as ServerApiClientComplete;

/**
 * En mode démo, les appels API sont délégués à un client simulé (données en mémoire).
 * Sinon, on utilise le client réel (backend Rust).
 */
export const serverApi = new Proxy(realServerApi, {
  get(target, prop, receiver) {
    if (typeof window !== 'undefined' && isDemoMode()) {
      const demo = getDemoServerApi();
      const val = (demo as Record<string | symbol, unknown>)[prop];
      if (val !== undefined) {
        if (typeof val === 'function') {
          return (val as (...args: unknown[]) => unknown).bind(demo);
        }
        return val;
      }
    }
    return Reflect.get(target, prop, receiver);
  },
}) as ServerApiClientComplete;
