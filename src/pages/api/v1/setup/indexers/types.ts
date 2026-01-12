export const prerender = false;

import type { APIRoute } from 'astro';
import type { IndexerTypeInfo } from '../../../../../lib/client/types.js';

/**
 * GET /api/v1/setup/indexers/types
 * Récupère les types d'indexers disponibles
 * 
 * Pour l'instant, retourne une liste statique des types supportés
 * TODO: Récupérer depuis la base de données si une table indexer_types existe
 */
export const GET: APIRoute = async () => {
  try {
    // Types d'indexers supportés par défaut
    // TODO: Récupérer depuis la base de données si disponible
    const indexerTypes: IndexerTypeInfo[] = [
      {
        id: 'jackett',
        name: 'Jackett',
        description: 'Indexer compatible avec Jackett',
      },
      {
        id: 'prowlarr',
        name: 'Prowlarr',
        description: 'Indexer compatible avec Prowlarr',
      },
      {
        id: 'custom',
        name: 'Personnalisé',
        description: 'Indexer personnalisé avec configuration manuelle',
      },
    ];

    return new Response(
      JSON.stringify({
        success: true,
        data: indexerTypes,
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('[INDEXER TYPES] ❌ Erreur:', error);
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
