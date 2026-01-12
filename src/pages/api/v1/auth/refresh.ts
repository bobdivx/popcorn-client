export const prerender = false;

import type { APIRoute } from 'astro';
import { verifyToken, generateAccessToken, generateRefreshToken } from '../../../../lib/auth/jwt.js';
import { getTursoClient } from '../../../../lib/db/turso-client.js';
import { getDb } from '../../../../lib/db/client.js';
import { z } from 'zod';

const refreshSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token requis'),
});

/**
 * API de rafraîchissement de token pour le client
 */
export const POST: APIRoute = async ({ request }) => {
  try {
    // Récupérer l'adresse IP du client
    const clientIp = request.headers.get('x-forwarded-for') || 
                     request.headers.get('x-real-ip') || 
                     'unknown';
    
    const body = await request.json();
    const validation = refreshSchema.safeParse(body);

    if (!validation.success) {
      console.log('[REFRESH] ❌ Validation échouée - IP:', clientIp);
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

    const { refreshToken } = validation.data;

    // Vérifier le refresh token
    const payload = verifyToken(refreshToken);
    
    if (!payload) {
      console.log('[REFRESH] ❌ Token invalide ou expiré - IP:', clientIp);
      return new Response(
        JSON.stringify({
          success: false,
          error: 'InvalidToken',
          message: 'Refresh token invalide ou expiré',
        }),
        {
          status: 401,
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );
    }

    // Vérifier que c'est bien un refresh token (pas un access token)
    // Le payload devrait avoir un type 'refresh' ou on vérifie via l'expiration
    const userId = payload.userId || payload.id;
    const email = (payload as any).email;

    if (!userId) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'InvalidToken',
          message: 'Token invalide',
        }),
        {
          status: 401,
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );
    }

    // Vérifier que l'utilisateur existe toujours
    // Essayer d'abord Turso, puis fallback sur la base locale
    const tursoClient = getTursoClient();
    let userResult;
    let userEmail = email || '';
    
    if (tursoClient) {
      // Utiliser Turso si disponible
      userResult = await tursoClient.execute({
        sql: 'SELECT id, email FROM cloud_accounts WHERE id = ?',
        args: [userId],
      });
    } else {
      // Fallback sur la base locale SQLite
      const localDb = getDb();
      userResult = await localDb.execute({
        sql: 'SELECT id, email FROM users WHERE id = ?',
        args: [userId],
      });
    }

    if (userResult && userResult.rows.length > 0) {
      const user = userResult.rows[0];
      userEmail = (user.email as string) || email || '';
    } else if (!tursoClient) {
      // Si pas de Turso et pas trouvé dans la base locale, générer quand même les tokens
      // (pour permettre le refresh même si l'utilisateur n'est pas dans la DB)
    } else {
      // Si Turso est disponible mais utilisateur non trouvé
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

    // Générer de nouveaux tokens avec durées différentes
    const newAccessToken = generateAccessToken({
      userId: userId,
      username: email || '',
    });

    const newRefreshToken = generateRefreshToken({
      userId: userId,
      username: email || '',
    });

    console.log('[REFRESH] ✅ Token rafraîchi pour User ID:', userId, 'Email:', email || 'N/A', 'IP:', clientIp);

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          accessToken: newAccessToken,
          refreshToken: newRefreshToken,
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
    console.error('Erreur lors du rafraîchissement du token:', error);
    
    return new Response(
      JSON.stringify({
        success: false,
        error: 'InternalServerError',
        message: error instanceof Error ? error.message : 'Erreur inconnue',
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
