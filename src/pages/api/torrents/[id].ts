export const prerender = false;

import type { APIRoute } from 'astro';
import { verifyToken } from '../../../lib/auth/jwt.js';
import { getBackendUrlAsync } from '../../../lib/backend-url.js';

/**
 * Route proxy pour récupérer un torrent par ID
 * Fait un proxy vers le backend Rust /api/torrents/:id
 */
export const GET: APIRoute = async ({ params, request }) => {
  // Vérifier l'authentification
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return new Response(
      JSON.stringify({ success: false, error: 'Non authentifié' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    );
  }

  try {
    const token = authHeader.substring(7);
    const payload = verifyToken(token);
    
    if (!payload) {
      return new Response(
        JSON.stringify({ success: false, error: 'Token invalide' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const id = params.id;
    if (!id) {
      return new Response(
        JSON.stringify({ success: false, error: 'ID manquant' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Récupérer l'URL du backend Rust depuis la base de données
    const backendUrl = await getBackendUrlAsync();
    const backendApiUrl = `${backendUrl}/api/torrents/${encodeURIComponent(id)}`;
    
    console.log(`[TORRENTS] 📡 Récupération du torrent depuis: ${backendApiUrl}`);

    // Faire la requête vers le backend Rust
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 30000); // Timeout de 30 secondes
    
    let response: Response;
    try {
      response = await fetch(backendApiUrl, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': authHeader,
        },
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
    } catch (fetchError) {
      clearTimeout(timeoutId);
      console.error(`[TORRENTS] Erreur lors de la requête vers ${backendApiUrl}:`, fetchError);
      if (fetchError instanceof Error && fetchError.name === 'AbortError') {
        return new Response(
          JSON.stringify({
            success: false,
            error: 'Timeout',
            message: `Le backend Rust ne répond pas dans les 30 secondes.`,
          }),
          { status: 504, headers: { 'Content-Type': 'application/json' } }
        );
      }
      throw fetchError;
    }

    // Si la route n'existe pas (404), retourner 404
    if (response.status === 404) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'NotFound',
          message: 'Torrent non trouvé',
        }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Récupérer le contenu de la réponse
    const responseData = await response.json();

    // Retourner la réponse du backend
    return new Response(JSON.stringify(responseData), {
      status: response.status,
      headers: {
        'Content-Type': 'application/json',
      },
    });
  } catch (error) {
    console.error('[TORRENTS] Erreur lors de la récupération du torrent:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: 'InternalError',
        message: error instanceof Error ? error.message : 'Erreur inconnue lors de la récupération du torrent',
      }),
      { 
        status: 500, 
        headers: { 'Content-Type': 'application/json' } 
      }
    );
  }
};
