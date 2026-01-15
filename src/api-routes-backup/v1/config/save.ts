export const prerender = false;

import type { APIRoute } from 'astro';
import { getPopcornWebApiUrl } from '../../../../lib/api/popcorn-web.js';

/**
 * Proxy pour sauvegarder la configuration dans popcorn-web
 * POST /api/v1/config/save
 * 
 * Note: Ce proxy ne valide PAS le token localement car il vient de popcorn-web
 * avec un secret JWT différent. On transmet simplement le token à popcorn-web
 * qui se chargera de le valider.
 */
export const POST: APIRoute = async ({ request }) => {
  try {
    // Récupérer l'en-tête d'authentification (sans validation locale)
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Unauthorized',
          message: 'Token d\'authentification requis',
        }),
        {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    // Récupérer le body
    const body = await request.json();

    // Appeler popcorn-web via le proxy (popcorn-web validera le token)
    const popcornWebUrl = getPopcornWebApiUrl();
    const response = await fetch(`${popcornWebUrl}/config/save`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': authHeader,
      },
      body: JSON.stringify(body),
    });

    const data = await response.json();

    return new Response(
      JSON.stringify(data),
      {
        status: response.status,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('[CONFIG SAVE PROXY] ❌ Erreur:', error);
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

/**
 * Proxy pour récupérer la configuration depuis popcorn-web
 * GET /api/v1/config/save
 * 
 * Note: Ce proxy ne valide PAS le token localement car il vient de popcorn-web
 * avec un secret JWT différent. On transmet simplement le token à popcorn-web
 * qui se chargera de le valider.
 */
export const GET: APIRoute = async ({ request }) => {
  try {
    // Récupérer l'en-tête d'authentification (sans validation locale)
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      console.error('[CONFIG GET PROXY] ❌ Pas de token dans les headers');
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Unauthorized',
          message: 'Token d\'authentification requis',
        }),
        {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    // Appeler popcorn-web via le proxy (popcorn-web validera le token)
    const popcornWebUrl = getPopcornWebApiUrl();
    const fullUrl = `${popcornWebUrl}/config/save`;
    console.log('[CONFIG GET PROXY] Appel à:', fullUrl);
    console.log('[CONFIG GET PROXY] Token présent:', authHeader.substring(0, 20) + '...');
    
    const response = await fetch(fullUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': authHeader,
      },
    });

    console.log('[CONFIG GET PROXY] Réponse status:', response.status);
    console.log('[CONFIG GET PROXY] Réponse ok:', response.ok);

    // Si la réponse n'est pas OK, essayer de lire le message d'erreur
    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Erreur inconnue');
      
      // Le 401 est normal si l'utilisateur n'a pas de configuration sauvegardée (première connexion)
      if (response.status === 401) {
        console.log('[CONFIG GET PROXY] ℹ️ Aucune configuration sauvegardée (normal pour première connexion)');
        return new Response(
          JSON.stringify({
            success: false,
            error: 'NotFound',
            message: 'Aucune configuration sauvegardée',
          }),
          {
            status: 404, // Retourner 404 au lieu de 401 pour indiquer "pas trouvé" plutôt que "non autorisé"
            headers: { 'Content-Type': 'application/json' },
          }
        );
      }
      
      // Pour les autres erreurs, logger comme erreur
      console.error('[CONFIG GET PROXY] ❌ Erreur de popcorn-web:', response.status, errorText);
      try {
        const errorData = JSON.parse(errorText);
        return new Response(
          JSON.stringify(errorData),
          {
            status: response.status,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      } catch {
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
    }

    const data = await response.json();

    return new Response(
      JSON.stringify(data),
      {
        status: response.status,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('[CONFIG GET PROXY] ❌ Erreur:', error);
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
