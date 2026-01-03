import type { APIRoute } from 'astro';
import { requireAuth } from '../../../../lib/auth/middleware';
import { getTursoClient } from '../../../../lib/db/turso';
import { z } from 'zod';

export const prerender = false;

// GET /api/v1/settings/tmdb - Récupérer la clé API TMDB
export const GET: APIRoute = async (context) => {
  const authResult = await requireAuth(context);

  if (authResult instanceof Response) {
    return authResult;
  }

  try {
    const { userId } = authResult.user;
    const user_id = context.url.searchParams.get('user_id');

    if (!user_id) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'ValidationError',
          message: 'user_id requis en paramètre',
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
      sql: 'SELECT tmdb_api_key, updated_at FROM cloud_user_settings WHERE account_id = ? AND user_id = ?',
      args: [userId, user_id],
    });

    if (result.rows.length === 0) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'NotFound',
          message: 'Paramètres non trouvés pour cet utilisateur',
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

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          tmdb_api_key: row.tmdb_api_key,
          updated_at: row.updated_at,
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
    console.error('[Settings TMDB Get] Erreur:', error);
    
    return new Response(
      JSON.stringify({
        success: false,
        error: 'InternalServerError',
        message: 'Erreur lors de la récupération de la clé API TMDB',
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

// PUT /api/v1/settings/tmdb - Mettre à jour la clé API TMDB
export const PUT: APIRoute = async (context) => {
  const authResult = await requireAuth(context);

  if (authResult instanceof Response) {
    return authResult;
  }

  try {
    const { userId } = authResult.user;
    const body = await context.request.json();

    const tmdbSchema = z.object({
      user_id: z.string().min(1, 'user_id requis'),
      tmdb_api_key: z.string().nullable().optional(),
    });

    const validation = tmdbSchema.safeParse(body);

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
    console.error('[Settings TMDB Update] Erreur:', error);
    
    return new Response(
      JSON.stringify({
        success: false,
        error: 'InternalServerError',
        message: 'Erreur lors de la mise à jour de la clé API TMDB',
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