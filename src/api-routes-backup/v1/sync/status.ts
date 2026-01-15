export const prerender = false;

import type { APIRoute } from 'astro';
import { verifyToken } from '../../../../lib/auth/jwt.js';

/**
 * GET /api/v1/sync/status
 * Récupère le statut de la synchronisation des torrents
 * Fait un proxy vers le backend Rust /api/sync/status
 */
export const GET: APIRoute = async ({ request }) => {
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

    const userId = payload.userId || payload.id;
    if (!userId) {
      return new Response(
        JSON.stringify({ success: false, error: 'Token invalide - pas de user_id' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }

    console.log('[SYNC STATUS] 📊 Récupération du statut de synchronisation pour user_id:', userId);
    
    // Récupérer l'URL du backend Rust depuis la base de données
    // Utiliser un import dynamique pour éviter les erreurs de chargement
    const { getBackendUrlAsync: getBackendUrl } = await import('../../../../lib/backend-url.js');
    const backendUrl = await getBackendUrl();
    
    // Supprimer le health check qui ralentit inutilement - on va directement à la requête principale
    // Le timeout de 20 secondes sur la requête principale suffit
    
    const backendApiUrl = `${backendUrl}/api/sync/status?user_id=${encodeURIComponent(userId)}`;
    
    console.log(`[SYNC STATUS] 📡 Proxy vers: ${backendApiUrl}`);
    
    // Copier les headers pertinents
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    };
    
    // Ajouter les headers pour le backend Rust si nécessaire
    const clientIp = request.headers.get('x-forwarded-for') ||
                     request.headers.get('x-real-ip') ||
                     'unknown';
    if (clientIp !== 'unknown') {
      headers['X-Forwarded-For'] = clientIp;
    }
    
    // Faire la requête vers le backend Rust avec un timeout
    // Réduire le timeout à 5 secondes pour ne pas bloquer l'interface
    // Si le backend est lent, on retournera un timeout mais l'interface restera accessible
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // Timeout de 5 secondes
    
    let response: Response;
    try {
      response = await fetch(backendApiUrl, {
        method: 'GET',
        headers,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      console.log(`[SYNC STATUS] ✅ Réponse du backend: ${response.status}`);
    } catch (fetchError) {
      clearTimeout(timeoutId);
      console.error(`[SYNC STATUS] ❌ Erreur lors de la requête vers le backend:`, fetchError);
      if (fetchError instanceof Error && fetchError.name === 'AbortError') {
        return new Response(
          JSON.stringify({
            success: false,
            error: 'Timeout',
            message: 'Le backend Rust ne répond pas rapidement. L\'interface reste accessible. Vérifiez que le backend est démarré.',
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
    console.error('[SYNC STATUS] ❌ Erreur:', error);
    
    let errorMessage = 'Une erreur est survenue lors de la récupération du statut de synchronisation';
    let errorStack = '';
    
    if (error instanceof Error) {
      errorMessage = error.message;
      errorStack = error.stack || '';
      console.error('[SYNC STATUS] ❌ Stack trace:', errorStack);
    } else {
      console.error('[SYNC STATUS] ❌ Erreur non-Error:', typeof error, error);
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
