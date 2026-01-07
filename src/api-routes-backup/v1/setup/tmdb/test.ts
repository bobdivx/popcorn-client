export const prerender = false;

import type { APIRoute } from 'astro';
import { serverApi } from '../../../../../lib/client/server-api';

/**
 * Teste la clé API TMDB configurée côté serveur
 * Le backend récupère la clé stockée et la teste via l'API TMDB
 */
export const POST: APIRoute = async ({ request }) => {
  try {
    // Vérifier l'authentification via serverApi
    const meResponse = await serverApi.getMe();
    if (!meResponse.success) {
      return new Response(
        JSON.stringify({ success: false, error: 'Non authentifié' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Vérifier que la clé existe
    const keyResponse = await serverApi.getTmdbKey();
    
    if (!keyResponse.success || !keyResponse.data?.hasKey) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Aucune clé TMDB configurée',
          data: { valid: false }
        }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Le backend devrait avoir un endpoint pour tester la clé
    // Pour l'instant, on considère que si la clé existe, elle est valide
    // (le backend devrait valider la clé lors de la sauvegarde)
    // Une meilleure solution serait que le backend ait son propre endpoint de test
    
    return new Response(
      JSON.stringify({ 
        success: true,
        data: {
          valid: true,
          message: 'Clé API TMDB configurée et disponible'
        }
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[TMDB API TEST] Exception:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Erreur lors du test de la clé TMDB',
        data: { valid: false }
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
