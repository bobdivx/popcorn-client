export const prerender = false;

import type { APIRoute } from 'astro';
import { verifyToken } from '../../../../lib/auth/jwt.js';
import { z } from 'zod';

const startSyncSchema = z.object({
  user_id: z.string().optional(), // Optionnel, sera extrait du token si non fourni
});

/**
 * POST /api/v1/sync/start
 * Démarre la synchronisation des torrents
 * Fait un proxy vers le backend Rust /api/sync/start
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

    console.log('[SYNC START] 🚀 Démarrage de la synchronisation pour user_id:', userIdFromToken);
    
    // Récupérer le body de la requête (optionnel)
    let requestData: { user_id?: string } = {};
    try {
      const body = await request.text();
      if (body) {
        requestData = JSON.parse(body);
      }
    } catch (parseError) {
      // Body vide ou invalide, utiliser le user_id du token
    }
    
    // Utiliser le user_id du body s'il est fourni, sinon utiliser celui du token
    const userId = requestData.user_id || userIdFromToken;
    
    // Récupérer l'URL du backend Rust depuis la base de données
    // Utiliser un import dynamique pour éviter les erreurs de chargement
    const { getBackendUrlAsync: getBackendUrl } = await import('../../../../lib/backend-url.js');
    const backendUrl = await getBackendUrl();
    
    // Plus besoin de synchroniser le token TMDB : il est déjà dans le backend
    // Le token TMDB est maintenant géré directement dans le backend via les routes API
    console.log('[SYNC START] ℹ️ Le token TMDB est déjà dans le backend, pas besoin de synchronisation');
    
    // Plus besoin de synchroniser les indexers : ils sont déjà dans le backend
    // Les indexers sont maintenant gérés directement dans le backend via les routes API
    console.log('[SYNC START] ℹ️ Les indexers sont déjà dans le backend, pas besoin de synchronisation');
    
    const backendApiUrl = `${backendUrl}/api/sync/start`;
    
    console.log(`[SYNC START] 📡 Proxy vers: ${backendApiUrl}`);
    console.log(`[SYNC START] 📋 Body de la requête:`, { user_id: userId });
    
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
    
    // Préparer le body pour le backend Rust
    const backendRequest = {
      user_id: userId,
    };
    
    // Faire la requête vers le backend Rust avec un timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // Timeout de 10 secondes
    
    let response: Response;
    try {
      console.log(`[SYNC START] 🔄 Envoi de la requête au backend...`);
      response = await fetch(backendApiUrl, {
        method: 'POST',
        headers,
        body: JSON.stringify(backendRequest),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      console.log(`[SYNC START] ✅ Réponse du backend: ${response.status}`);
      
      // Récupérer le body de la réponse
      const responseBody = await response.text();
      console.log(`[SYNC START] 📄 Body de la réponse:`, responseBody.substring(0, 500)); // Limiter à 500 caractères pour les logs
      const responseData = responseBody ? JSON.parse(responseBody) : {};
      
      // Si erreur 400, améliorer le message d'erreur
      if (response.status === 400) {
        console.error('[SYNC START] ❌ Erreur 400 du backend:', responseData);
        // Le message d'erreur du backend est déjà dans responseData.error ou responseData.message
      } else if (!response.ok) {
        console.error('[SYNC START] ❌ Erreur du backend (status non-OK):', response.status, responseData);
      } else {
        console.log('[SYNC START] ✅ Synchronisation démarrée avec succès:', responseData);
      }
      
      // Retourner la réponse du backend
      return new Response(JSON.stringify(responseData), {
        status: response.status,
        headers: {
          'Content-Type': 'application/json',
        },
      });
    } catch (fetchError) {
      clearTimeout(timeoutId);
      console.error(`[SYNC START] ❌ Erreur lors de la requête vers le backend:`, fetchError);
      if (fetchError instanceof Error && fetchError.name === 'AbortError') {
        return new Response(
          JSON.stringify({
            success: false,
            error: 'Timeout',
            message: 'Le backend Rust ne répond pas dans les 10 secondes. Vérifiez qu\'il est démarré.',
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
  } catch (error) {
    console.error('[SYNC START] ❌ Erreur:', error);
    
    let errorMessage = 'Une erreur est survenue lors du démarrage de la synchronisation';
    let errorStack = '';
    
    if (error instanceof Error) {
      errorMessage = error.message;
      errorStack = error.stack || '';
      console.error('[SYNC START] ❌ Stack trace:', errorStack);
    } else {
      console.error('[SYNC START] ❌ Erreur non-Error:', typeof error, error);
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
