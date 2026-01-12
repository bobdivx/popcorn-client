export const prerender = false;

import type { APIRoute } from 'astro';
import { getBackendUrlAsync } from '../../../lib/backend-url.js';

/**
 * API pour récupérer la bibliothèque de médias téléchargés
 * Fait un proxy vers le backend Rust /library
 */
export const GET: APIRoute = async () => {
  try {
    // Récupérer l'URL du backend depuis la base de données
    const backendUrl = await getBackendUrlAsync();
    const response = await fetch(`${backendUrl}/library`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'BackendError',
          message: `Backend non disponible (${response.status})`,
        }),
        {
          status: response.status,
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );
    }

    const data = await response.json().catch(() => ({ success: false, data: [] }));
    
    return new Response(
      JSON.stringify({
        success: true,
        data: data.data || data || [],
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );
  } catch (error) {
    console.error('Erreur lors de la récupération de la bibliothèque:', error);
    
    return new Response(
      JSON.stringify({
        success: false,
        error: 'NetworkError',
        message: error instanceof Error ? error.message : 'Erreur réseau',
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
