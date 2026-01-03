import type { APIRoute } from 'astro';
import { requireAuth } from '../../../../lib/auth/middleware';
import { getTursoClient } from '../../../../lib/db/turso';

export const prerender = false;

export const GET: APIRoute = async (context) => {
  const authResult = await requireAuth(context);

  // Si requireAuth retourne une Response, c'est une erreur
  if (authResult instanceof Response) {
    return authResult;
  }

  try {
    const { userId } = authResult.user;
    const client = getTursoClient();

    // Récupérer les indexers
    const indexersResult = await client.execute({
      sql: `SELECT id, name, base_url, api_key, jackett_indexer_name, is_enabled, 
                   is_default, priority, fallback_indexer_id, created_at, updated_at
            FROM cloud_indexers 
            WHERE account_id = ? 
            ORDER BY priority DESC, name ASC`,
      args: [userId],
    });

    const indexers = indexersResult.rows.map(row => ({
      id: row.id,
      name: row.name,
      base_url: row.base_url,
      api_key: row.api_key,
      jackett_indexer_name: row.jackett_indexer_name,
      is_enabled: row.is_enabled === 1,
      is_default: row.is_default === 1,
      priority: row.priority,
      fallback_indexer_id: row.fallback_indexer_id,
      created_at: row.created_at,
      updated_at: row.updated_at,
    }));

    // Récupérer les settings utilisateur
    const settingsResult = await client.execute({
      sql: `SELECT user_id, tmdb_api_key, updated_at
            FROM cloud_user_settings 
            WHERE account_id = ?`,
      args: [userId],
    });

    const settings = settingsResult.rows.map(row => ({
      user_id: row.user_id,
      tmdb_api_key: row.tmdb_api_key,
      updated_at: row.updated_at,
    }));

    // Récupérer la config backend
    const backendConfigResult = await client.execute({
      sql: `SELECT backend_url, updated_at
            FROM cloud_backend_config 
            WHERE account_id = ?`,
      args: [userId],
    });

    const backendConfig = backendConfigResult.rows.length > 0 ? {
      backend_url: backendConfigResult.rows[0].backend_url,
      updated_at: backendConfigResult.rows[0].updated_at,
    } : null;

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          indexers,
          settings,
          backend_config: backendConfig,
          synced_at: Date.now(),
        },
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );
  } catch (error) {
    console.error('[Sync Pull] Erreur:', error);
    
    return new Response(
      JSON.stringify({
        success: false,
        error: 'InternalServerError',
        message: 'Erreur lors de la récupération de la configuration',
      }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );
  }
};