export const prerender = false;

import type { APIRoute } from 'astro';
import { verifyToken } from '../../../../lib/auth/jwt.js';
import { getTursoClient } from '../../../../lib/db/turso-client.js';
import { getDb } from '../../../../lib/db/client.js';

/**
 * API pour récupérer les informations de l'utilisateur connecté
 */
export const GET: APIRoute = async ({ request }) => {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return new Response(
      JSON.stringify({ success: false, error: 'Non authentifié' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    );
  }

  try {
    // Récupérer l'adresse IP du client
    const clientIp = request.headers.get('x-forwarded-for') || 
                     request.headers.get('x-real-ip') || 
                     'unknown';
    
    const token = authHeader.substring(7);
    const payload = verifyToken(token);
    
    if (!payload) {
      console.log('[AUTH] ❌ Token invalide - IP:', clientIp);
      return new Response(
        JSON.stringify({ success: false, error: 'Token invalide' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const userId = payload.userId || payload.id;
    const email = (payload as any).email;
    
    console.log('[AUTH] ✅ Accès authentifié - User ID:', userId, 'Email:', email || 'N/A', 'IP:', clientIp);

    if (!userId) {
      return new Response(
        JSON.stringify({ success: false, error: 'Token invalide' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Récupérer les informations utilisateur depuis la base de données
    // Essayer d'abord Turso, puis fallback sur la base locale
    const tursoClient = getTursoClient();
    let userResult;
    
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
      return new Response(
        JSON.stringify({
          success: true,
          data: {
            user: {
              id: user.id as string,
              email: user.email as string,
            },
          },
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    // Si pas de client ou utilisateur non trouvé, retourner les infos du token
    return new Response(
      JSON.stringify({
        success: true,
        data: {
          user: {
            id: userId,
            email: email || null,
          },
        },
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Erreur lors de la récupération des informations utilisateur:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : 'Erreur inconnue',
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
};
