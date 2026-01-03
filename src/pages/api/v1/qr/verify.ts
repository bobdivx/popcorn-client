import type { APIRoute } from 'astro';
import { getTursoClient } from '../../../../lib/db/turso';
import { getVerifiedQRLoginToken } from './generate';
import { generateAccessToken, generateRefreshToken } from '../../../../lib/auth/jwt';
import { z } from 'zod';

export const prerender = false;

const verifySchema = z.object({
  token: z.string().min(1, 'Token requis'),
});

export const POST: APIRoute = async ({ request, cookies }) => {
  try {
    const body = await request.json();
    const validation = verifySchema.safeParse(body);

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

    const { token } = validation.data;

    // Récupérer les données du token vérifié (one-time use)
    const tokenData = getVerifiedQRLoginToken(token);

    if (!tokenData) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'InvalidToken',
          message: 'Token QR invalide, expiré ou déjà utilisé',
        }),
        {
          status: 401,
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );
    }

    const client = getTursoClient();

    // Vérifier que le compte existe
    const accountResult = await client.execute({
      sql: 'SELECT id, email FROM cloud_accounts WHERE id = ?',
      args: [tokenData.accountId],
    });

    if (accountResult.rows.length === 0) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'AccountNotFound',
          message: 'Compte non trouvé',
        }),
        {
          status: 404,
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );
    }

    const account = accountResult.rows[0];
    const accountId = account.id as string;
    const email = account.email as string;

    // Générer les tokens JWT
    const accessToken = generateAccessToken(accountId, email);
    const refreshToken = generateRefreshToken(accountId, email);

    // Définir le cookie refresh token
    cookies.set('refresh_token', refreshToken, {
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
          accountId,
          email,
          accessToken,
          refreshToken,
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
    console.error('[QR Verify] Erreur:', error);
    
    return new Response(
      JSON.stringify({
        success: false,
        error: 'InternalServerError',
        message: 'Erreur lors de la vérification du QR code',
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