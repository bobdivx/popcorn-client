/**
 * Classe de base pour ServerApiClient
 * Gère la plomberie réseau, l'authentification et les utilitaires
 */

import type { ApiResponse, AuthResponse } from './types.js';
import { getBackendUrl } from '../../backend-config.js';
import { isTauri } from '../../utils/tauri.js';
// Utiliser la version client compatible navigateur pour JWT
import { generateAccessToken, generateRefreshToken } from '../../auth/jwt-client.js';

/** Callbacks appelés quand une requête échoue avec ConnectionError/Timeout (serveur hors ligne). Utilisé par le store pour remonter l'état dans l'UI. */
export type ConnectionFailureListener = () => void;

/** Callbacks appelés quand une requête backend réussit (2xx). Permet au store de repasser en "online" après un offline. */
export type ConnectionSuccessListener = () => void;

export class ServerApiClientBase {
  protected baseUrl: string;
  protected accessToken: string | null = null;
  protected refreshToken: string | null = null;
  protected static readonly STORAGE_USER_KEY = 'popcorn_user';
  protected connectionFailureListeners: ConnectionFailureListener[] = [];
  protected connectionSuccessListeners: ConnectionSuccessListener[] = [];

  constructor(baseUrl?: string) {
    this.baseUrl = '';
    if (baseUrl && baseUrl.trim() && baseUrl !== 'undefined') {
      this.baseUrl = baseUrl.trim();
    }
  }

  protected getBackendBaseUrl(): string {
    const raw = getBackendUrl();
    return (raw || 'http://127.0.0.1:3000').trim().replace(/\/$/, '');
  }

  /**
   * Effectue une requête fetch native (compatible Tauri/Android/Web)
   */
  protected async nativeFetch(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
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
      return response;
    } catch (fetchError) {
      fetchStandardError = fetchError;
      if (!isTauri()) {
        throw fetchError;
      }
      const isAbortError = fetchError instanceof Error && fetchError.name === 'AbortError';
      if (isAbortError) {
        throw fetchError;
      }
    } finally {
      clearTimeout(timeoutId);
      timeoutController.signal.removeEventListener('abort', onTimeoutAbort);
      if (externalSignal) {
        externalSignal.removeEventListener('abort', onExternalAbort);
      }
    }

    if (isTauri() && fetchStandardError) {
      const logNative = async (message: string) => {
        try {
          const { invoke } = await import('@tauri-apps/api/core');
          await invoke('log-message', { message });
        } catch { /* ignore */ }
      };

      const method = (init as any)?.method && typeof (init as any).method === 'string' ? (init as any).method : 'GET';
      const headerPairs: Array<[string, string]> = [];
      try {
        const h = (init as any)?.headers;
        if (h) {
          const headersObj = new Headers(h as any);
          headersObj.forEach((value, key) => headerPairs.push([key, value]));
        }
      } catch { /* ignore */ }

      const body = typeof (init as any)?.body === 'string' || (init as any)?.body instanceof String
          ? String((init as any).body) : undefined;

      const usePluginHttpFallback = async (): Promise<Response | null> => {
        try {
          const { fetch: httpFetch } = await import('@tauri-apps/plugin-http');
          const httpResponse = await httpFetch(url, {
            method: method as any,
            headers: Object.fromEntries(headerPairs),
            body: body,
          } as any);
          
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
          return null;
        }
      };

      try {
        const { invoke } = await import('@tauri-apps/api/core');
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
        } catch { /* ignore */ }

        return new Response(res?.body ?? '', { status: res?.status ?? 0, headers: outHeaders });
      } catch (e) {
        const errorMsg = e instanceof Error ? e.message : String(e);
        const errorStr = errorMsg.toLowerCase();
        const errorName = e instanceof Error ? e.name : '';
        
        const isCommandNotFound = 
          errorStr.includes('not found') || 
          errorStr.includes('command') && (errorStr.includes('native-fetch') || errorStr.includes('not found')) ||
          errorStr.includes('unknown command') ||
          errorStr.includes('command not found') ||
          errorName === 'CommandNotFound' ||
          errorName === 'TauriError' && errorStr.includes('not found');
        
        let pluginHttpResult: Response | null = null;
        if (isCommandNotFound) {
          pluginHttpResult = await usePluginHttpFallback();
        } else {
          try {
            const { invoke: invokeCheck } = await import('@tauri-apps/api/core');
            const platform = await invokeCheck('get-platform').catch(() => 'unknown');
            if (platform === 'android') {
              pluginHttpResult = await usePluginHttpFallback();
            }
          } catch { /* ignore */ }
        }
        
        if (pluginHttpResult !== null) return pluginHttpResult;
        throw fetchStandardError;
      }
    }
    
    throw new Error('Unreachable code in nativeFetch');
  }

  protected saveUser(user: any): void {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(ServerApiClientBase.STORAGE_USER_KEY, JSON.stringify(user || null));
    } catch { /* ignore */ }
  }

  protected getUser(): any | null {
    if (typeof window === 'undefined') return null;
    try {
      const raw = localStorage.getItem(ServerApiClientBase.STORAGE_USER_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  }

  protected getCurrentUserId(): string | null {
    const u = this.getUser();
    const id = u?.id || u?.user?.id;
    return typeof id === 'string' && id.trim() ? id : null;
  }

  protected isRetryableError(error: unknown, response?: Response): boolean {
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
      if (error.name === 'AbortError' || msg.includes('timeout')) {
        return true;
      }
    }
    if (response && response.status >= 500 && response.status < 600) {
      return true;
    }
    return false;
  }

  protected getMixedContentError(url: string): string | null {
    if (typeof window === 'undefined') return null;
    if (window.location.protocol !== 'https:') return null;
    try {
      const urlObj = new URL(url, window.location.origin);
      if (urlObj.protocol !== 'http:') return null;
      const host = urlObj.hostname.toLowerCase();
      const isLocalhost = host === 'localhost' || host === '127.0.0.1' || host === '::1' || host.endsWith('.localhost');
      if (isLocalhost) return null;
      return 'Le site est en HTTPS et le backend est en HTTP. Le navigateur bloque cette requête (Mixed Content). Configure un backend HTTPS (reverse proxy) ou utilise une URL backend HTTPS.';
    } catch { return null; }
  }

  protected getErrorMessage(error: unknown, response?: Response, endpoint?: string, url?: string): { code: string; message: string } {
    if (error instanceof Error && error.name === 'AbortError') {
      const urlInfo = url ? `\n\nURL utilisée: ${url}` : '';
      return {
        code: 'Timeout',
        message: `Le backend ne répond pas. Vérifiez que le serveur est démarré et accessible.${urlInfo}`,
      };
    }
    
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
        return { code: 'ConnectionError', message };
      }
    }
    
    if (response) {
      if (response.status === 401) return { code: 'Unauthorized', message: 'Authentification requise. Veuillez vous connecter.' };
      if (response.status === 403) return { code: 'Forbidden', message: 'Accès refusé. Vous n\'avez pas les permissions nécessaires.' };
      if (response.status === 404) return { code: 'NotFound', message: 'Ressource non trouvée sur le serveur.' };
      if (response.status >= 500) return { code: 'ServerError', message: 'Erreur serveur. Veuillez réessayer dans quelques instants.' };
    }
    
    return { code: 'NetworkError', message: error instanceof Error ? error.message : 'Erreur réseau inconnue.' };
  }

  protected async backendRequest<T>(endpoint: string, options: RequestInit = {}, retryCount = 0, baseUrlOverride?: string): Promise<ApiResponse<T>> {
    const base = baseUrlOverride ?? this.getBackendBaseUrl();
    let finalEndpoint = endpoint;
    if (endpoint.includes('/api/torrents/list') || endpoint.includes('/api/torrents/fast')) {
      const uid = this.getCurrentUserId();
      if (uid) {
        finalEndpoint += (endpoint.includes('?') ? '&' : '?') + 'user_id=' + encodeURIComponent(uid);
      }
    }
    const url = `${base}${finalEndpoint.startsWith('/') ? '' : '/'}${finalEndpoint}`;
    const maxRetries = 2;
    
    const mixedContentError = this.getMixedContentError(url);
    if (mixedContentError) return { success: false, error: 'MixedContent', message: mixedContentError };

    const isFormData = typeof FormData !== 'undefined' && options.body != null && options.body instanceof FormData;
    const headers: HeadersInit = {
      ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
      ...(options.headers || {}),
    };
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

    const noCache = (options.method === 'GET' || !options.method) &&
      (endpoint.includes('/api/torrents/list') || endpoint.includes('/api/torrents/fast') || endpoint.includes('/api/sync/status'));
    const fetchOptions = noCache ? { ...options, headers, cache: 'no-store' as RequestCache } : { ...options, headers };

    try {
      const timeoutMs = this.getTimeoutMs(endpoint);
      const response = await this.nativeFetch(url, fetchOptions, timeoutMs);
      const data = await response.json().catch(() => ({}));
      
      if (!response.ok) {
        const isNonIdempotentPost = (options.method === 'POST' || (options as any).method === 'POST') &&
          (endpoint.includes('/api/library/uploader/upload-one') || endpoint.includes('/api/library/uploader/generate-screenshots') ||
            endpoint.includes('/api/library/upload-tracker/create-torrent') || endpoint.includes('/api/admin/system/restart') ||
            endpoint.includes('/bulk-torrent-zip/import'));
        
        if (retryCount < maxRetries && !isNonIdempotentPost && this.isRetryableError(null, response)) {
          const delay = Math.min(1000 * Math.pow(2, retryCount), 3000);
          await new Promise(resolve => setTimeout(resolve, delay));
          return this.backendRequest<T>(endpoint, options, retryCount + 1, baseUrlOverride);
        }
        
        let errorMessage = `Erreur ${response.status}`;
        let errorCode = response.status === 404 ? 'NotFound' : 'BackendError';
        if (data && typeof data === 'object') {
          if ((data as any).error && typeof (data as any).error === 'string') {
            errorMessage = (data as any).error;
            errorCode = (data as any).error.includes('mot de passe') ? 'InvalidCredentials' : 'BackendError';
          } else if ((data as any).message && typeof (data as any).message === 'string') {
            errorMessage = (data as any).message;
          } else if ((data as any).detail && typeof (data as any).detail === 'string') {
            errorMessage = (data as any).detail;
          }
        }
        return { success: false, error: errorCode, message: errorMessage };
      }

      this.connectionSuccessListeners.forEach((cb) => { try { cb(); } catch (_) { /* ignore */ } });
      return {
        success: true,
        data: (data && typeof data === 'object' && 'data' in data ? (data as any).data : data) as T,
      };
    } catch (error) {
      if (options.signal?.aborted && error instanceof Error && error.name === 'AbortError') {
        return { success: false, error: 'Aborted', message: 'Requête annulée.' };
      }
      const isNonIdempotentPost = (options.method === 'POST' || (options as any).method === 'POST') &&
        (endpoint.includes('/api/library/uploader/upload-one') || endpoint.includes('/api/library/uploader/generate-screenshots') ||
          endpoint.includes('/api/library/upload-tracker/create-torrent') || endpoint.includes('/api/admin/system/restart') ||
          endpoint.includes('/bulk-torrent-zip/import'));
      
      if (retryCount < maxRetries && !isNonIdempotentPost && this.isRetryableError(error)) {
        const delay = Math.min(1000 * Math.pow(2, retryCount), 3000);
        await new Promise(resolve => setTimeout(resolve, delay));
        return this.backendRequest<T>(endpoint, options, retryCount + 1, baseUrlOverride);
      }
      
      const errorInfo = this.getErrorMessage(error, undefined, endpoint, url);
      const isOffline = errorInfo.code === 'ConnectionError' || errorInfo.code === 'Timeout';
      if (isOffline) {
        this.connectionFailureListeners.forEach((cb) => { try { cb(); } catch (_) { /* ignore */ } });
      }
      return { success: false, error: errorInfo.code, message: errorInfo.message };
    }
  }

  async requestBlob(endpoint: string, options: RequestInit = {}): Promise<ApiResponse<Blob>> {
    const base = this.getBackendBaseUrl();
    const url = `${base}${endpoint.startsWith('/') ? '' : '/'}${endpoint}`;
    const mixedContentError = this.getMixedContentError(url);
    if (mixedContentError) return { success: false, error: 'MixedContent', message: mixedContentError };
    const headers: HeadersInit = { 'Content-Type': 'application/json', ...(options.headers || {}) };
    if (this.accessToken) (headers as Record<string, string>).Authorization = `Bearer ${this.accessToken}`;
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
        } catch { /* ignore */ }
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
        success: true, data: blob, filename,
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
      return { success: false, error: 'NetworkError', message: error instanceof Error ? error.message : String(error) };
    }
  }

  protected getTimeoutMs(endpoint: string): number {
    if (endpoint.includes('/torrents/magnet')) return 60000;
    if (endpoint.includes('/api/torrents/list')) return 60000;
    if (endpoint.includes('/api/media/') || endpoint.includes('/api/torrents/')) return 30000;
    if (endpoint.startsWith('/api/v1/setup/')) return 60000;
    if (endpoint.startsWith('/api/v1/sync/')) return 60000;
    if (endpoint.includes('/api/indexers/test')) return 60000;
    if (endpoint.includes('/bulk-torrent-zip/preview')) return 3_600_000;
    if (endpoint.includes('/bulk-torrent-zip/preview-url')) return 3_600_000;
    if (endpoint.includes('/bulk-torrent-zip/import')) return 3_600_000;
    if (endpoint.includes('/api/library/upload-tracker/create-torrent') || endpoint.includes('/api/library/upload-tracker/publish-c411')) return 300000;
    if (endpoint.includes('/api/library/uploader/upload-one')) return 1800000;
    if (endpoint.includes('/api/library/uploader/preview')) return 60000;
    if (endpoint.includes('/api/library/uploader/validate-media')) return 120000;
    if (endpoint.includes('/api/library/uploader/generate-screenshots')) return 120000;
    if (endpoint.includes('/health') || endpoint.includes('/api/client/health')) {
      const isAndroid = typeof window !== 'undefined' && /Android/i.test(navigator.userAgent || '');
      return isAndroid ? 10000 : 5000;
    }
    return 15000;
  }

  addConnectionFailureListener(cb: ConnectionFailureListener): void { this.connectionFailureListeners.push(cb); }
  addConnectionSuccessListener(cb: ConnectionSuccessListener): void { this.connectionSuccessListeners.push(cb); }

  protected async generateClientTokens(userId: string, username: string): Promise<{ accessToken: string; refreshToken: string }> {
    if (typeof window === 'undefined') throw new Error('generateClientTokens can only be called in a client context.');
    try {
      const accessToken = await generateAccessToken({ userId, username });
      const refreshToken = await generateRefreshToken({ userId, username });
      return { accessToken, refreshToken };
    } catch (error) {
      throw new Error(`Erreur de génération de tokens JWT: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  getServerUrl(): string {
    const backend = this.getBackendBaseUrl();
    return backend || 'http://127.0.0.1:3000';
  }

  protected loadTokens(): void {
    if (typeof window === 'undefined') return;
    this.accessToken = localStorage.getItem('access_token');
    this.refreshToken = localStorage.getItem('refresh_token');
  }

  protected saveTokens(accessToken: string, refreshToken: string): void {
    if (typeof window === 'undefined') return;
    localStorage.setItem('access_token', accessToken);
    localStorage.setItem('refresh_token', refreshToken);
    this.accessToken = accessToken;
    this.refreshToken = refreshToken;
    window.dispatchEvent(new Event('popcorn-auth-changed'));
  }

  protected clearTokens(): void {
    if (typeof window === 'undefined') return;
    localStorage.removeItem('access_token');
    localStorage.removeItem('refresh_token');
    this.accessToken = null;
    this.refreshToken = null;
  }

  protected async request<T>(endpoint: string, options: RequestInit = {}): Promise<ApiResponse<T>> {
    const baseUrl = this.getServerUrl();
    const url = `${baseUrl}${endpoint}`;
    const mixedContentError = this.getMixedContentError(url);
    if (mixedContentError) return { success: false, error: 'MixedContent', message: mixedContentError };
    
    if (typeof window !== 'undefined') this.loadTokens();

    const headers: Record<string, string> = { 'Content-Type': 'application/json', ...(options.headers as any) };
    const isAuthBootstrapEndpoint = endpoint.includes('/auth/login') || endpoint.includes('/auth/register');
    if (this.accessToken && !isAuthBootstrapEndpoint) headers.Authorization = `Bearer ${this.accessToken}`;

    try {
      const timeoutMs = this.getTimeoutMs(endpoint);
      const response = await this.nativeFetch(url, { ...options, headers }, timeoutMs);

      if (!isAuthBootstrapEndpoint && response.status === 401 && this.accessToken) {
        this.clearTokens();
        this.saveUser(null);
        if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('popcorn:session-expired'));
      }

      return await this.handleResponse<T>(response);
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') return { success: false, error: 'Timeout', message: 'Timeout: le serveur ne répond pas.' };
      return { success: false, error: 'NetworkError', message: error instanceof Error ? error.message : 'Erreur réseau' };
    }
  }

  protected async handleResponse<T>(response: Response): Promise<ApiResponse<T>> {
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (response.status === 401) {
        const err = data?.error || 'Unauthorized';
        const msg = data?.message || err || 'Non authentifié';
        return { success: false, error: err, message: msg };
      }
      return { success: false, error: data.error || 'UnknownError', message: data.message || `Erreur ${response.status}` };
    }
    let responseData = data.data || data;
    if (responseData && typeof responseData === 'object' && 'success' in responseData && 'data' in responseData) {
      responseData = responseData.data || responseData;
    }
    return { success: true, data: responseData };
  }

  isAuthenticated(): boolean {
    if (typeof window !== 'undefined') this.loadTokens();
    return !!this.accessToken;
  }

  getAccessToken(): string | null {
    if (typeof window !== 'undefined') this.loadTokens();
    return this.accessToken;
  }
}
