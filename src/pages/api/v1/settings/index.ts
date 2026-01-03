import type { APIRoute } from 'astro';
import { requireAuth } from '../../../../lib/auth/middleware';
import { getTursoClient } from '../../../../lib/db/turso';
import { z } from 'zod';

export const prerender = false;

// GET /api/v1/settings - Récupérer les paramètres utilisateur
export const GET: APIRoute = async (context) => {
  const authResult = await requireAuth(context);

  if (authResult instanceof Response) {
    return authResult;
  }

  try {
    const { userId } = authResult.user;
    const client = getTursoClient();

    const result = await client.execute({
      sql: `SELECT user_id, tmdb_api_key, updated_at
            FROM cloud_user_settings 
            WHERE account_id = ?`,
      args: [userId],
    });

    const settings = result.rows.map(row => ({
      user_id: row.user_id,
      tmdb_api_key: row.tmdb_api_key,
      updated_at: row.updated_at,
    }));

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          settings,
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
    console.error('[Settings Get] Erreur:', error);
    
    return new Response(
      JSON.stringify({
        success: false,
        error: 'InternalServerError',
        message: 'Erreur lors de la récupération des paramètres',
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

// PUT /api/v1/settings - Mettre à jour les paramètres utilisateur
export const PUT: APIRoute = async (context) => {
  const authResult = await requireAuth(context);

  if (authResult instanceof Response) {
    return authResult;
  }

  try {
    const { userId } = authResult.user;
    const body = await context.request.json();

    const settingsSchema = z.object({
      user_id: z.string().min(1, 'user_id requis'),
      tmdb_api_key: z.string().nullable().optional(),
    });

    const validation = settingsSchema.safeParse(body);

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

    await client.execute({
      sql: `INSERT OR REPLACE INTO cloud_user_settings 
            (account_id, user_id, tmdb_api_key, updated_at)
            VALUES (?, ?, ?, ?)`,
      args: [
        userId,
        data.user_id,
        data.tmdb_api_key || null,
        now,
      ],
    });

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          user_id: data.user_id,
          tmdb_api_key: data.tmdb_api_key,
          updated_at: now,
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
    console.error('[Settings Update] Erreur:', error);
    
    return new Response(
      JSON.stringify({
        success: false,
        error: 'InternalServerError',
        message: 'Erreur lors de la mise à jour des paramètres',
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