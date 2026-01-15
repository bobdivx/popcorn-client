export const prerender = false;

import type { APIRoute } from 'astro';
import { verifyToken } from '../../../../lib/auth/jwt.js';
import { PreferencesManager } from '../../../../lib/client/storage.js';

/**
 * GET /api/v1/setup/export-config
 * Exporte la configuration complète (indexers, TMDB key, download location, sync settings)
 * Nécessite une authentification
 */
export const GET: APIRoute = async ({ request }) => {
  try {
    // Vérifier l'authentification
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Unauthorized',
          message: 'Token d\'authentification requis',
        }),
        {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    const token = authHeader.substring(7);
    const payload = verifyToken(token);

    if (!payload || !payload.userId) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Unauthorized',
          message: 'Token invalide',
        }),
        {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    // Récupérer tous les indexers depuis le backend
    const { getBackendUrlAsync } = await import('../../../../lib/backend-url.js');
    const backendUrl = await getBackendUrlAsync();
    const backendApiUrl = `${backendUrl}/api/client/admin/indexers`;
    
    const indexersResponse = await fetch(backendApiUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    let indexers: any[] = [];
    if (indexersResponse.ok) {
      const indexersData = await indexersResponse.json();
      indexers = (indexersData.data || []).map((idx: any) => ({
        name: idx.name,
        baseUrl: idx.base_url,
        apiKey: idx.api_key || null,
        jackettIndexerName: idx.jackett_indexer_name || null,
        isEnabled: idx.is_enabled === 1,
        isDefault: idx.is_default === 1,
        priority: idx.priority || 0,
        indexerTypeId: idx.indexer_type_id || null,
        configJson: idx.config_json || null,
      }));
    } else {
      console.warn('[EXPORT CONFIG] ⚠️ Erreur lors de la récupération des indexers depuis le backend');
    }

    // Récupérer la clé TMDB depuis le backend (si utilisateur authentifié)
    let tmdbApiKey: string | null = null;
    try {
      const authHeader = request.headers.get('Authorization');
      if (authHeader && authHeader.startsWith('Bearer ')) {
        const { verifyToken } = await import('../../../../lib/auth/jwt.js');
        const token = authHeader.substring(7);
        const payload = verifyToken(token);
        if (payload) {
          const userId = payload.userId || payload.id || null;
          if (userId) {
            const { getBackendUrlAsync } = await import('../../../../lib/backend-url.js');
            const backendUrl = await getBackendUrlAsync();
            const backendApiUrl = `${backendUrl}/api/tmdb/key`;
            
            const tmdbResponse = await fetch(backendApiUrl, {
              method: 'GET',
              headers: {
                'Content-Type': 'application/json',
                'X-User-ID': userId,
              },
            });
            
            // Note: Le backend ne retourne pas la clé complète pour la sécurité
            // On retourne juste un indicateur
            if (tmdbResponse.ok) {
              const tmdbData = await tmdbResponse.json();
              // On ne peut pas récupérer la clé complète depuis le backend pour la sécurité
              // On retourne null et l'utilisateur devra la reconfigurer
              tmdbApiKey = tmdbData.data?.has_key ? '***' : null;
            }
          }
        }
      }
    } catch (tmdbError) {
      console.warn('[EXPORT CONFIG] ⚠️ Erreur lors de la récupération TMDB depuis le backend:', tmdbError);
    }

    // Récupérer le download location
    const downloadLocation = PreferencesManager.getDownloadLocation();

    // Récupérer les paramètres de synchronisation torrents depuis le backend
    let syncSettings: any = null;
    try {
      const { getBackendUrlAsync } = await import('../../../../lib/backend-url.js');
      const backendUrl = await getBackendUrlAsync();
      const syncSettingsUrl = `${backendUrl}/api/sync/settings`;

      const syncRes = await fetch(syncSettingsUrl, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (syncRes.ok) {
        const syncData = await syncRes.json();
        const s = syncData?.data;
        if (s) {
          syncSettings = {
            syncEnabled: (s.is_enabled ?? 0) === 1,
            syncFrequencyMinutes: s.sync_frequency_minutes ?? undefined,
            maxTorrentsPerCategory: s.max_torrents_per_category ?? undefined,
            rssIncrementalEnabled: (s.rss_incremental_enabled ?? 0) === 1,
            syncQueriesFilms: Array.isArray(s.sync_queries_films) ? s.sync_queries_films : undefined,
            syncQueriesSeries: Array.isArray(s.sync_queries_series) ? s.sync_queries_series : undefined,
          };
        }
      } else {
        console.warn('[EXPORT CONFIG] ⚠️ Erreur lors de la récupération des paramètres sync:', syncRes.status);
      }
    } catch (syncErr) {
      console.warn('[EXPORT CONFIG] ⚠️ Erreur lors de la récupération des paramètres sync:', syncErr);
    }

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          indexers,
          tmdbApiKey,
          downloadLocation,
          syncSettings,
        },
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('[EXPORT CONFIG] ❌ Erreur:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Erreur inconnue',
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
};
