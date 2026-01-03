import type { APIRoute } from 'astro';
import { requireAuth } from '../../../../lib/auth/middleware';
import { getTursoClient } from '../../../../lib/db/turso';
import { z } from 'zod';
import { randomBytes } from 'crypto';

export const prerender = false;

function generateId(): string {
  return randomBytes(16).toString('hex');
}

// GET /api/v1/indexers - Liste des indexers
export const GET: APIRoute = async (context) => {
  const authResult = await requireAuth(context);

  if (authResult instanceof Response) {
    return authResult;
  }

  try {
    const { userId } = authResult.user;
    const client = getTursoClient();

    const result = await client.execute({
      sql: `SELECT id, name, base_url, api_key, jackett_indexer_name, is_enabled, 
                   is_default, priority, fallback_indexer_id, created_at, updated_at
            FROM cloud_indexers 
            WHERE account_id = ? 
            ORDER BY priority DESC, name ASC`,
      args: [userId],
    });

    const indexers = result.rows.map(row => ({
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

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          indexers,
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
    console.error('[Indexers List] Erreur:', error);
    
    return new Response(
      JSON.stringify({
        success: false,
        error: 'InternalServerError',
        message: 'Erreur lors de la récupération des indexers',
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

// POST /api/v1/indexers - Créer un indexer
export const POST: APIRoute = async (context) => {
  const authResult = await requireAuth(context);

  if (authResult instanceof Response) {
    return authResult;
  }

  try {
    const { userId } = authResult.user;
    const body = await context.request.json();

    const indexerSchema = z.object({
      name: z.string().min(1, 'Le nom est requis'),
      base_url: z.string().url('URL invalide'),
      api_key: z.string().nullable().optional(),
      jackett_indexer_name: z.string().nullable().optional(),
      is_enabled: z.boolean().default(true),
      is_default: z.boolean().default(false),
      priority: z.number().default(0),
      fallback_indexer_id: z.string().nullable().optional(),
    });

    const validation = indexerSchema.safeParse(body);

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
    const indexerId = generateId();

    // Si c'est l'indexer par défaut, désactiver les autres
    if (data.is_default) {
      await client.execute({
        sql: 'UPDATE cloud_indexers SET is_default = 0 WHERE account_id = ? AND is_default = 1',
        args: [userId],
      });
    }

    // Créer l'indexer
    await client.execute({
      sql: `INSERT INTO cloud_indexers 
            (account_id, id, name, base_url, api_key, jackett_indexer_name, 
             is_enabled, is_default, priority, fallback_indexer_id, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      args: [
        userId,
        indexerId,
        data.name,
        data.base_url,
        data.api_key || null,
        data.jackett_indexer_name || null,
        data.is_enabled ? 1 : 0,
        data.is_default ? 1 : 0,
        data.priority || 0,
        data.fallback_indexer_id || null,
        now,
        now,
      ],
    });

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          id: indexerId,
          ...data,
          created_at: now,
          updated_at: now,
        },
      }),
      {
        status: 201,
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );
  } catch (error) {
    console.error('[Indexers Create] Erreur:', error);
    
    return new Response(
      JSON.stringify({
        success: false,
        error: 'InternalServerError',
        message: 'Erreur lors de la création de l\'indexer',
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