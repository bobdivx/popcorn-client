import type { APIRoute } from 'astro';
import { requireAuth } from '../../../../lib/auth/middleware';
import { getTursoClient } from '../../../../lib/db/turso';
import { verifyQRLoginToken, markQRLoginTokenAsVerified } from './generate';
import { z } from 'zod';

export const prerender = false;

const submitSchema = z.object({
  token: z.string().min(1, 'Token requis'),
});

export const POST: APIRoute = async (context) => {
  const authResult = await requireAuth(context);

  // Si requireAuth retourne une Response, c'est une erreur
  if (authResult instanceof Response) {
    return authResult;
  }

  try {
    const { userId, email } = authResult.user;
    const body = await context.request.json();
    const validation = submitSchema.safeParse(body);

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

    // Vérifier que le token existe et n'est pas expiré
    if (!verifyQRLoginToken(token)) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'InvalidToken',
          message: 'Token QR invalide ou expiré',
        }),
        {
          status: 401,
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );
    }

    // Vérifier que le compte existe dans la base de données
    const client = getTursoClient();
    const accountResult = await client.execute({
      sql: 'SELECT id, email FROM cloud_accounts WHERE id = ?',
      args: [userId],
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
    const accountEmail = account.email as string;

    // Vérifier que l'email correspond
    if (accountEmail !== email) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'AccountMismatch',
          message: 'Le compte ne correspond pas',
        }),
        {
          status: 403,
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );
    }

    // Marquer le token comme vérifié avec les données du compte
    const verified = markQRLoginTokenAsVerified(token, accountId, accountEmail);

    if (!verified) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'TokenAlreadyUsed',
          message: 'Token déjà utilisé',
        }),
        {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          message: 'QR code vérifié avec succès',
          token,
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
    console.error('[QR Submit] Erreur:', error);
    
    return new Response(
      JSON.stringify({
        success: false,
        error: 'InternalServerError',
        message: 'Erreur lors de la soumission du QR code',
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