export const prerender = false;

import type { APIRoute } from 'astro';
import type { SetupStatus } from '../../../../lib/client/types.js';

function getBackendUrlOverrideFromRequest(request: Request): string | null {
  const raw = request.headers.get('x-popcorn-backend-url') || request.headers.get('X-Popcorn-Backend-Url');
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed || trimmed === 'undefined') return null;
  try {
    const u = new URL(trimmed);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return trimmed.replace(/\/$/, '');
  } catch {
    return null;
  }
}

/**
 * API pour récupérer le statut du setup
 * Vérifie si la configuration est complète (indexers, TMDB key, etc.)
 */
export const GET: APIRoute = async ({ request }) => {
  try {
    // Fonction helper pour les appels avec timeout
    const fetchWithTimeout = async (url: string, options: RequestInit = {}, timeout = 2000): Promise<Response | null> => {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);
        
        const response = await fetch(url, {
          ...options,
          signal: controller.signal,
        });
        
        clearTimeout(timeoutId);
        return response;
      } catch (error) {
        // Ne pas logger les timeouts comme des warnings - c'est normal si le backend n'est pas démarré
        // Seulement logger en mode développement pour le débogage
        if (import.meta.env.DEV) {
          if (error instanceof Error && error.name === 'AbortError') {
            console.log(`[SETUP STATUS] Backend non accessible: ${url} (timeout après ${timeout}ms)`);
          } else {
            console.log(`[SETUP STATUS] Erreur lors de l'appel à ${url}:`, error);
          }
        }
        return null;
      }
    };

    // Exécuter toutes les vérifications avec timeout global de 4 secondes
    const statusCheckPromise = (async () => {

        // Déterminer l'URL du backend (priorité: header transmis par le client -> fallback env/default)
        const { getBackendUrlAsync } = await import('../../../../lib/backend-url.js');
        const backendUrl =
          getBackendUrlOverrideFromRequest(request) ||
          (await getBackendUrlAsync());

        // Vérifier rapidement si le backend est joignable.
        // Si non joignable, NE PAS forcer needsSetup=true (évite le wizard après reboot).
        let backendReachable = false;
        try {
          const healthUrl = `${backendUrl}/api/client/health`;
          const healthResponse = await fetchWithTimeout(healthUrl, { method: 'GET' }, 700);
          backendReachable = !!healthResponse?.ok;
        } catch {
          backendReachable = false;
        }

        // Vérifier si des indexers existent (depuis le backend)
        let hasIndexers = false;
        if (!backendReachable) {
          // Backend down -> statut "inconnu", on renvoie vite pour éviter les timeouts globaux.
          return {
            backendReachable,
            hasIndexers: false,
            hasTmdbKey: false,
            hasUsers: false,
            hasDownloadLocation: false,
          };
        }
        try {
          const backendApiUrl = `${backendUrl}/api/client/admin/indexers`;
          
          const indexersResponse = await fetchWithTimeout(backendApiUrl, {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json',
            },
          });
          
          if (indexersResponse?.ok) {
            const indexersData = await indexersResponse.json();
            const enabledIndexers = (indexersData.data || []).filter((idx: any) => idx.is_enabled === 1);
            hasIndexers = enabledIndexers.length > 0;
          }
        } catch (indexerError) {
          // Ne logger que en mode développement
          if (import.meta.env.DEV) {
            console.log('[SETUP STATUS] Backend non accessible pour vérifier les indexers');
          }
        }

        // Vérifier si une clé TMDB est configurée (depuis le backend)
        let hasTmdbKey = false;
        try {
          const authHeader = request.headers.get('Authorization');
          let userId: string | null = null;
          
          if (authHeader && authHeader.startsWith('Bearer ')) {
            const { verifyToken } = await import('../../../../lib/auth/jwt.js');
            const token = authHeader.substring(7);
            const payload = verifyToken(token);
            if (payload) {
              userId = payload.userId || payload.id || null;
            }
          }

          if (userId) {
            const backendApiUrl = `${backendUrl}/api/tmdb/key`;
            
            const tmdbResponse = await fetchWithTimeout(backendApiUrl, {
              method: 'GET',
              headers: {
                'Content-Type': 'application/json',
                'X-User-ID': userId,
              },
            });
            
            if (tmdbResponse?.ok) {
              const tmdbData = await tmdbResponse.json();
              hasTmdbKey = tmdbData.data?.has_key || false;
            }
          }
        } catch (tmdbError) {
          // Ne logger que en mode développement
          if (import.meta.env.DEV) {
            console.log('[SETUP STATUS] Backend non accessible pour vérifier la clé TMDB');
          }
        }

        // Vérifier si des utilisateurs existent dans la DB locale
        let hasUsers = false;
        try {
          const backendApiUrl = `${backendUrl}/api/client/auth/users/count`;

          const backendResponse = await fetchWithTimeout(backendApiUrl, {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' },
          });

          if (backendResponse?.ok) {
            const backendData = await backendResponse.json().catch(() => ({}));
            const count = typeof backendData?.data === 'number' ? backendData.data : 0;
            hasUsers = count > 0;
          }
        } catch (error) {
          // Ne logger que en mode développement
          if (import.meta.env.DEV) {
            console.log('[SETUP STATUS] Backend non accessible pour vérifier les utilisateurs');
          }
        }

        // Vérifier si un emplacement de téléchargement est configuré (depuis localStorage)
        const { PreferencesManager } = await import('../../../../lib/client/storage.js');
        const downloadLocation = PreferencesManager.getDownloadLocation();
        const hasDownloadLocation = downloadLocation !== null && downloadLocation.trim() !== '';

        return {
          backendReachable,
          hasIndexers,
          hasTmdbKey,
          hasUsers,
          hasDownloadLocation,
        };
      })();

    // Timeout global de 4 secondes
    const timeoutPromise = new Promise<{ backendReachable: boolean; hasIndexers: boolean; hasTmdbKey: boolean; hasUsers: boolean; hasDownloadLocation: boolean }>((resolve) => {
      setTimeout(() => {
        // Ne logger que en mode développement
        if (import.meta.env.DEV) {
          console.log('[SETUP STATUS] Timeout global, retour des valeurs par défaut (backend non accessible)');
        }
        resolve({
          backendReachable: false,
          hasIndexers: false,
          hasTmdbKey: false,
          hasUsers: false,
          hasDownloadLocation: false,
        });
      }, 4000);
    });

    const { backendReachable, hasIndexers, hasTmdbKey, hasUsers, hasDownloadLocation } = await Promise.race([
      statusCheckPromise,
      timeoutPromise,
    ]);

    // Le backend est toujours configuré (il est géré côté client via localStorage)
    const hasBackendConfig = true;

    // Vérifier si des torrents existent (optionnel)
    const hasTorrents = false;

    // Important:
    // - ne pas forcer le wizard si le backend n'est pas joignable (reboot / démarrage)
    // - ne pas forcer le wizard uniquement parce qu'on ne peut pas vérifier TMDB sans userId
    //   (ex: pas encore connecté / token manquant). TMDB est une config "par utilisateur".
    const needsSetup = backendReachable
      ? (!hasUsers || !hasIndexers || !hasBackendConfig)
      : false;

    const setupStatus: SetupStatus = {
      needsSetup,
      hasUsers,
      hasIndexers,
      hasBackendConfig,
      hasTmdbKey,
      hasTorrents,
      hasDownloadLocation,
      backendReachable,
    };

    return new Response(
      JSON.stringify({
        success: true,
        data: setupStatus,
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('[SETUP STATUS] ❌ Erreur ou timeout:', error);
    
    // Même en cas d'erreur, retourner un statut par défaut pour éviter que le client reste bloqué
    const defaultStatus: SetupStatus = {
      // "Inconnu" -> ne pas forcer /setup, sinon wizard fantôme après reboot
      needsSetup: false,
      hasUsers: false,
      hasIndexers: false,
      hasBackendConfig: true,
      hasTmdbKey: false,
      hasTorrents: false,
      hasDownloadLocation: false,
      backendReachable: false,
    };

    return new Response(
      JSON.stringify({
        success: true,
        data: defaultStatus,
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
};
