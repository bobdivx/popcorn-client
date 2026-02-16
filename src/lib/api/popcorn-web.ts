/**
 * Utilitaires pour appeler l'API popcorn-web
 * popcorn-client et popcorn-server ne doivent JAMAIS accéder directement à Turso
 * Ils doivent passer par les routes API de popcorn-web
 */
import { isTauri } from '../utils/tauri.js';
import { TokenManager } from '../client/storage.js';

const POPCORN_WEB_BASE =
  import.meta.env.PUBLIC_POPCORN_WEB_URL ||
  import.meta.env.POPCORN_WEB_URL ||
  'https://popcorn-web-five.vercel.app';

/**
 * Obtient l'URL de base du site popcorn-web (sans /api/v1).
 * Utilisée pour les liens vers la documentation, la page d'accueil, etc.
 */
export function getPopcornWebBaseUrl(): string {
  return POPCORN_WEB_BASE.replace(/\/$/, '');
}

/**
 * Obtient l'URL de base de l'API popcorn-web
 * URL fixe pointant vers le déploiement Vercel
 */
export function getPopcornWebApiUrl(): string {
  const finalUrl = getPopcornWebBaseUrl() + '/api/v1';
  if (import.meta.env.DEV) {
    console.log('[POPCORN-WEB] URL de l\'API:', finalUrl);
  }
  return finalUrl;
}

async function fetchJsonWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    // Améliorer les messages d'erreur pour les erreurs CORS
    if (error instanceof TypeError && error.message.includes('Failed to fetch')) {
      // Créer une erreur plus descriptive pour CORS
      const corsError = new Error(`CORS bloque l'accès à ${url}. En mode navigateur web, l'accès direct à popcorn-web est bloqué par CORS. En Tauri Android/Desktop, native-fetch contourne CORS.`);
      (corsError as any).isCorsError = true;
      throw corsError;
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

type JsonResult =
  | { ok: true; status: number; data: any }
  | { ok: false; status: number; data: any; rawText?: string };

async function requestJson(
  url: string,
  init: RequestInit,
  timeoutMs: number
): Promise<JsonResult> {
  // Essayer d'abord fetch standard (fonctionne maintenant que CORS est configuré partout)
  try {
    const response = await fetchJsonWithTimeout(url, init, timeoutMs);
    const rawText = await response.text().catch(() => '');
    let data: any = {};
    try {
      data = rawText ? JSON.parse(rawText) : {};
    } catch {
      data = {};
    }

    if (response.ok) return { ok: true, status: response.status, data };
    return { ok: false, status: response.status, data, rawText };
  } catch (error) {
    // Si fetch standard échoue (CORS ou autre), et qu'on est en Tauri, essayer native-fetch
    const isCorsError = error instanceof Error && (
      (error as any).isCorsError ||
      error.message.includes('CORS') ||
      error.message.includes('Failed to fetch') ||
      error.message.includes('Access-Control-Allow-Origin') ||
      error.message.includes('blocked by CORS policy')
    );
    
    // En Tauri, utiliser native-fetch comme fallback si fetch standard échoue
    if (isTauri() && (isCorsError || error instanceof TypeError)) {
      const logNative = async (message: string) => {
        try {
          const { invoke } = await import('@tauri-apps/api/core');
          await invoke('log-message', { message });
        } catch {
          // ignore
        }
      };

      try {
        const { invoke } = await import('@tauri-apps/api/core');

        const method =
          (init as any)?.method && typeof (init as any).method === 'string' ? (init as any).method : 'GET';

        const headerPairs: Array<[string, string]> = [];
        try {
          const headersObj = new Headers((init as any)?.headers as any);
          headersObj.forEach((value, key) => headerPairs.push([key, value]));
        } catch {
          // ignore
        }

        const body =
          typeof (init as any)?.body === 'string' || (init as any)?.body instanceof String
            ? String((init as any).body)
            : undefined;

        let nativeRes: any;
        try {
          nativeRes = await invoke('native-fetch', {
            url,
            method,
            headers: headerPairs,
            body,
            timeoutMs,
          } as any);
        } catch (invokeError) {
          const errorMsg = invokeError instanceof Error ? invokeError.message : String(invokeError);
          // Si native-fetch n'est pas disponible, utiliser plugin-http
          if (errorMsg.includes('not found') || errorMsg.includes('Command native-fetch')) {
            const { fetch: httpFetch } = await import('@tauri-apps/plugin-http');
            const httpResponse = await httpFetch(url, {
              method: method as any,
              headers: Object.fromEntries(headerPairs),
              body: body,
            } as any);
            
            const responseBody = await httpResponse.text();
            return {
              ok: httpResponse.ok,
              status: httpResponse.status,
              data: responseBody ? JSON.parse(responseBody) : {},
              rawText: responseBody,
            };
          }
          throw invokeError;
        }

        const response = new Response(nativeRes?.body ?? '', {
          status: nativeRes?.status ?? 0,
          headers: (() => {
            const h = new Headers();
            try {
              for (const [k, v] of (nativeRes?.headers || []) as Array<[string, string]>) {
                if (k) h.set(k, v);
              }
            } catch {
              // ignore
            }
            return h;
          })(),
        });

        const rawText = await response.text().catch(() => '');
        let data: any = {};
        try {
          data = rawText ? JSON.parse(rawText) : {};
        } catch {
          data = {};
        }

        if (response.ok) return { ok: true, status: response.status, data };
        return { ok: false, status: response.status, data, rawText };
      } catch (e) {
        const eStr = typeof e === 'string' ? e : e instanceof Error ? e.message || '' : String(e);
        await logNative(
          `[popcorn-debug] popcorn-web requestJson fallback failed url=${url} err=${JSON.stringify({
            type: typeof e,
            value: eStr,
          })}`
        );

        // Sur AbortError: simuler "API indisponible"
        if (e instanceof Error && e.name === 'AbortError') {
          return { ok: false, status: 0, data: {}, rawText: 'timeout' };
        }

        // Propager l'erreur
        throw e;
      }
    }
    
    // En mode navigateur web, si CORS bloque encore (ne devrait plus arriver avec CORS configuré)
    if (isCorsError) {
      return { 
        ok: false, 
        status: 0, 
        data: { 
          corsError: true,
          message: 'CORS bloque l\'accès. Vérifiez que popcorn-web a CORS configuré pour cet endpoint.'
        }, 
        rawText: 'CORS_ERROR' 
      };
    }
    
    // Pour les autres erreurs, les propager
    throw error;
  }
}

/**
 * Connecte un utilisateur via l'API popcorn-web
 * @param email Email de l'utilisateur
 * @param password Mot de passe
 * @returns Réponse avec user et tokens, ou null si l'API n'est pas disponible
 * @throws Error si les identifiants sont incorrects ou si une erreur réseau se produit
 */
export async function loginCloud(email: string, password: string): Promise<{
  user: {
    id: string;
    email: string;
    is_admin?: boolean; // Statut admin si disponible
  };
  accessToken: string;
  refreshToken: string;
  jwtSecret?: string;
  requires2FA?: boolean;
  tempToken?: string;
} | null> {
  const apiUrl = getPopcornWebApiUrl();
  const fullUrl = `${apiUrl}/auth/login`;
  
  // Log pour debug
  const isTauriEnv = isTauri();
  console.log('[POPCORN-WEB] Tentative de connexion à:', fullUrl, {
    environment: isTauriEnv ? 'Tauri (Android/Desktop)' : 'Navigateur',
    email: email.substring(0, 3) + '***', // Masquer l'email complet
  });
  
  try {
    const res = await requestJson(
      fullUrl,
      {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, password }),
      },
      10000
    );

    console.log('[POPCORN-WEB] Réponse reçue:', {
      status: res.status,
      ok: res.ok,
      url: fullUrl,
      environment: isTauriEnv ? 'Tauri' : 'Navigateur',
      hasData: !!res.data,
      dataType: typeof res.data,
      dataKeys: res.data ? Object.keys(res.data) : [],
      rawText: res.rawText?.substring(0, 500), // Premiers 500 caractères
    });

    if (!res.ok) {
      // Si l'API n'est pas disponible (erreur serveur)
      if (res.status === 500 || res.status === 503 || res.status === 0) {
        console.error('[POPCORN-WEB] API non disponible:', {
          status: res.status,
          body: res.rawText || res.data,
        });
        return null;
      }
      
      // Pour les erreurs 401 (identifiants incorrects), propager l'erreur
      const errorData = res.data || {};
      
      const errorMessage = errorData.message || `Erreur ${res.status} lors de la connexion`;
      console.error('[POPCORN-WEB] Erreur API:', {
        status: res.status,
        message: errorMessage,
        data: errorData,
      });
      
      // Créer une erreur avec le statut pour que la route puisse la gérer
      const error = new Error(errorMessage) as Error & { status?: number };
      error.status = res.status;
      throw error;
    }

    const data = res.data;
    console.log('[POPCORN-WEB] Données reçues:', { 
      success: data?.success, 
      hasData: !!data?.data,
      dataKeys: data ? Object.keys(data) : [],
      fullData: JSON.stringify(data, null, 2)
    });
    
    // Vérifier si la 2FA est requise
    if (data?.success && data?.requires2FA) {
      return {
        user: { id: '', email: email }, // User sera rempli après vérification 2FA
        accessToken: '',
        refreshToken: '',
        requires2FA: true,
        tempToken: data.data?.tempToken,
      };
    }
    
    if (data?.success && data?.data) {
      const result = {
        user: data.data.user,
        accessToken: data.data.accessToken,
        refreshToken: data.data.refreshToken,
        jwtSecret: data.data.jwtSecret,
      };
      console.log('[POPCORN-WEB] Résultat de connexion:', {
        hasUser: !!result.user,
        hasAccessToken: !!result.accessToken,
        hasRefreshToken: !!result.refreshToken,
        hasJwtSecret: !!result.jwtSecret,
      });
      return result;
    }

    console.error('[POPCORN-WEB] Réponse invalide:', {
      data,
      success: data?.success,
      hasData: !!data?.data,
      dataString: JSON.stringify(data, null, 2)
    });
    throw new Error('Réponse invalide de l\'API');
  } catch (error) {
    // Si c'est un timeout
    if (error instanceof Error && error.name === 'AbortError') {
      console.error('[POPCORN-WEB] Timeout lors de la connexion:', {
        url: fullUrl,
        timeout: '10s',
      });
      return null;
    }
    
    // Si c'est une erreur réseau (fetch failed), retourner null
    if (error instanceof TypeError) {
      console.error('[POPCORN-WEB] Erreur réseau:', {
        message: error.message,
        name: error.name,
        stack: error.stack,
        url: fullUrl,
      });
      return null;
    }
    
    // Si c'est une erreur de connexion (ECONNREFUSED, etc.)
    if (error instanceof Error && (
      error.message.includes('fetch') ||
      error.message.includes('network') ||
      error.message.includes('ECONNREFUSED') ||
      error.message.includes('Failed to fetch') ||
      error.message.includes('ENOTFOUND') ||
      error.message.includes('ECONNRESET')
    )) {
      console.error('[POPCORN-WEB] Erreur de connexion réseau:', {
        message: error.message,
        name: error.name,
        url: fullUrl,
      });
      return null;
    }
    
    // Pour les autres erreurs (401, etc.), les propager
    console.error('[POPCORN-WEB] Erreur lors de la connexion:', {
      error,
      message: error instanceof Error ? error.message : String(error),
      name: error instanceof Error ? error.name : 'Unknown',
      url: fullUrl,
    });
    throw error;
  }
}

/**
 * Crée un compte cloud via l'API popcorn-web
 * @param email Email de l'utilisateur
 * @param password Mot de passe
 * @param inviteCode Code d'invitation
 * @returns Réponse avec user et tokens, ou null si l'API n'est pas disponible
 */
export async function registerCloud(email: string, password: string, inviteCode: string): Promise<{
  user: {
    id: string;
    email: string;
  };
  accessToken: string;
  refreshToken: string;
  jwtSecret?: string;
  grantsAdmin?: boolean;
} | null> {
  try {
    const apiUrl = getPopcornWebApiUrl();
    const fullUrl = `${apiUrl}/auth/register`;
    const res = await requestJson(
      fullUrl,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, inviteCode }),
      },
      10000
    );

    if (!res.ok) {
      if (res.status === 500 || res.status === 503 || res.status === 0) {
        console.warn('[POPCORN-WEB] API non disponible pour l\'inscription cloud');
        return null;
      }
      
      const errorData = res.data || {};
      throw new Error(errorData.message || 'Erreur lors de l\'inscription');
    }

    const data = res.data;
    
    if (data.success && data.data) {
      return {
        user: data.data.user,
        accessToken: data.data.accessToken,
        refreshToken: data.data.refreshToken,
        jwtSecret: data.data.jwtSecret,
        grantsAdmin: data.data.grantsAdmin || false,
      };
    }

    throw new Error('Réponse invalide de l\'API');
  } catch (error) {
    console.warn('[POPCORN-WEB] Impossible de contacter l\'API popcorn-web:', error);
    if (error instanceof Error && error.message.includes('Erreur')) {
      throw error;
    }
    return null;
  }
}

/**
 * Valide un code d'invitation via l'API popcorn-web
 * @param code Code d'invitation à valider
 * @returns Résultat de la validation ou null si l'API n'est pas disponible
 */
export async function validateInvitationCloud(code: string): Promise<{
  isValid: boolean;
  reason?: string;
  message?: string;
  grantsAdmin?: boolean;
} | null> {
  try {
    const apiUrl = getPopcornWebApiUrl();
    const fullUrl = `${apiUrl}/invitations/validate`;
    const res = await requestJson(
      fullUrl,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code }),
      },
      10000
    );

    if (!res.ok) {
      // Si l'API n'est pas disponible, retourner null (pas d'erreur)
      if (res.status === 500 || res.status === 503 || res.status === 0) {
        console.warn('[POPCORN-WEB] API non disponible pour valider l\'invitation cloud');
        return null;
      }
      
      const errorData = res.data || {};
      return {
        isValid: false,
        reason: 'api_error',
        message: errorData.message || 'Erreur lors de la validation de l\'invitation',
      };
    }

    const data = res.data;
    
    if (data.success && data.data) {
      return {
        isValid: data.data.isValid || false,
        reason: data.data.reason,
        message: data.data.message,
        grantsAdmin: data.data.grantsAdmin || false,
      };
    }

    return {
      isValid: false,
      reason: 'invalid',
      message: 'Code d\'invitation invalide',
    };
  } catch (error) {
    // Si l'API n'est pas accessible, retourner null (pas d'erreur fatale)
    console.warn('[POPCORN-WEB] Impossible de contacter l\'API popcorn-web:', error);
    return null;
  }
}

/**
 * Interface pour une définition d'indexer depuis popcorn-web
 */
export interface IndexerDefinition {
  id: string;
  name: string;
  version: string;
  description: string | null;
  protocol: 'rest' | 'torznab' | 'newznab' | 'custom';
  requiresApiKey: boolean;
  requiresAuth: boolean;
  searchEndpoint: string;
  searchMethod: string;
  searchParams: Record<string, string>;
  responseMapping: Record<string, any>;
  categoryMapping: Record<string, any>;
  ui: Record<string, any>;
  customScript: string | null;
  testConfig: Record<string, any> | null;
  documentation: Record<string, any> | null;
  country?: string | null;
  language?: string | null;
  createdBy?: string | null;
  /** Type de connexion (Jackett): public | semi-private | private */
  type?: 'public' | 'semi-private' | 'private' | null;
  /** Template d'URL de téléchargement .torrent (placeholders: {baseUrl}, {id}, {apiKey}) */
  downloadUrlTemplate?: string | null;
  /** URLs connues de l'indexer (optionnel) */
  links?: string[] | null;
  /** Caps (categorymappings, modes) - optionnel */
  caps?: Record<string, unknown> | null;
  /** Configuration optionnelle pour un flux RSS personnalisé */
  rssConfig?: { urlTemplate: string; params?: string[]; format?: string } | null;
  /** True si cette définition est un proxy Jackett (nécessite Jackett installé ; option "Utiliser Jackett") */
  isJackettProxy?: boolean;
}

/**
 * Configuration publique des publicités (pré-roll)
 */
export interface AdsConfig {
  enabled: boolean;
  adId?: string | null;
  type: 'image' | 'video' | 'google' | 'google_display';
  imageUrl: string | null;
  videoUrl: string | null;
  clickUrl: string | null;
  googleAdTagUrl: string | null;
  googleAdClient: string | null;
  googleAdSlot: string | null;
  showSkip: boolean;
  skipDelaySeconds: number;
  maxDurationSeconds: number;
  frequency: 'always' | 'once_per_session' | 'once_per_day';
  muted: boolean;
  showCountdown: boolean;
}

let cachedAdsConfig: AdsConfig | null = null;
let cachedAdsConfigAt = 0;

/**
 * Récupère la configuration publique des publicités (pré-roll).
 * Sur TV/webOS, l'appel direct à popcorn-web peut échouer (CORS, blocage). On peut passer
 * l'URL de base du backend (popcorn-server) pour utiliser le proxy GET /api/client/public/settings.
 */
export async function getPublicAdsSettings(serverBaseUrlForProxy?: string): Promise<AdsConfig | null> {
  try {
    const now = Date.now();
    if (cachedAdsConfig && now - cachedAdsConfigAt < 5 * 60 * 1000) {
      return cachedAdsConfig;
    }

    // En priorité : passer par le proxy du backend (CasaOS/Docker, TV) pour éviter CORS / blocage vers popcorn-web
    if (serverBaseUrlForProxy) {
      const proxyUrl = `${serverBaseUrlForProxy.replace(/\/$/, '')}/api/client/public/settings`;
      const resProxy = await requestJson(
        proxyUrl,
        { method: 'GET', headers: { 'Content-Type': 'application/json' } },
        8000
      );
      if (resProxy.ok && resProxy.data?.success) {
        const adsConfig = resProxy.data?.data?.adsConfig as AdsConfig | undefined;
        if (adsConfig) {
          cachedAdsConfig = adsConfig;
          cachedAdsConfigAt = now;
          return adsConfig;
        }
      }
    }

    const apiUrl = `${getPopcornWebApiUrl()}/public/settings`;
    const res = await requestJson(
      apiUrl,
      { method: 'GET', headers: { 'Content-Type': 'application/json' } },
      8000
    );

    if (!res.ok || !res.data?.success) {
      return null;
    }
    const adsConfig = res.data?.data?.adsConfig as AdsConfig | undefined;
    if (!adsConfig) return null;
    cachedAdsConfig = adsConfig;
    cachedAdsConfigAt = now;
    return adsConfig;
  } catch (error) {
    if (serverBaseUrlForProxy) {
      try {
        const proxyUrl = `${serverBaseUrlForProxy.replace(/\/$/, '')}/api/client/public/settings`;
        const res = await requestJson(
          proxyUrl,
          { method: 'GET', headers: { 'Content-Type': 'application/json' } },
          8000
        );
        if (res.ok && res.data?.success) {
          const adsConfig = res.data?.data?.adsConfig as AdsConfig | undefined;
          if (adsConfig) {
            cachedAdsConfig = adsConfig;
            cachedAdsConfigAt = Date.now();
            return adsConfig;
          }
        }
      } catch {
        // ignore
      }
    }
    return null;
  }
}

/**
 * Enregistre un événement publicitaire (impression/skip/complete)
 */
export async function sendAdEvent(adId: string, eventType: 'impression' | 'skip' | 'complete'): Promise<void> {
  enqueueAdEvent({ adId, eventType });
}

type AdEvent = { adId: string; eventType: 'impression' | 'skip' | 'complete' };

const adEventQueue: AdEvent[] = [];
let adEventFlushTimer: number | null = null;

function ensureAdEventListeners() {
  if (typeof window === 'undefined') return;
  if ((window as any).__adEventListenersAttached) return;
  (window as any).__adEventListenersAttached = true;
  window.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      flushAdEvents(true);
    }
  });
  window.addEventListener('beforeunload', () => {
    flushAdEvents(true);
  });
}

function enqueueAdEvent(event: AdEvent) {
  adEventQueue.push(event);
  ensureAdEventListeners();
  if (adEventQueue.length >= 10) {
    flushAdEvents(false);
    return;
  }
  if (adEventFlushTimer !== null) return;
  adEventFlushTimer = window.setTimeout(() => {
    adEventFlushTimer = null;
    flushAdEvents(false);
  }, 500);
}

async function flushAdEvents(useBeacon: boolean) {
  if (adEventQueue.length === 0) return;
  const batch = adEventQueue.splice(0, adEventQueue.length);
  const apiUrl = `${getPopcornWebApiUrl()}/public/ad-events/bulk`;
  if (useBeacon && typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
    try {
      const blob = new Blob([JSON.stringify({ events: batch })], { type: 'application/json' });
      navigator.sendBeacon(apiUrl, blob);
      return;
    } catch {
      // fallback to fetch
    }
  }
  try {
    await requestJson(
      apiUrl,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ events: batch }),
      },
      8000
    );
  } catch {
    // ignore
  }
}

/**
 * Corps pour créer ou mettre à jour une définition d'indexer (tous les champs sauf createdBy)
 */
export type IndexerDefinitionBody = Omit<IndexerDefinition, 'createdBy'>;

/**
 * Récupère toutes les définitions d'indexers actives depuis popcorn-web
 * @returns Liste des définitions d'indexers ou null si l'API n'est pas disponible
 */
export async function getIndexerDefinitions(): Promise<IndexerDefinition[] | null> {
  try {
    const apiUrl = getPopcornWebApiUrl();
    const fullUrl = `${apiUrl}/indexer-definitions`;
    
    if (import.meta.env.DEV) {
      console.log('[POPCORN-WEB] Récupération des définitions d\'indexers depuis:', fullUrl);
    }
    
    const res = await requestJson(
      fullUrl,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      },
      10000
    );

    if (!res.ok) {
      if (res.status === 500 || res.status === 503 || res.status === 0) {
        console.warn('[POPCORN-WEB] API non disponible pour récupérer les définitions d\'indexers');
        return null;
      }
      
      const errorData = res.data || {};
      console.error('[POPCORN-WEB] Erreur lors de la récupération des définitions:', errorData);
      return null;
    }

    const data = res.data;
    
    if (data.success && data.data && Array.isArray(data.data.definitions)) {
      return data.data.definitions;
    }

    return null;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      console.warn('[POPCORN-WEB] Timeout lors de la récupération des définitions d\'indexers');
      return null;
    }
    
    // Détecter les erreurs CORS (normales en mode navigateur web)
    const isCorsError = error instanceof Error && (
      error.message.includes('CORS') ||
      error.message.includes('Failed to fetch') ||
      error.message.includes('Access-Control-Allow-Origin') ||
      error.message.includes('blocked by CORS policy')
    );
    
    if (isCorsError) {
      if (import.meta.env.DEV) {
        console.log('[POPCORN-WEB] ℹ️ CORS bloque l\'accès en mode navigateur web (normal). Les définitions seront récupérables en Tauri Android/Desktop.');
      }
      return null;
    }
    
    console.warn('[POPCORN-WEB] Impossible de récupérer les définitions d\'indexers:', error);
    return null;
  }
}

/**
 * Crée une définition d'indexer (utilisateur authentifié, created_by = userId)
 */
export async function createIndexerDefinition(
  body: IndexerDefinitionBody
): Promise<{ success: boolean; id?: string; message?: string }> {
  try {
    const apiUrl = `${getPopcornWebApiUrl()}/indexer-definitions`;
    const res = await requestWithTokenRefresh(
      apiUrl,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      },
      10000
    );
    if (!res.ok) {
      const msg =
        res.status === 401
          ? 'UNAUTHORIZED_CLOUD'
          : (res.data as any)?.message || 'Erreur lors de la création';
      return { success: false, message: msg };
    }
    const data = res.data as any;
    return { success: true, id: data?.data?.id };
  } catch (error) {
    console.warn('[POPCORN-WEB] createIndexerDefinition:', error);
    return { success: false, message: error instanceof Error ? error.message : 'Erreur réseau' };
  }
}

/**
 * Met à jour une définition d'indexer (créateur ou admin)
 */
export async function updateIndexerDefinition(
  id: string,
  body: Partial<IndexerDefinitionBody>
): Promise<{ success: boolean; message?: string }> {
  try {
    const apiUrl = `${getPopcornWebApiUrl()}/indexer-definitions/${encodeURIComponent(id)}`;
    const res = await requestWithTokenRefresh(
      apiUrl,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      },
      10000
    );
    if (!res.ok) {
      const msg =
        res.status === 401
          ? 'UNAUTHORIZED_CLOUD'
          : (res.data as any)?.message || 'Erreur lors de la mise à jour';
      return { success: false, message: msg };
    }
    return { success: true };
  } catch (error) {
    console.warn('[POPCORN-WEB] updateIndexerDefinition:', error);
    return { success: false, message: error instanceof Error ? error.message : 'Erreur réseau' };
  }
}

/**
 * Supprime une définition d'indexer (créateur ou admin)
 */
export async function deleteIndexerDefinition(id: string): Promise<{ success: boolean; message?: string }> {
  try {
    const apiUrl = `${getPopcornWebApiUrl()}/indexer-definitions/${encodeURIComponent(id)}`;
    const res = await requestWithTokenRefresh(
      apiUrl,
      { method: 'DELETE', headers: { 'Content-Type': 'application/json' } },
      10000
    );
    if (!res.ok) {
      const msg =
        res.status === 401
          ? 'UNAUTHORIZED_CLOUD'
          : (res.data as any)?.message || 'Erreur lors de la suppression';
      return { success: false, message: msg };
    }
    return { success: true };
  } catch (error) {
    console.warn('[POPCORN-WEB] deleteIndexerDefinition:', error);
    return { success: false, message: error instanceof Error ? error.message : 'Erreur réseau' };
  }
}

/**
 * Interface pour la configuration utilisateur
 */
export interface UserConfig {
  /** URL du backend Rust (pour configuration automatique sur nouveaux appareils) */
  backendUrl?: string | null;
  indexers?: Array<{
    id?: string;
    name: string;
    baseUrl: string;
    apiKey?: string | null;
    jackettIndexerName?: string | null;
    isEnabled?: boolean;
    isDefault?: boolean;
    priority?: number;
    indexerTypeId?: string | null;
    configJson?: string | null;
  }>;
  tmdbApiKey?: string | null;
  downloadLocation?: string | null;
  /** Langue de l'interface utilisateur */
  language?: 'fr' | 'en' | null;
  syncSettings?: {
    syncEnabled?: boolean;
    syncFrequencyMinutes?: number;
    maxTorrentsPerCategory?: number;
    rssIncrementalEnabled?: boolean;
    syncQueriesFilms?: string[];
    syncQueriesSeries?: string[];
    /** Paramètres d'affichage de la bibliothèque ( Films / Séries ). Vide = tout afficher. */
    libraryDisplay?: {
      showZeroSeedTorrents?: boolean;
      torrentsInitialLimit?: number;
      torrentsLoadMoreLimit?: number;
      torrentsRecentLimit?: number;
      /** Langues acceptées (ex: ["FRENCH","MULTI","VOSTFR"]). Vide = toutes */
      mediaLanguages?: string[];
      /** Qualité minimale ("480p"|"720p"|"1080p"|"2160p"|"4K"). Vide = toutes */
      minQuality?: string;
    } | null;
  } | null;
  indexerCategories?: Record<string, {
    enabled: boolean;
    genres?: number[];
  }> | null;
  /** Paramètres de lecture (séries : skip intro, bouton épisode suivant) */
  playbackSettings?: {
    skipIntroEnabled?: boolean;
    nextEpisodeButtonEnabled?: boolean;
    introSkipSeconds?: number;
    nextEpisodeCountdownSeconds?: number;
    streamingMode?: 'hls' | 'direct';
  } | null;
  /** Dossiers de téléchargement par type (films, séries) — style Jellyfin */
  mediaPaths?: {
    filmsPath?: string | null;
    seriesPath?: string | null;
    defaultPath?: string | null;
  } | null;
  /** Dossiers externes (autre NAS, etc.) à inclure dans la bibliothèque */
  librarySources?: Array<{
    id: string;
    path: string;
    category: string;
    label?: string | null;
    share_with_friends: boolean;
  }> | null;
  /** URL pour ouvrir la page FlareSolverr dans le navigateur (synchronisée cloud) */
  flaresolverrOpenUrl?: string | null;
}

/**
 * Sauvegarde la configuration utilisateur dans popcorn-web
 * @param config Configuration à sauvegarder
 * @param accessToken Token d'authentification (optionnel, utilise le token cloud si non fourni)
 * @returns Résultat de la sauvegarde
 */
export async function saveUserConfig(config: UserConfig, accessToken?: string): Promise<{
  success: boolean;
  message?: string;
} | null> {
  try {
    // Utiliser le token cloud si aucun token n'est fourni
    let tokenToUse = accessToken;
    if (!tokenToUse) {
      tokenToUse = TokenManager.getCloudAccessToken() || undefined;
      if (!tokenToUse) {
        console.warn('[POPCORN-WEB] Aucun token cloud disponible pour sauvegarder la configuration');
        return { success: false, message: 'Token d\'authentification cloud manquant' };
      }
    }
    
    // Ne jamais sauvegarder une clé TMDB masquée dans le cloud
    const { isTmdbKeyMaskedOrInvalid } = await import('../utils/tmdb-key.js');
    const configToSave = { ...config };
    if (configToSave.tmdbApiKey && isTmdbKeyMaskedOrInvalid(configToSave.tmdbApiKey)) {
      console.warn('[POPCORN-WEB] ⚠️ Clé TMDB masquée détectée, ne pas sauvegarder dans le cloud');
      configToSave.tmdbApiKey = null; // Ne pas sauvegarder la clé masquée
    }
    
    // Unifié : appel direct à popcorn-web pour tous les modes (CORS géré par popcorn-web ou native-fetch)
    const apiUrl = `${getPopcornWebApiUrl()}/config/save`;
    
    if (import.meta.env.DEV) {
      console.log('[POPCORN-WEB] Sauvegarde de la configuration à:', apiUrl);
    }
    
    // Utiliser requestWithTokenRefresh pour gérer automatiquement le refresh du token en cas d'erreur 401
    const res = await requestWithTokenRefresh(
      apiUrl,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(configToSave),
      },
      10000
    );

    if (!res.ok) {
      if (res.status === 500 || res.status === 503 || res.status === 0) {
        console.warn('[POPCORN-WEB] API non disponible pour sauvegarder la configuration');
        return null;
      }
      const errorData = res.data || {};
      return {
        success: false,
        message: errorData.message || 'Erreur lors de la sauvegarde de la configuration',
      };
    }

    const data = res.data;
    
    if (data.success) {
      return {
        success: true,
        message: 'Configuration sauvegardée avec succès',
      };
    }

    return {
      success: false,
      message: 'Réponse invalide de l\'API',
    };
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      console.warn('[POPCORN-WEB] Timeout lors de la sauvegarde de la configuration');
      return null;
    }
    console.warn('[POPCORN-WEB] Impossible de sauvegarder la configuration:', error);
    return null;
  }
}

/**
 * Sauvegarde en fusionnant avec la config cloud existante.
 * À utiliser pour les mises à jour partielles (ex. langue, syncSettings) pour ne pas écraser
 * indexers, tmdbApiKey, downloadLocation, etc.
 */
export async function saveUserConfigMerge(
  partial: Partial<UserConfig>,
  accessToken?: string
): Promise<{ success: boolean; message?: string } | null> {
  const current = await getUserConfig(accessToken);
  const merged: UserConfig = {
    ...(current || {}),
    ...partial,
    indexers: partial.indexers !== undefined ? partial.indexers : current?.indexers ?? [],
    indexerCategories: partial.indexerCategories !== undefined ? partial.indexerCategories : current?.indexerCategories ?? undefined,
    flaresolverrOpenUrl: partial.flaresolverrOpenUrl !== undefined ? partial.flaresolverrOpenUrl : current?.flaresolverrOpenUrl ?? undefined,
  };
  return saveUserConfig(merged, accessToken);
}

/**
 * Récupère la configuration sauvegardée depuis popcorn-web
 * @param accessToken Token d'authentification (optionnel, utilise le token cloud si non fourni)
 * @returns Configuration sauvegardée ou null
 */
export async function getUserConfig(accessToken?: string): Promise<UserConfig | null> {
  try {
    // Utiliser le token cloud si aucun token n'est fourni
    let tokenToUse = accessToken;
    if (!tokenToUse) {
      tokenToUse = TokenManager.getCloudAccessToken() || undefined;
      if (!tokenToUse) {
        console.warn('[POPCORN-WEB] Aucun token cloud disponible pour récupérer la configuration');
        return null;
      }
    }
    
    // Unifié : appel direct à popcorn-web pour tous les modes (CORS géré par popcorn-web ou native-fetch)
    const apiUrl = `${getPopcornWebApiUrl()}/config/save`;
    
    if (import.meta.env.DEV) {
      console.log('[POPCORN-WEB] Appel à:', apiUrl);
    }
    
    const res = await requestWithTokenRefresh(
      apiUrl,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${tokenToUse}`,
        },
      },
      10000
    );

    if (!res.ok) {
      // Détecter les erreurs CORS (status 0 avec corsError dans data)
      if (res.status === 0 && res.data?.corsError) {
        // En mode navigateur web, CORS bloque l'accès - c'est normal et non bloquant
        if (import.meta.env.DEV) {
          console.log('[POPCORN-WEB] ℹ️ CORS bloque l\'accès en mode navigateur web (normal). La configuration sera récupérable en Tauri Android/Desktop.');
        }
        return null;
      }
      
      if (res.status === 500 || res.status === 503 || res.status === 0) {
        console.warn('[POPCORN-WEB] API non disponible pour récupérer la configuration');
        return null;
      }
      
      // Si 401 ou 404, c'est probablement que l'utilisateur n'a pas de configuration sauvegardée - ne pas bloquer
      // Le proxy retourne maintenant 404 au lieu de 401 pour les cas "pas de config"
      if (res.status === 401 || res.status === 404) {
        // Ne pas logger comme warning, c'est normal pour une première connexion
        if (import.meta.env.DEV) {
          console.log('[POPCORN-WEB] ℹ️ Aucune configuration sauvegardée (normal pour première connexion)');
        }
        return null;
      }
      
      const errorData = res.data || {};
      console.error('[POPCORN-WEB] Erreur lors de la récupération de la configuration:', errorData);
      return null;
    }

    const data = res.data;
    const c = data?.data?.config;

    // Aligné avec la structure popcorn-web (user_config colonnes : indexers_data, tmdb_api_key, etc.)
    if (data?.success && data?.data && c != null && typeof c === 'object') {
      const indexers = Array.isArray(c.indexers) ? c.indexers : [];
      const syncSettings = c.syncSettings != null && typeof c.syncSettings === 'object' ? c.syncSettings : null;
      const indexerCategories = c.indexerCategories != null && typeof c.indexerCategories === 'object' ? c.indexerCategories : null;
      const playbackSettings = c.playbackSettings != null && typeof c.playbackSettings === 'object' ? c.playbackSettings : null;
      const mediaPaths = c.mediaPaths != null && typeof c.mediaPaths === 'object' ? c.mediaPaths : null;
      const librarySources = Array.isArray(c.librarySources)
        ? c.librarySources.filter(
            (s: any) =>
              s && typeof s.path === 'string' && s.path.trim() !== '' && (s.category === 'FILM' || s.category === 'SERIES')
          )
        : null;
      return {
        backendUrl: typeof c.backendUrl === 'string' && c.backendUrl.trim() !== '' ? c.backendUrl : null,
        indexers,
        tmdbApiKey: typeof c.tmdbApiKey === 'string' && c.tmdbApiKey.trim() !== '' ? c.tmdbApiKey : null,
        downloadLocation: typeof c.downloadLocation === 'string' && c.downloadLocation.trim() !== '' ? c.downloadLocation : null,
        language: c.language === 'fr' || c.language === 'en' ? c.language : null,
        syncSettings: syncSettings && Object.keys(syncSettings).length > 0 ? syncSettings : null,
        indexerCategories: indexerCategories && Object.keys(indexerCategories).length > 0 ? indexerCategories : null,
        playbackSettings: playbackSettings && Object.keys(playbackSettings).length > 0 ? playbackSettings : null,
        mediaPaths: mediaPaths && (mediaPaths.filmsPath != null || mediaPaths.seriesPath != null || mediaPaths.defaultPath != null) ? mediaPaths : null,
        librarySources: librarySources && librarySources.length > 0 ? librarySources : null,
        flaresolverrOpenUrl: typeof c.flaresolverrOpenUrl === 'string' && c.flaresolverrOpenUrl.trim() !== '' ? c.flaresolverrOpenUrl.trim() : null,
      };
    }

    return null;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      console.warn('[POPCORN-WEB] Timeout lors de la récupération de la configuration');
      return null;
    }

    // Détecter les erreurs CORS (normales en mode navigateur web)
    const isCorsError = error instanceof Error && (
      error.message.includes('CORS') ||
      error.message.includes('Failed to fetch') ||
      error.message.includes('Access-Control-Allow-Origin') ||
      error.message.includes('blocked by CORS policy')
    );

    if (isCorsError) {
      // En mode navigateur web, CORS bloque l'accès direct - c'est normal
      // La config sera récupérable en Tauri Android/Desktop via native-fetch
      if (import.meta.env.DEV) {
        console.log('[POPCORN-WEB] ℹ️ CORS bloque l\'accès en mode navigateur web (normal). La configuration sera récupérable en Tauri Android/Desktop.');
      }
      return null;
    }

    console.warn('[POPCORN-WEB] Impossible de récupérer la configuration:', error);
    return null;
  }
}

/** Format d'une demande de média sauvegardée dans le cloud (aligné backend) */
export interface CloudMediaRequest {
  id: string;
  tmdb_id: number;
  media_type: string;
  status: number;
  requested_by: string;
  modified_by?: string | null;
  season_numbers?: string | null;
  notes?: string | null;
  created_at: number;
  updated_at: number;
}

/**
 * Récupère les demandes de médias sauvegardées dans le cloud.
 */
export async function getCloudMediaRequests(accessToken?: string): Promise<CloudMediaRequest[] | null> {
  try {
    const token = accessToken ?? TokenManager.getCloudAccessToken() ?? undefined;
    if (!token) return null;
    const apiUrl = `${getPopcornWebApiUrl()}/requests`;
    const res = await requestWithTokenRefresh(
      apiUrl,
      { method: 'GET', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` } },
      10000
    );
    if (!res.ok || !res.data?.success) return null;
    const list = res.data?.data?.requests;
    return Array.isArray(list) ? (list as CloudMediaRequest[]) : [];
  } catch {
    return null;
  }
}

/**
 * Réponse de GET /api/v1/subscription/me (abonnement + options par compte).
 */
export interface SubscriptionMe {
  subscription: {
    id: string;
    planId: string;
    planName: string;
    planSlug: string;
    storageGb: number;
    status: string;
    flyAppName: string | null;
    flyRegion: string | null;
    currentPeriodEnd: number | null;
    stripeSubscriptionId: string | null;
  } | null;
  backendUrl: string | null;
  streamingTorrent: boolean;
}

/**
 * Récupère l'abonnement et les options du compte (dont streaming torrent).
 */
export async function getSubscriptionMe(accessToken?: string): Promise<SubscriptionMe | null> {
  try {
    const token = accessToken ?? TokenManager.getCloudAccessToken() ?? undefined;
    if (!token) return null;
    const apiUrl = `${getPopcornWebApiUrl()}/subscription/me`;
    const res = await requestWithTokenRefresh(
      apiUrl,
      { method: 'GET', headers: { 'Content-Type': 'application/json' } },
      10000
    );
    if (!res.ok || !res.data?.success) return null;
    const d = res.data?.data;
    return {
      subscription: d?.subscription ?? null,
      backendUrl: d?.backendUrl ?? null,
      streamingTorrent: d?.streamingTorrent === true,
    };
  } catch {
    return null;
  }
}

/**
 * Sauvegarde les demandes de médias dans le cloud (remplace la liste existante).
 */
export async function saveCloudMediaRequests(
  requests: CloudMediaRequest[],
  accessToken?: string
): Promise<{ success: boolean; message?: string }> {
  try {
    const token = accessToken ?? TokenManager.getCloudAccessToken() ?? undefined;
    if (!token) {
      return { success: false, message: 'Token cloud manquant' };
    }
    const apiUrl = `${getPopcornWebApiUrl()}/requests`;
    const res = await requestWithTokenRefresh(
      apiUrl,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ requests }),
      },
      10000
    );
    if (!res.ok) return { success: false, message: res.data?.message ?? 'Erreur sauvegarde demandes' };
    return res.data?.success ? { success: true } : { success: false, message: res.data?.message };
  } catch (e) {
    return { success: false, message: e instanceof Error ? e.message : 'Erreur inconnue' };
  }
}

/**
 * Interface pour un utilisateur local
 */
export interface LocalUser {
  id: string;
  email: string;
  displayName: string | null;
  isActive: boolean;
  emailVerified: boolean;
  createdAt: number;
  updatedAt: number;
}

/**
 * Invite un utilisateur local par email
 */
export async function inviteLocalUser(email: string, displayName?: string): Promise<{ success: boolean; message?: string; userId?: string }> {
  try {
    const apiUrl = `${getPopcornWebApiUrl()}/local-users/invite`;
    const res = await requestWithTokenRefresh(
      apiUrl,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, displayName }),
      },
      10000
    );

    if (!res.ok) {
      return {
        success: false,
        message: res.data?.message || 'Erreur lors de l\'envoi de l\'invitation',
      };
    }

    return {
      success: true,
      message: res.data?.message || 'Invitation envoyée avec succès',
      userId: res.data?.data?.userId,
    };
  } catch (error) {
    console.error('[POPCORN-WEB] Erreur lors de l\'invitation:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Erreur lors de l\'envoi de l\'invitation',
    };
  }
}

/**
 * Rafraîchit le token cloud d'accès
 */
async function refreshCloudToken(): Promise<boolean> {
  try {
    const refreshToken = TokenManager.getCloudRefreshToken();
    if (!refreshToken) {
      console.warn('[POPCORN-WEB] Aucun refresh token cloud disponible');
      return false;
    }

    const apiUrl = `${getPopcornWebApiUrl()}/auth/refresh`;
    const res = await requestJson(
      apiUrl,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ refreshToken }),
      },
      10000
    );

    if (!res.ok || !res.data?.success) {
      console.warn('[POPCORN-WEB] Impossible de rafraîchir le token cloud:', res.data);
      return false;
    }

    const { accessToken, refreshToken: newRefreshToken } = res.data.data || {};
    if (accessToken && newRefreshToken) {
      TokenManager.setCloudTokens(accessToken, newRefreshToken);
      return true;
    }

    return false;
  } catch (error) {
    console.warn('[POPCORN-WEB] Erreur lors du rafraîchissement du token cloud:', error);
    return false;
  }
}

/**
 * Helper pour effectuer une requête avec refresh automatique du token en cas d'erreur 401
 */
async function requestWithTokenRefresh(
  apiUrl: string,
  init: RequestInit,
  timeoutMs: number = 10000
): Promise<JsonResult> {
  let token = TokenManager.getCloudAccessToken();
  if (!token) {
    return { ok: false, status: 401, data: { error: 'Unauthorized', message: 'Token d\'authentification cloud manquant' } };
  }

  // Ajouter le token à l'en-tête Authorization
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${token}`);
  init.headers = headers;

  let res = await requestJson(apiUrl, init, timeoutMs);

  // Si erreur 401, essayer de rafraîchir le token et réessayer
  if (!res.ok && res.status === 401) {
    const refreshed = await refreshCloudToken();
    if (refreshed) {
      token = TokenManager.getCloudAccessToken();
      if (token) {
        // Mettre à jour l'en-tête avec le nouveau token
        headers.set('Authorization', `Bearer ${token}`);
        init.headers = headers;
        // Réessayer avec le nouveau token
        res = await requestJson(apiUrl, init, timeoutMs);
      }
    }
  }

  return res;
}

/**
 * Récupère la liste des utilisateurs locaux
 */
export async function getLocalUsers(): Promise<LocalUser[] | null> {
  try {
    const apiUrl = `${getPopcornWebApiUrl()}/local-users`;
    const res = await requestWithTokenRefresh(
      apiUrl,
      {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      },
      10000
    );

    if (!res.ok) {
      console.warn('[POPCORN-WEB] Impossible de récupérer les utilisateurs locaux:', res.data);
      return null;
    }

    return res.data?.data?.users || [];
  } catch (error) {
    console.warn('[POPCORN-WEB] Erreur lors de la récupération des utilisateurs locaux:', error);
    return null;
  }
}

/**
 * Supprime un utilisateur local
 */
export async function deleteLocalUser(userId: string): Promise<{ success: boolean; message?: string }> {
  try {
    const apiUrl = `${getPopcornWebApiUrl()}/local-users/${userId}`;
    const res = await requestWithTokenRefresh(
      apiUrl,
      {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
      },
      10000
    );

    if (!res.ok) {
      return {
        success: false,
        message: res.data?.message || 'Erreur lors de la suppression',
      };
    }

    return {
      success: true,
      message: res.data?.data?.message || 'Utilisateur supprimé avec succès',
    };
  } catch (error) {
    console.error('[POPCORN-WEB] Erreur lors de la suppression:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Erreur lors de la suppression',
    };
  }
}

/**
 * Demande à Gemini (via popcorn-web) de proposer des règles d'enrichissement TMDB
 * à partir des échecs agrégés. Les règles sont stockées dans Turso (tmdb_enrichment_overrides)
 * et utilisées au lookup par popcorn-server. Réservé admin.
 */
export async function suggestTmdbEnrichmentRules(): Promise<{
  success: boolean;
  inserted?: number;
  message?: string;
  error?: string;
  status?: number;
}> {
  try {
    const apiUrl = `${getPopcornWebApiUrl()}/admin/tmdb-enrichment-suggest`;
    const res = await requestWithTokenRefresh(
      apiUrl,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      },
      120000
    );

    if (!res.ok) {
      return {
        success: false,
        error: res.data?.error || 'Erreur',
        message: res.data?.message || `HTTP ${res.status}`,
        status: res.status,
      };
    }

    const data = res.data?.data ?? res.data;
    return {
      success: true,
      inserted: data?.inserted ?? 0,
      message: data?.message || res.data?.message || 'Règles mises à jour.',
    };
  } catch (error) {
    return {
      success: false,
      error: 'RequestError',
      message: error instanceof Error ? error.message : 'Erreur réseau',
    };
  }
}

/**
 * Réenvoie une invitation pour un utilisateur local
 */
export async function resendLocalUserInvitation(userId: string): Promise<{ success: boolean; message?: string }> {
  try {
    const apiUrl = `${getPopcornWebApiUrl()}/local-users/${userId}/resend-invitation`;
    const res = await requestWithTokenRefresh(
      apiUrl,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      },
      10000
    );

    if (!res.ok) {
      return {
        success: false,
        message: res.data?.message || 'Erreur lors du réenvoi de l\'invitation',
      };
    }

    return {
      success: true,
      message: res.data?.data?.message || 'Invitation renvoyée avec succès',
    };
  } catch (error) {
    console.error('[POPCORN-WEB] Erreur lors du réenvoi de l\'invitation:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Erreur lors du réenvoi de l\'invitation',
    };
  }
}

/**
 * Récupère les informations d'un utilisateur local pour synchronisation vers le backend Rust
 * Inclut le password_hash pour permettre la création dans le backend
 */
export async function getLocalUserForSync(userId: string): Promise<{
  success: boolean;
  data?: {
    id: string;
    cloud_account_id: string;
    email: string;
    password_hash: string;
    display_name: string | null;
  };
  message?: string;
}> {
  try {
    const apiUrl = `${getPopcornWebApiUrl()}/local-users/sync-to-backend`;
    const res = await requestWithTokenRefresh(
      apiUrl,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ userId }),
      },
      10000
    );

    if (!res.ok) {
      return {
        success: false,
        message: res.data?.message || 'Erreur lors de la récupération des informations',
      };
    }

    return {
      success: true,
      data: res.data?.data,
    };
  } catch (error) {
    console.error('[POPCORN-WEB] Erreur lors de la récupération des informations:', error);
    return {
      success: false,
      message: error instanceof Error ? error.message : 'Erreur lors de la récupération des informations',
    };
  }
}

/**
 * ============================
 * Système d'amis (popcorn-web)
 * ============================
 */

export interface Friend {
  friendId: string;
  email: string | null;
  status: string;
  shareType: 'none' | 'all' | 'selected';
  backendUrl: string | null;
  createdAt: number;
}

export interface FriendActivity {
  id: string;
  userId: string;
  friendId: string;
  action: string;
  mediaId: string | null;
  mediaTitle: string | null;
  createdAt: number;
}

export async function getFriends(): Promise<Friend[] | null> {
  try {
    const apiUrl = `${getPopcornWebApiUrl()}/friends`;
    const res = await requestWithTokenRefresh(
      apiUrl,
      {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      },
      10000
    );

    if (!res.ok) {
      console.warn('[POPCORN-WEB] Impossible de récupérer les amis:', res.data);
      return null;
    }

    return res.data?.data?.friends || [];
  } catch (error) {
    console.warn('[POPCORN-WEB] Erreur lors de la récupération des amis:', error);
    return null;
  }
}

export async function inviteFriend(email: string, displayName?: string): Promise<{ success: boolean; message?: string; friendId?: string; localUserId?: string }> {
  try {
    const apiUrl = `${getPopcornWebApiUrl()}/friends/invite`;
    const res = await requestWithTokenRefresh(
      apiUrl,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, displayName }),
      },
      10000
    );

    if (!res.ok) {
      return { success: false, message: res.data?.message || 'Erreur lors de l\'invitation' };
    }

    return {
      success: true,
      message: res.data?.data?.message || 'Ami ajouté avec succès',
      friendId: res.data?.data?.friendId,
      localUserId: res.data?.data?.localUserId,
    };
  } catch (error) {
    console.error('[POPCORN-WEB] Erreur lors de l\'invitation ami:', error);
    return { success: false, message: error instanceof Error ? error.message : 'Erreur lors de l\'invitation' };
  }
}

export async function deleteFriend(friendId: string): Promise<{ success: boolean; message?: string }> {
  try {
    const apiUrl = `${getPopcornWebApiUrl()}/friends/${encodeURIComponent(friendId)}`;
    const res = await requestWithTokenRefresh(
      apiUrl,
      {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
      },
      10000
    );

    if (!res.ok) {
      return { success: false, message: res.data?.message || 'Erreur lors de la suppression' };
    }

    return { success: true, message: res.data?.data?.message || 'Ami supprimé' };
  } catch (error) {
    console.error('[POPCORN-WEB] Erreur lors de la suppression ami:', error);
    return { success: false, message: error instanceof Error ? error.message : 'Erreur lors de la suppression' };
  }
}

export async function getFriendShare(friendId: string): Promise<{ success: boolean; data?: { shareType: 'none' | 'all' | 'selected'; mediaIds: string[] }; message?: string }> {
  try {
    const apiUrl = `${getPopcornWebApiUrl()}/friends/${encodeURIComponent(friendId)}/share`;
    const res = await requestWithTokenRefresh(
      apiUrl,
      {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      },
      10000
    );

    if (!res.ok) {
      return { success: false, message: res.data?.message || 'Erreur lors du chargement du partage' };
    }

    return { success: true, data: res.data?.data };
  } catch (error) {
    console.error('[POPCORN-WEB] Erreur getFriendShare:', error);
    return { success: false, message: error instanceof Error ? error.message : 'Erreur lors du chargement du partage' };
  }
}

export async function updateFriendShare(
  friendId: string,
  shareType: 'none' | 'all' | 'selected',
  mediaIds?: string[]
): Promise<{ success: boolean; message?: string }> {
  try {
    const apiUrl = `${getPopcornWebApiUrl()}/friends/${encodeURIComponent(friendId)}/share`;
    const res = await requestWithTokenRefresh(
      apiUrl,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shareType, mediaIds }),
      },
      10000
    );

    if (!res.ok) {
      return { success: false, message: res.data?.message || 'Erreur lors de la mise à jour du partage' };
    }

    return { success: true, message: 'Partage mis à jour' };
  } catch (error) {
    console.error('[POPCORN-WEB] Erreur updateFriendShare:', error);
    return { success: false, message: error instanceof Error ? error.message : 'Erreur lors de la mise à jour du partage' };
  }
}

export async function getFriendsActivity(): Promise<FriendActivity[] | null> {
  try {
    const apiUrl = `${getPopcornWebApiUrl()}/friends/activity`;
    const res = await requestWithTokenRefresh(
      apiUrl,
      {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      },
      10000
    );

    if (!res.ok) {
      return null;
    }

    return res.data?.data?.activity || [];
  } catch (error) {
    console.warn('[POPCORN-WEB] Erreur lors de la récupération activité amis:', error);
    return null;
  }
}

export async function logFriendActivity(params: { ownerId: string; action: string; mediaId?: string; mediaTitle?: string }): Promise<{ success: boolean; message?: string }> {
  try {
    const apiUrl = `${getPopcornWebApiUrl()}/friends/activity`;
    const res = await requestWithTokenRefresh(
      apiUrl,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      },
      8000
    );

    if (!res.ok) {
      return { success: false, message: res.data?.message || 'Erreur lors de l\'enregistrement de l\'activité' };
    }

    return { success: true, message: res.data?.data?.message || 'Activité enregistrée' };
  } catch (error) {
    return { success: false, message: error instanceof Error ? error.message : 'Erreur lors de l\'enregistrement de l\'activité' };
  }
}

export async function getSharedWithMe(): Promise<Array<{ friendId: string; email: string | null; shareType: 'all' | 'selected'; backendUrl: string | null; localUserId: string | null }> | null> {
  try {
    const apiUrl = `${getPopcornWebApiUrl()}/friends/shared-with-me`;
    const res = await requestWithTokenRefresh(
      apiUrl,
      { method: 'GET', headers: { 'Content-Type': 'application/json' } },
      10000
    );
    if (!res.ok) return null;
    return res.data?.data?.shared || [];
  } catch (error) {
    console.warn('[POPCORN-WEB] Erreur getSharedWithMe:', error);
    return null;
  }
}

/**
 * ============================
 * Feedback utilisateur
 * ============================
 */

export interface FeedbackThread {
  id: string;
  userId: string;
  userEmail?: string | null;
  subject: string;
  status: string;
  createdAt: number;
  updatedAt: number;
  lastMessageAt: number;
}

export interface FeedbackMessage {
  id: string;
  threadId: string;
  senderType: 'user' | 'admin';
  senderId: string | null;
  content: string;
  isRead: boolean;
  createdAt: number;
}

export async function getFeedbackThreads(): Promise<FeedbackThread[] | null> {
  try {
    const apiUrl = `${getPopcornWebApiUrl()}/feedback`;
    const res = await requestWithTokenRefresh(
      apiUrl,
      { method: 'GET', headers: { 'Content-Type': 'application/json' } },
      10000
    );
    if (!res.ok) return null;
    return res.data?.data?.threads || [];
  } catch (error) {
    console.warn('[POPCORN-WEB] Erreur getFeedbackThreads:', error);
    return null;
  }
}

export async function getFeedbackThread(threadId: string): Promise<{ thread: FeedbackThread; messages: FeedbackMessage[] } | null> {
  try {
    const apiUrl = `${getPopcornWebApiUrl()}/feedback/${encodeURIComponent(threadId)}`;
    const res = await requestWithTokenRefresh(
      apiUrl,
      { method: 'GET', headers: { 'Content-Type': 'application/json' } },
      10000
    );
    if (!res.ok) return null;
    return res.data?.data || null;
  } catch (error) {
    console.warn('[POPCORN-WEB] Erreur getFeedbackThread:', error);
    return null;
  }
}

export async function sendFeedbackMessage(params: {
  threadId?: string;
  subject?: string;
  content: string;
}): Promise<{ success: boolean; threadId?: string; messageId?: string; message?: string }> {
  try {
    if (params.threadId) {
      const apiUrl = `${getPopcornWebApiUrl()}/feedback/${encodeURIComponent(params.threadId)}/messages`;
      const res = await requestWithTokenRefresh(
        apiUrl,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ content: params.content }),
        },
        10000
      );
      if (!res.ok) {
        return { success: false, message: res.data?.message || 'Erreur lors de l\'envoi' };
      }
      return { success: true, messageId: res.data?.data?.messageId };
    } else {
      if (!params.subject) {
        return { success: false, message: 'Sujet requis pour un nouveau message' };
      }
      const apiUrl = `${getPopcornWebApiUrl()}/feedback`;
      const res = await requestWithTokenRefresh(
        apiUrl,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ subject: params.subject, content: params.content }),
        },
        10000
      );
      if (!res.ok) {
        return { success: false, message: res.data?.message || 'Erreur lors de l\'envoi' };
      }
      return { success: true, threadId: res.data?.data?.threadId };
    }
  } catch (error) {
    console.warn('[POPCORN-WEB] Erreur sendFeedbackMessage:', error);
    return { success: false, message: error instanceof Error ? error.message : 'Erreur réseau' };
  }
}

export async function getFeedbackUnreadCount(): Promise<number | null> {
  try {
    const apiUrl = `${getPopcornWebApiUrl()}/feedback/count/unread`;
    const res = await requestWithTokenRefresh(
      apiUrl,
      { method: 'GET', headers: { 'Content-Type': 'application/json' } },
      8000
    );
    if (!res.ok) return null;
    return res.data?.data?.unreadCount ?? 0;
  } catch (error) {
    return null;
  }
}
