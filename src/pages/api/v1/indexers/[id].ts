import type { APIRoute } from 'astro';
import { requireAuth } from '../../../../lib/auth/middleware';
import { getTursoClient } from '../../../../lib/db/turso';
import { z } from 'zod';

export const prerender = false;

// GET /api/v1/indexers/:id - Récupérer un indexer
export const GET: APIRoute = async (context) => {
  const authResult = await requireAuth(context);

  if (authResult instanceof Response) {
    return authResult;
  }

  try {
    const { userId } = authResult.user;
    const { id } = context.params;

    if (!id) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'ValidationError',
          message: 'ID requis',
        }),
        {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );
    }

    const client = getTursoClient();

    const result = await client.execute({
      sql: `SELECT id, name, base_url, api_key, jackett_indexer_name, is_enabled, 
                   is_default, priority, fallback_indexer_id, created_at, updated_at
            FROM cloud_indexers 
            WHERE account_id = ? AND id = ?`,
      args: [userId, id],
    });

    if (result.rows.length === 0) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'NotFound',
          message: 'Indexer non trouvé',
        }),
        {
          status: 404,
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );
    }

    const row = result.rows[0];
    const indexer = {
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
    };

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          indexer,
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
    console.error('[Indexer Get] Erreur:', error);
    
    return new Response(
      JSON.stringify({
        success: false,
        error: 'InternalServerError',
        message: 'Erreur lors de la récupération de l\'indexer',
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

// PUT /api/v1/indexers/:id - Mettre à jour un indexer
export const PUT: APIRoute = async (context) => {
  const authResult = await requireAuth(context);

  if (authResult instanceof Response) {
    return authResult;
  }

  try {
    const { userId } = authResult.user;
    const { id } = context.params;

    if (!id) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'ValidationError',
          message: 'ID requis',
        }),
        {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );
    }

    const body = await context.request.json();

    const indexerSchema = z.object({
      name: z.string().min(1).optional(),
      base_url: z.string().url().optional(),
      api_key: z.string().nullable().optional(),
      jackett_indexer_name: z.string().nullable().optional(),
      is_enabled: z.boolean().optional(),
      is_default: z.boolean().optional(),
      priority: z.number().optional(),
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

    // Vérifier que l'indexer existe
    const existingResult = await client.execute({
      sql: 'SELECT id FROM cloud_indexers WHERE account_id = ? AND id = ?',
      args: [userId, id],
    });

    if (existingResult.rows.length === 0) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'NotFound',
          message: 'Indexer non trouvé',
        }),
        {
          status: 404,
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );
    }

    // Si c'est l'indexer par défaut, désactiver les autres
    if (data.is_default === true) {
      await client.execute({
        sql: 'UPDATE cloud_indexers SET is_default = 0 WHERE account_id = ? AND is_default = 1 AND id != ?',
        args: [userId, id],
      });
    }

    // Construire la requête de mise à jour dynamiquement
    const updates: string[] = [];
    const args: any[] = [];

    if (data.name !== undefined) {
      updates.push('name = ?');
      args.push(data.name);
    }
    if (data.base_url !== undefined) {
      updates.push('base_url = ?');
      args.push(data.base_url);
    }
    if (data.api_key !== undefined) {
      updates.push('api_key = ?');
      args.push(data.api_key);
    }
    if (data.jackett_indexer_name !== undefined) {
      updates.push('jackett_indexer_name = ?');
      args.push(data.jackett_indexer_name);
    }
    if (data.is_enabled !== undefined) {
      updates.push('is_enabled = ?');
      args.push(data.is_enabled ? 1 : 0);
    }
    if (data.is_default !== undefined) {
      updates.push('is_default = ?');
      args.push(data.is_default ? 1 : 0);
    }
    if (data.priority !== undefined) {
      updates.push('priority = ?');
      args.push(data.priority);
    }
    if (data.fallback_indexer_id !== undefined) {
      updates.push('fallback_indexer_id = ?');
      args.push(data.fallback_indexer_id);
    }

    if (updates.length === 0) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'ValidationError',
          message: 'Aucun champ à mettre à jour',
        }),
        {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );
    }

    updates.push('updated_at = ?');
    args.push(Date.now());

    args.push(userId, id);

    await client.execute({
      sql: `UPDATE cloud_indexers SET ${updates.join(', ')} WHERE account_id = ? AND id = ?`,
      args,
    });

    // Récupérer l'indexer mis à jour
    const result = await client.execute({
      sql: `SELECT id, name, base_url, api_key, jackett_indexer_name, is_enabled, 
                   is_default, priority, fallback_indexer_id, created_at, updated_at
            FROM cloud_indexers 
            WHERE account_id = ? AND id = ?`,
      args: [userId, id],
    });

    const row = result.rows[0];
    const indexer = {
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
    };

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          indexer,
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
    console.error('[Indexer Update] Erreur:', error);
    
    return new Response(
      JSON.stringify({
        success: false,
        error: 'InternalServerError',
        message: 'Erreur lors de la mise à jour de l\'indexer',
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

// DELETE /api/v1/indexers/:id - Supprimer un indexer
export const DELETE: APIRoute = async (context) => {
  const authResult = await requireAuth(context);

  if (authResult instanceof Response) {
    return authResult;
  }

  try {
    const { userId } = authResult.user;
    const { id } = context.params;

    if (!id) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'ValidationError',
          message: 'ID requis',
        }),
        {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );
    }

    const client = getTursoClient();

    // Vérifier que l'indexer existe
    const existingResult = await client.execute({
      sql: 'SELECT id FROM cloud_indexers WHERE account_id = ? AND id = ?',
      args: [userId, id],
    });

    if (existingResult.rows.length === 0) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'NotFound',
          message: 'Indexer non trouvé',
        }),
        {
          status: 404,
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );
    }

    // Supprimer l'indexer
    await client.execute({
      sql: 'DELETE FROM cloud_indexers WHERE account_id = ? AND id = ?',
      args: [userId, id],
    });

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          message: 'Indexer supprimé avec succès',
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
    console.error('[Indexer Delete] Erreur:', error);
    
    return new Response(
      JSON.stringify({
        success: false,
        error: 'InternalServerError',
        message: 'Erreur lors de la suppression de l\'indexer',
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