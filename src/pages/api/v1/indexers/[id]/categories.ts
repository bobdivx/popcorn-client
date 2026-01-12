export const prerender = false;

import type { APIRoute } from 'astro';
import { verifyToken } from '../../../../../lib/auth/jwt.js';

/**
 * GET /api/v1/indexers/:id/categories
 * Récupère les catégories configurées pour un indexer
 * Fait un proxy vers le backend Rust /api/admin/indexers/:id/categories
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
    const { verifyToken } = await import('../../../../../lib/auth/jwt.js');
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

    console.log(`[INDEXER CATEGORIES GET] 📊 Récupération des catégories pour indexer: ${indexerId}`);
    
    // Récupérer l'URL du backend Rust depuis la base de données
    const { getBackendUrlAsync: getBackendUrl } = await import('../../../../../lib/backend-url.js');
    const backendUrl = await getBackendUrl();
    const backendApiUrl = `${backendUrl}/api/admin/indexers/${encodeURIComponent(indexerId)}/categories`;
    
    console.log(`[INDEXER CATEGORIES GET] 📡 Proxy vers: ${backendApiUrl}`);
    
    // Faire la requête vers le backend Rust
    const response = await fetch(backendApiUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });
    
    const responseBody = await response.text();
    const responseData = responseBody ? JSON.parse(responseBody) : {};
    
    console.log(`[INDEXER CATEGORIES GET] ✅ Réponse du backend: ${response.status}`);
    
    return new Response(JSON.stringify(responseData), {
      status: response.status,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[INDEXER CATEGORIES GET] ❌ Erreur:', error);
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

/**
 * PUT /api/v1/indexers/:id/categories
 * Met à jour les catégories configurées pour un indexer
 * Fait un proxy vers le backend Rust /api/admin/indexers/:id/categories
 */
export const PUT: APIRoute = async ({ params, request }) => {
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
    const { verifyToken } = await import('../../../../../lib/auth/jwt.js');
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

    const body = await request.json();
    console.log(`[INDEXER CATEGORIES PUT] 💾 Mise à jour des catégories pour indexer: ${indexerId}`, body);
    
    // Récupérer l'URL du backend Rust depuis la base de données
    const { getBackendUrlAsync: getBackendUrl } = await import('../../../../../lib/backend-url.js');
    const backendUrl = await getBackendUrl();
    const backendApiUrl = `${backendUrl}/api/admin/indexers/${encodeURIComponent(indexerId)}/categories`;
    
    console.log(`[INDEXER CATEGORIES PUT] 📡 Proxy vers: ${backendApiUrl}`);
    
    // Faire la requête vers le backend Rust
    const response = await fetch(backendApiUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    
    const responseBody = await response.text();
    const responseData = responseBody ? JSON.parse(responseBody) : {};
    
    console.log(`[INDEXER CATEGORIES PUT] ✅ Réponse du backend: ${response.status}`);
    
    return new Response(JSON.stringify(responseData), {
      status: response.status,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[INDEXER CATEGORIES PUT] ❌ Erreur:', error);
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
