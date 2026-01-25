/**
 * Utilitaires pour appeler l'API popcorn-web
 * popcorn-client et popcorn-server ne doivent JAMAIS accéder directement à Turso
 * Ils doivent passer par les routes API de popcorn-web
 */
import { isTauri } from '../utils/tauri.js';
import { TokenManager } from '../client/storage.js';

/**
 * Obtient l'URL de base de l'API popcorn-web
 * URL fixe pointant vers le déploiement Vercel
 */
export function getPopcornWebApiUrl(): string {
  // Permet d'overrider sans changer le code (ex: staging / domaine custom)
  const apiUrl =
    import.meta.env.PUBLIC_POPCORN_WEB_URL ||
    import.meta.env.POPCORN_WEB_URL ||
    'https://popcorn-web-five.vercel.app';
  
  // S'assurer que l'URL se termine par /api/v1
  const finalUrl = apiUrl.replace(/\/$/, '') + '/api/v1';
  
  // Log pour debug (uniquement en développement)
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
 * Interface pour la configuration utilisateur
 */
export interface UserConfig {
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
  syncSettings?: {
    syncEnabled?: boolean;
    syncFrequencyMinutes?: number;
    maxTorrentsPerCategory?: number;
    rssIncrementalEnabled?: boolean;
    syncQueriesFilms?: string[];
    syncQueriesSeries?: string[];
  } | null;
  indexerCategories?: Record<string, {
    enabled: boolean;
    genres?: number[];
  }> | null;
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
    
    const res = await requestJson(
      apiUrl,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${tokenToUse}`,
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
    
    const res = await requestJson(
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
    
    if (data.success && data.data && data.data.config) {
      return {
        indexers: data.data.config.indexers,
        tmdbApiKey: data.data.config.tmdbApiKey,
        downloadLocation: data.data.config.downloadLocation,
        syncSettings: data.data.config.syncSettings ?? null,
        indexerCategories: data.data.config.indexerCategories ?? null,
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
