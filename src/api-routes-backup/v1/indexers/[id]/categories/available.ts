export const prerender = false;

import type { APIRoute } from 'astro';
import { verifyToken } from '../../../../../../lib/auth/jwt.js';

/**
 * GET /api/v1/indexers/:id/categories/available
 * Récupère les catégories disponibles depuis l'indexer (via Torznab caps)
 * Fait un proxy vers le backend Rust /api/admin/indexers/:id/categories/available
 */
export const GET: APIRoute = async ({ params, request }) => {
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
    const { verifyToken } = await import('../../../../../../lib/auth/jwt.js');
    const payload = verifyToken(token);
    
    if (!payload) {
      return new Response(
        JSON.stringify({ success: false, error: 'Token invalide' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const indexerId = params.id;
    if (!indexerId) {
      return new Response(
        JSON.stringify({ success: false, error: 'ID de l\'indexer requis' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[INDEXER CATEGORIES AVAILABLE GET] 📊 Récupération des catégories disponibles pour indexer: ${indexerId}`);
    
    // Récupérer l'URL du backend Rust depuis la base de données
    const { getBackendUrlAsync: getBackendUrl } = await import('../../../../../../lib/backend-url.js');
    const backendUrl = await getBackendUrl();
    const backendApiUrl = `${backendUrl}/api/admin/indexers/${encodeURIComponent(indexerId)}/categories/available`;
    
    console.log(`[INDEXER CATEGORIES AVAILABLE GET] 📡 Proxy vers: ${backendApiUrl}`);
    
    // Faire la requête vers le backend Rust
    const response = await fetch(backendApiUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });
    
    const responseBody = await response.text();
    const responseData = responseBody ? JSON.parse(responseBody) : {};
    
    console.log(`[INDEXER CATEGORIES AVAILABLE GET] ✅ Réponse du backend: ${response.status}`);
    
    return new Response(JSON.stringify(responseData), {
      status: response.status,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[INDEXER CATEGORIES AVAILABLE GET] ❌ Erreur:', error);
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
