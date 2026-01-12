export const prerender = false;

import type { APIRoute } from 'astro';
import { verifyToken } from '../../../../lib/auth/jwt.js';

/**
 * GET /api/v1/sync/settings
 * Récupère les paramètres de synchronisation
 * Fait un proxy vers le backend Rust /api/sync/settings
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

    console.log('[SYNC SETTINGS GET] 📋 Récupération des paramètres de synchronisation...');
    
    // Récupérer l'URL du backend Rust depuis la base de données
    const backendUrl = await getBackendUrlAsync();
    const backendApiUrl = `${backendUrl}/api/sync/settings`;
    
    console.log(`[SYNC SETTINGS GET] 📡 Proxy vers: ${backendApiUrl}`);
    
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
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    
    let response: Response;
    try {
      response = await fetch(backendApiUrl, {
        method: 'GET',
        headers,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      console.log(`[SYNC SETTINGS GET] ✅ Réponse du backend: ${response.status}`);
    } catch (fetchError) {
      clearTimeout(timeoutId);
      console.error(`[SYNC SETTINGS GET] ❌ Erreur:`, fetchError);
      if (fetchError instanceof Error && fetchError.name === 'AbortError') {
        return new Response(
          JSON.stringify({
            success: false,
            error: 'Timeout',
            message: 'Le backend Rust ne répond pas dans les 10 secondes.',
          }),
          {
            status: 504,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      }
      throw fetchError;
    }
    
    const responseBody = await response.text();
    const responseData = responseBody ? JSON.parse(responseBody) : {};
    
    return new Response(JSON.stringify(responseData), {
      status: response.status,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[SYNC SETTINGS GET] ❌ Erreur:', error);
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
 * PUT /api/v1/sync/settings
 * Met à jour les paramètres de synchronisation
 * Fait un proxy vers le backend Rust /api/sync/settings
 */
export const PUT: APIRoute = async ({ request }) => {
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

    console.log('[SYNC SETTINGS PUT] 💾 Mise à jour des paramètres de synchronisation...');
    
    // Récupérer le body de la requête
    const body = await request.text();
    const contentType = request.headers.get('content-type') || 'application/json';
    
    // Récupérer l'URL du backend Rust depuis la base de données
    // Utiliser un import dynamique pour éviter les erreurs de chargement
    const { getBackendUrlAsync: getBackendUrl } = await import('../../../../lib/backend-url.js');
    const backendUrl = await getBackendUrl();
    const backendApiUrl = `${backendUrl}/api/sync/settings`;
    
    console.log(`[SYNC SETTINGS PUT] 📡 Proxy vers: ${backendApiUrl}`);
    
    // Copier les headers pertinents
    const headers: HeadersInit = {
      'Content-Type': contentType,
    };
    
    // Ajouter les headers pour le backend Rust si nécessaire
    const clientIp = request.headers.get('x-forwarded-for') ||
                     request.headers.get('x-real-ip') ||
                     'unknown';
    if (clientIp !== 'unknown') {
      headers['X-Forwarded-For'] = clientIp;
    }
    
    // Faire la requête vers le backend Rust avec un timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    
    let response: Response;
    try {
      response = await fetch(backendApiUrl, {
        method: 'PUT',
        headers,
        body,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      console.log(`[SYNC SETTINGS PUT] ✅ Réponse du backend: ${response.status}`);
    } catch (fetchError) {
      clearTimeout(timeoutId);
      console.error(`[SYNC SETTINGS PUT] ❌ Erreur:`, fetchError);
      if (fetchError instanceof Error && fetchError.name === 'AbortError') {
        return new Response(
          JSON.stringify({
            success: false,
            error: 'Timeout',
            message: 'Le backend Rust ne répond pas dans les 10 secondes.',
          }),
          {
            status: 504,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      }
      throw fetchError;
    }
    
    const responseBody = await response.text();
    const responseData = responseBody ? JSON.parse(responseBody) : {};
    
    return new Response(JSON.stringify(responseData), {
      status: response.status,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[SYNC SETTINGS PUT] ❌ Erreur:', error);
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
