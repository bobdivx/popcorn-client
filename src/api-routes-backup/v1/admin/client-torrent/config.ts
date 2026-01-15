export const prerender = false;

import type { APIRoute } from 'astro';
import { getBackendUrlAsync } from '../../../../../lib/backend-url.js';

/**
 * Proxy pour récupérer la configuration du client torrent depuis le backend Rust
 * GET /api/v1/admin/client-torrent/config
 */
export const GET: APIRoute = async () => {
  try {
    const backendUrl = await getBackendUrlAsync();
    console.log('[ADMIN CLIENT-TORRENT CONFIG] Backend URL:', backendUrl);
    
    if (!backendUrl || backendUrl.trim() === '') {
      console.error('[ADMIN CLIENT-TORRENT CONFIG] ❌ URL du backend non configurée');
      return new Response(
        JSON.stringify({
          success: false,
          error: 'BackendNotConfigured',
          message: 'URL du backend non configurée',
        }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    const fullUrl = `${backendUrl}/api/admin/client-torrent/config`;
    console.log('[ADMIN CLIENT-TORRENT CONFIG] Appel à:', fullUrl);
    
    // Timeout de 10 secondes pour laisser le temps au backend de répondre
    // (peut être lent si count_subdirectories est appelé sur un grand répertoire)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    
    let response: Response;
    try {
      response = await fetch(fullUrl, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      console.log('[ADMIN CLIENT-TORRENT CONFIG] Réponse status:', response.status);
    } catch (fetchError) {
      clearTimeout(timeoutId);
      console.error('[ADMIN CLIENT-TORRENT CONFIG] ❌ Erreur fetch:', fetchError);
      
      // Si c'est un timeout, retourner une erreur claire
      if (fetchError instanceof Error) {
        if (fetchError.name === 'AbortError' || (fetchError as any).code === 'UND_ERR_HEADERS_TIMEOUT') {
          return new Response(
            JSON.stringify({
              success: false,
              error: 'Timeout',
              message: 'Le backend n\'a pas répondu dans les 10 secondes. Le backend peut être lent ou occupé.',
            }),
            {
              status: 504,
              headers: { 'Content-Type': 'application/json' },
            }
          );
        }
      }
      throw fetchError;
    }

    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Erreur inconnue');
      return new Response(
        JSON.stringify({
          success: false,
          error: 'BackendError',
          message: errorText,
        }),
        {
          status: response.status,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    const data = await response.json();
    return new Response(
      JSON.stringify(data),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('[ADMIN CLIENT-TORRENT CONFIG] ❌ Erreur:', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: 'InternalServerError',
        message: error instanceof Error ? error.message : 'Erreur inconnue',
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
};
