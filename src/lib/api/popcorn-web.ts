/**
 * Utilitaires pour appeler l'API popcorn-web
 * popcorn-client et popcorn-server ne doivent JAMAIS accéder directement à Turso
 * Ils doivent passer par les routes API de popcorn-web
 */

/**
 * Obtient l'URL de base de l'API popcorn-web
 * URL fixe pointant vers le déploiement Vercel
 */
export function getPopcornWebApiUrl(): string {
  // URL fixe pour popcorn-web déployé sur Vercel
  const apiUrl = 'https://popcorn-web-five.vercel.app';
  
  // S'assurer que l'URL se termine par /api/v1
  const finalUrl = apiUrl.replace(/\/$/, '') + '/api/v1';
  
  // Log pour debug (uniquement en développement)
  if (import.meta.env.DEV) {
    console.log('[POPCORN-WEB] URL de l\'API:', finalUrl);
  }
  
  return finalUrl;
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
  };
  accessToken: string;
  refreshToken: string;
} | null> {
  const apiUrl = getPopcornWebApiUrl();
  const fullUrl = `${apiUrl}/auth/login`;
  
  // Log pour debug
  console.log('[POPCORN-WEB] Tentative de connexion à:', fullUrl);
  
  try {
    // Ajouter un timeout de 10 secondes
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    
    const response = await fetch(fullUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, password }),
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);

    console.log('[POPCORN-WEB] Réponse reçue:', {
      status: response.status,
      statusText: response.statusText,
      ok: response.ok,
      url: response.url,
    });

    if (!response.ok) {
      // Si l'API n'est pas disponible (erreur serveur)
      if (response.status === 500 || response.status === 503) {
        const errorText = await response.text().catch(() => '');
        console.error('[POPCORN-WEB] API non disponible:', {
          status: response.status,
          statusText: response.statusText,
          body: errorText,
        });
        return null;
      }
      
      // Pour les erreurs 401 (identifiants incorrects), propager l'erreur
      const errorData = await response.json().catch(() => {
        return response.text().then(text => {
          console.error('[POPCORN-WEB] Erreur de parsing JSON:', text);
          return { message: `Erreur ${response.status}: ${response.statusText}` };
        });
      });
      
      const errorMessage = errorData.message || `Erreur ${response.status} lors de la connexion`;
      console.error('[POPCORN-WEB] Erreur API:', {
        status: response.status,
        message: errorMessage,
        data: errorData,
      });
      
      // Créer une erreur avec le statut pour que la route puisse la gérer
      const error = new Error(errorMessage) as Error & { status?: number };
      error.status = response.status;
      throw error;
    }

    const data = await response.json();
    console.log('[POPCORN-WEB] Données reçues:', { success: data.success, hasData: !!data.data });
    
    if (data.success && data.data) {
      return {
        user: data.data.user,
        accessToken: data.data.accessToken,
        refreshToken: data.data.refreshToken,
      };
    }

    console.error('[POPCORN-WEB] Réponse invalide:', data);
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
  grantsAdmin?: boolean;
} | null> {
  try {
    const apiUrl = getPopcornWebApiUrl();
    const response = await fetch(`${apiUrl}/auth/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, password, inviteCode }),
    });

    if (!response.ok) {
      if (response.status === 500 || response.status === 503) {
        console.warn('[POPCORN-WEB] API non disponible pour l\'inscription cloud');
        return null;
      }
      
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || 'Erreur lors de l\'inscription');
    }

    const data = await response.json();
    
    if (data.success && data.data) {
      return {
        user: data.data.user,
        accessToken: data.data.accessToken,
        refreshToken: data.data.refreshToken,
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
    const response = await fetch(`${apiUrl}/invitations/validate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ code }),
    });

    if (!response.ok) {
      // Si l'API n'est pas disponible, retourner null (pas d'erreur)
      if (response.status === 500 || response.status === 503) {
        console.warn('[POPCORN-WEB] API non disponible pour valider l\'invitation cloud');
        return null;
      }
      
      const errorData = await response.json().catch(() => ({}));
      return {
        isValid: false,
        reason: 'api_error',
        message: errorData.message || 'Erreur lors de la validation de l\'invitation',
      };
    }

    const data = await response.json();
    
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
}

async function fetchJsonWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
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
      const { TokenManager } = await import('../client/storage.js');
      tokenToUse = TokenManager.getCloudAccessToken();
      if (!tokenToUse) {
        console.warn('[POPCORN-WEB] Aucun token cloud disponible pour sauvegarder la configuration');
        return { success: false, message: 'Token d\'authentification cloud manquant' };
      }
    }
    
    // Utiliser la route proxy dans popcorn-client pour éviter les problèmes CORS
    // S'assurer d'utiliser window.location.origin pour éviter les redirections vers le backend Rust
    const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
    const apiUrl = `${baseUrl}/api/v1/config/save`;
    
    if (import.meta.env.DEV) {
      console.log('[POPCORN-WEB] Sauvegarde de la configuration à:', apiUrl);
    }
    
    const response = await fetchJsonWithTimeout(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${tokenToUse}`,
      },
      body: JSON.stringify(config),
    }, 10000);

    if (!response.ok) {
      if (response.status === 500 || response.status === 503) {
        console.warn('[POPCORN-WEB] API non disponible pour sauvegarder la configuration');
        return null;
      }
      
      const errorData = await response.json().catch(() => ({}));
      return {
        success: false,
        message: errorData.message || 'Erreur lors de la sauvegarde de la configuration',
      };
    }

    const data = await response.json();
    
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
      const { TokenManager } = await import('../client/storage.js');
      tokenToUse = TokenManager.getCloudAccessToken();
      if (!tokenToUse) {
        console.warn('[POPCORN-WEB] Aucun token cloud disponible pour récupérer la configuration');
        return null;
      }
    }
    
    // Utiliser la route proxy dans popcorn-client pour éviter les problèmes CORS
    // S'assurer d'utiliser window.location.origin pour éviter les redirections vers le backend Rust
    const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
    const apiUrl = `${baseUrl}/api/v1/config/save`;
    
    if (import.meta.env.DEV) {
      console.log('[POPCORN-WEB] Appel à:', apiUrl);
    }
    
    const response = await fetchJsonWithTimeout(apiUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${tokenToUse}`,
      },
    }, 10000);

    if (!response.ok) {
      if (response.status === 500 || response.status === 503) {
        console.warn('[POPCORN-WEB] API non disponible pour récupérer la configuration');
        return null;
      }
      
      // Si 401 ou 404, c'est probablement que l'utilisateur n'a pas de configuration sauvegardée - ne pas bloquer
      // Le proxy retourne maintenant 404 au lieu de 401 pour les cas "pas de config"
      if (response.status === 401 || response.status === 404) {
        // Ne pas logger comme warning, c'est normal pour une première connexion
        if (import.meta.env.DEV) {
          console.log('[POPCORN-WEB] ℹ️ Aucune configuration sauvegardée (normal pour première connexion)');
        }
        return null;
      }
      
      const errorData = await response.json().catch(() => ({}));
      console.error('[POPCORN-WEB] Erreur lors de la récupération de la configuration:', errorData);
      return null;
    }

    const data = await response.json();
    
    if (data.success && data.data && data.data.config) {
      return {
        indexers: data.data.config.indexers,
        tmdbApiKey: data.data.config.tmdbApiKey,
        downloadLocation: data.data.config.downloadLocation,
      };
    }

    return null;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      console.warn('[POPCORN-WEB] Timeout lors de la récupération de la configuration');
      return null;
    }
    console.warn('[POPCORN-WEB] Impossible de récupérer la configuration:', error);
    return null;
  }
}
