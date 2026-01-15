export const prerender = false;

import type { APIRoute } from 'astro';
import { verifyToken } from '../../../../lib/auth/jwt.js';

/**
 * POST /api/v1/sync/clear-torrents
 * Vide tous les torrents synchronisés de la base de données
 * Fait un proxy vers le backend Rust /api/sync/clear-torrents
 */
export const POST: APIRoute = async ({ request }) => {
  try {
    // Vérifier l'authentification
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({ success: false, error: 'Non authentifié' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const token = authHeader.substring(7);
    const payload = verifyToken(token);
    
    if (!payload) {
      return new Response(
        JSON.stringify({ success: false, error: 'Token invalide' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const userIdFromToken = payload.userId || payload.id;
    if (!userIdFromToken) {
      return new Response(
        JSON.stringify({ success: false, error: 'Token invalide - pas de user_id' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }

    console.log('[CLEAR TORRENTS] 🗑️ Suppression des torrents synchronisés pour user_id:', userIdFromToken);
    
    // Récupérer l'URL du backend Rust depuis la base de données
    const { getBackendUrlAsync: getBackendUrl } = await import('../../../../lib/backend-url.js');
    const backendUrl = await getBackendUrl();
    const backendApiUrl = `${backendUrl}/api/sync/clear-torrents`;
    
    console.log(`[CLEAR TORRENTS] 📡 Proxy vers: ${backendApiUrl}`);
    
    // Préparer le body pour le backend Rust
    const backendRequest = {
      user_id: userIdFromToken,
    };
    
    // Faire la requête vers le backend Rust avec un timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // Timeout de 10 secondes
    
    let response: Response;
    try {
      response = await fetch(backendApiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(backendRequest),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      console.log(`[CLEAR TORRENTS] ✅ Réponse du backend: ${response.status}`);
    } catch (fetchError) {
      clearTimeout(timeoutId);
      console.error(`[CLEAR TORRENTS] ❌ Erreur lors de la requête vers le backend:`, fetchError);
      if (fetchError instanceof Error && fetchError.name === 'AbortError') {
        return new Response(
          JSON.stringify({
            success: false,
            error: 'Timeout',
            message: 'Le backend Rust ne répond pas dans les 10 secondes.',
          }),
          {
            status: 504,
            headers: {
              'Content-Type': 'application/json',
            },
          }
        );
      }
      throw fetchError;
    }
    
    // Récupérer le body de la réponse
    const responseBody = await response.text();
    const responseData = responseBody ? JSON.parse(responseBody) : {};
    
    // Retourner la réponse du backend
    return new Response(JSON.stringify(responseData), {
      status: response.status,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  } catch (error) {
    console.error('[CLEAR TORRENTS] ❌ Erreur:', error);
    
    let errorMessage = 'Une erreur est survenue lors de la suppression des torrents';
    let errorStack = '';
    
    if (error instanceof Error) {
      errorMessage = error.message;
      errorStack = error.stack || '';
      console.error('[CLEAR TORRENTS] ❌ Stack trace:', errorStack);
    } else {
      console.error('[CLEAR TORRENTS] ❌ Erreur non-Error:', typeof error, error);
    }
    
    return new Response(
      JSON.stringify({
        success: false,
        error: 'InternalServerError',
        message: errorMessage,
        ...(process.env.NODE_ENV === 'development' && errorStack ? { stack: errorStack } : {}),
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
