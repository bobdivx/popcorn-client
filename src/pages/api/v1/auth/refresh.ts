import type { APIRoute } from 'astro';
import { verifyToken, generateAccessToken, generateRefreshToken, extractTokenFromHeader } from '../../../../lib/auth/jwt';
import { z } from 'zod';

export const prerender = false;

const refreshSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token requis'),
});

export const POST: APIRoute = async ({ request, cookies }) => {
  try {
    const body = await request.json();
    
    // Essayer de récupérer le refresh token depuis le body ou les cookies
    let refreshToken = body.refreshToken;
    
    if (!refreshToken) {
      refreshToken = cookies.get('refresh_token')?.value;
    }

    if (!refreshToken) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'InvalidToken',
          message: 'Refresh token manquant',
        }),
        {
          status: 401,
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );
    }

    // Vérifier le refresh token
    const decoded = verifyToken(refreshToken);

    if (decoded.type !== 'refresh') {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'InvalidToken',
          message: 'Type de token invalide',
        }),
        {
          status: 401,
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );
    }

    // Générer de nouveaux tokens
    const newAccessToken = generateAccessToken(decoded.userId, decoded.email);
    const newRefreshToken = generateRefreshToken(decoded.userId, decoded.email);

    // Mettre à jour le cookie refresh token
    cookies.set('refresh_token', newRefreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 60 * 60 * 24 * 30, // 30 jours
      path: '/',
    });

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
    const message = error instanceof Error ? error.message : 'Token invalide';
    
    return new Response(
      JSON.stringify({
        success: false,
        error: 'InvalidToken',
        message,
      }),
      {
        status: 401,
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );
  }
};