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

    // Récupérer les informations complètes de l'utilisateur
    const userResult = await client.execute({
      sql: 'SELECT id, email, created_at, updated_at FROM cloud_accounts WHERE id = ?',
      args: [userId],
    });

    if (userResult.rows.length === 0) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'UserNotFound',
          message: 'Utilisateur non trouvé',
        }),
        {
          status: 404,
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );
    }

    const user = userResult.rows[0];

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          user: {
            id: user.id,
            email: user.email,
            created_at: user.created_at,
            updated_at: user.updated_at,
          },
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
    console.error('Erreur lors de la récupération du profil:', error);
    
    return new Response(
      JSON.stringify({
        success: false,
        error: 'InternalServerError',
        message: 'Une erreur est survenue lors de la récupération du profil',
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