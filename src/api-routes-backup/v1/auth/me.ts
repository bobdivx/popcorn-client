export const prerender = false;

import type { APIRoute } from 'astro';
import { verifyToken } from '../../../../lib/auth/jwt.js';

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

    // Récupérer l'utilisateur depuis le backend (DB backend uniquement)
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
        if (backendUser?.id) {
          return new Response(
            JSON.stringify({
              success: true,
              data: {
                user: {
                  id: backendUser.id,
                  email: backendUser.email ?? null,
                },
              },
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }
      }
    } catch {
      // fallback plus bas
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
