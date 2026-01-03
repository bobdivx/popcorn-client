import type { APIRoute } from 'astro';
import { requireAuth } from '../../../../lib/auth/middleware';
import { getTursoClient } from '../../../../lib/db/turso';
import { z } from 'zod';

export const prerender = false;

// GET /api/v1/backend/config - Récupérer la configuration backend
export const GET: APIRoute = async (context) => {
  const authResult = await requireAuth(context);

  if (authResult instanceof Response) {
    return authResult;
  }

  try {
    const { userId } = authResult.user;
    const client = getTursoClient();

    const result = await client.execute({
      sql: 'SELECT backend_url, updated_at FROM cloud_backend_config WHERE account_id = ?',
      args: [userId],
    });

    if (result.rows.length === 0) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'NotFound',
          message: 'Configuration backend non trouvée',
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
          backend_url: row.backend_url,
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
    console.error('[Backend Config Get] Erreur:', error);
    
    return new Response(
      JSON.stringify({
        success: false,
        error: 'InternalServerError',
        message: 'Erreur lors de la récupération de la configuration backend',
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

// PUT /api/v1/backend/config - Mettre à jour la configuration backend
export const PUT: APIRoute = async (context) => {
  const authResult = await requireAuth(context);

  if (authResult instanceof Response) {
    return authResult;
  }

  try {
    const { userId } = authResult.user;
    const body = await context.request.json();

    const configSchema = z.object({
      backend_url: z.string().url('URL backend invalide'),
    });

    const validation = configSchema.safeParse(body);

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
      sql: `INSERT OR REPLACE INTO cloud_backend_config 
            (account_id, backend_url, updated_at)
            VALUES (?, ?, ?)`,
      args: [
        userId,
        data.backend_url,
        now,
      ],
    });

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          backend_url: data.backend_url,
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
    console.error('[Backend Config Update] Erreur:', error);
    
    return new Response(
      JSON.stringify({
        success: false,
        error: 'InternalServerError',
        message: 'Erreur lors de la mise à jour de la configuration backend',
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