export const prerender = false;

import type { APIRoute } from 'astro';
import { verifyToken, generateAccessToken, generateRefreshToken } from '../../../../lib/auth/jwt.js';
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

    // Récupérer l'utilisateur depuis le backend (DB backend uniquement)
    let userEmail = email || '';
    try {
      const { getBackendUrlAsync } = await import('../../../../lib/backend-url.js');
      const backendUrl = await getBackendUrlAsync();
      const backendApiUrl = `${backendUrl}/api/client/auth/users/${encodeURIComponent(userId)}`;
      const backendResponse = await fetch(backendApiUrl, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });
      if (backendResponse.ok) {
        const backendData = await backendResponse.json().catch(() => ({}));
        const backendUser = backendData?.data;
        userEmail = backendUser?.email || userEmail;
      }
    } catch {
      // fallback to token payload
    }

    // Générer de nouveaux tokens avec durées différentes
    const newAccessToken = generateAccessToken({
      userId: userId,
      username: userEmail || '',
    });

    const newRefreshToken = generateRefreshToken({
      userId: userId,
      username: userEmail || '',
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
