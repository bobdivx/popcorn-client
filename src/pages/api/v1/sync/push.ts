import type { APIRoute } from 'astro';
import { requireAuth } from '../../../../lib/auth/middleware';
import { getTursoClient } from '../../../../lib/db/turso';
import { z } from 'zod';

export const prerender = false;

const indexerSchema = z.object({
  id: z.string(),
  name: z.string(),
  base_url: z.string().url(),
  api_key: z.string().nullable().optional(),
  jackett_indexer_name: z.string().nullable().optional(),
  is_enabled: z.boolean().default(true),
  is_default: z.boolean().default(false),
  priority: z.number().default(0),
  fallback_indexer_id: z.string().nullable().optional(),
  created_at: z.number().optional(),
  updated_at: z.number().optional(),
});

const pushSchema = z.object({
  indexers: z.array(indexerSchema).optional(),
  settings: z.array(z.object({
    user_id: z.string(),
    tmdb_api_key: z.string().nullable().optional(),
    updated_at: z.number().optional(),
  })).optional(),
  backend_config: z.object({
    backend_url: z.string().url(),
    updated_at: z.number().optional(),
  }).optional(),
});

export const POST: APIRoute = async (context) => {
  const authResult = await requireAuth(context);

  // Si requireAuth retourne une Response, c'est une erreur
  if (authResult instanceof Response) {
    return authResult;
  }

  try {
    const { userId } = authResult.user;
    const body = await context.request.json();
    const validation = pushSchema.safeParse(body);

    if (!validation.success) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'ValidationError',
          message: validation.error.errors[0].message,
        }),
        {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );
    }

    const data = validation.data;
    const client = getTursoClient();
    const now = Date.now();

    // Synchroniser les indexers
    if (data.indexers && data.indexers.length > 0) {
      // Supprimer les indexers existants pour cet account
      await client.execute({
        sql: 'DELETE FROM cloud_indexers WHERE account_id = ?',
        args: [userId],
      });

      // Insérer les nouveaux indexers
      for (const indexer of data.indexers) {
        await client.execute({
          sql: `INSERT OR REPLACE INTO cloud_indexers 
                (account_id, id, name, base_url, api_key, jackett_indexer_name, 
                 is_enabled, is_default, priority, fallback_indexer_id, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          args: [
            userId,
            indexer.id,
            indexer.name,
            indexer.base_url,
            indexer.api_key || null,
            indexer.jackett_indexer_name || null,
            indexer.is_enabled ? 1 : 0,
            indexer.is_default ? 1 : 0,
            indexer.priority || 0,
            indexer.fallback_indexer_id || null,
            indexer.created_at || now,
            indexer.updated_at || now,
          ],
        });
      }
    }

    // Synchroniser les settings
    if (data.settings && data.settings.length > 0) {
      for (const setting of data.settings) {
        await client.execute({
          sql: `INSERT OR REPLACE INTO cloud_user_settings 
                (account_id, user_id, tmdb_api_key, updated_at)
                VALUES (?, ?, ?, ?)`,
          args: [
            userId,
            setting.user_id,
            setting.tmdb_api_key || null,
            setting.updated_at || now,
          ],
        });
      }
    }

    // Synchroniser la config backend
    if (data.backend_config) {
      await client.execute({
        sql: `INSERT OR REPLACE INTO cloud_backend_config 
              (account_id, backend_url, updated_at)
              VALUES (?, ?, ?)`,
        args: [
          userId,
          data.backend_config.backend_url,
          data.backend_config.updated_at || now,
        ],
      });
    }

    // Mettre à jour last_sync_at dans cloud_accounts
    await client.execute({
      sql: 'UPDATE cloud_accounts SET last_sync_at = ? WHERE id = ?',
      args: [now, userId],
    });

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          message: 'Configuration synchronisée avec succès',
          synced_at: now,
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
    console.error('[Sync Push] Erreur:', error);
    
    return new Response(
      JSON.stringify({
        success: false,
        error: 'InternalServerError',
        message: 'Erreur lors de la synchronisation de la configuration',
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