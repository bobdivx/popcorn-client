export const prerender = false;

import type { APIRoute } from 'astro';
import { verifyToken } from '../../../../lib/auth/jwt.js';
import { z } from 'zod';

function getBackendUrlOverrideFromRequest(request: Request): string | null {
  const raw = request.headers.get('x-popcorn-backend-url') || request.headers.get('X-Popcorn-Backend-Url');
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed || trimmed === 'undefined') return null;
  try {
    const u = new URL(trimmed);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    return trimmed.replace(/\/$/, '');
  } catch {
    return null;
  }
}

const tmdbKeySchema = z.object({
  apiKey: z.string().min(1, 'La clé API est requise'),
});

/**
 * GET /api/v1/setup/tmdb
 * Récupère la clé API TMDB depuis le backend (sans la valeur complète pour la sécurité)
 */
export const GET: APIRoute = async ({ request }) => {
  try {
    // Récupérer l'ID utilisateur depuis le token d'authentification
    const authHeader = request.headers.get('Authorization');
    let userId: string | null = null;
    
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      const payload = verifyToken(token);
      if (payload) {
        userId = payload.userId || payload.id || null;
      }
    }

    if (!userId) {
      // Si pas d'utilisateur, retourner hasKey: false
      return new Response(
        JSON.stringify({
          success: true,
          data: {
            apiKey: null,
            hasKey: false,
          },
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    // Appeler le backend
    const { getBackendUrlAsync } = await import('../../../../lib/backend-url.js');
    const backendUrl =
      getBackendUrlOverrideFromRequest(request) ||
      (await getBackendUrlAsync());
    const backendApiUrl = `${backendUrl}/api/tmdb/key`;
    
    const response = await fetch(backendApiUrl, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'X-User-ID': userId,
      },
    });

    if (!response.ok) {
      // Si erreur, considérer qu'il n'y a pas de clé
      return new Response(
        JSON.stringify({
          success: true,
          data: {
            apiKey: null,
            hasKey: false,
          },
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    const backendData = await response.json();
    const hasKey = backendData.data?.has_key || false;

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          apiKey: hasKey ? '****...****' : null, // Masquer la clé pour la sécurité
          hasKey,
        },
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('[TMDB GET] ❌ Erreur:', error);
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
 * POST /api/v1/setup/tmdb
 * Définit la clé API TMDB dans la DB locale ET synchronise avec le backend Rust
 */
export const POST: APIRoute = async ({ request }) => {
  try {
    // Vérifier l'authentification pour obtenir l'ID utilisateur
    const authHeader = request.headers.get('Authorization');
    let userId: string | null = null;
    
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      const payload = verifyToken(token);
      if (payload) {
        userId = payload.userId || payload.id || null;
      }
    }

    const body = await request.json();
    const validation = tmdbKeySchema.safeParse(body);

    if (!validation.success) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'ValidationError',
          message: validation.error.errors[0].message,
        }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    const { apiKey } = validation.data;

    if (!userId) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Utilisateur non authentifié',
        }),
        {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    console.log('[TMDB POST] 💾 Sauvegarde de la clé API TMDB dans le backend...');
    
    // Sauvegarder directement dans le backend
    const { getBackendUrlAsync } = await import('../../../../lib/backend-url.js');
    const backendUrl =
      getBackendUrlOverrideFromRequest(request) ||
      (await getBackendUrlAsync());
    const backendApiUrl = `${backendUrl}/api/tmdb/key`;
    
    const backendResponse = await fetch(backendApiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-User-ID': userId,
      },
      body: JSON.stringify({ api_key: apiKey }),
    });

    if (!backendResponse.ok) {
      const errorText = await backendResponse.text().catch(() => '');
      const errorData = errorText ? JSON.parse(errorText).catch(() => ({})) : {};
      console.error('[TMDB POST] ❌ Erreur backend:', errorData);
      return new Response(
        JSON.stringify({
          success: false,
          error: errorData.message || 'Erreur lors de la sauvegarde de la clé API TMDB dans le backend',
        }),
        {
          status: backendResponse.status,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    console.log('[TMDB POST] ✅ Clé API TMDB sauvegardée dans le backend');

    return new Response(
      JSON.stringify({
        success: true,
        data: null,
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('[TMDB POST] ❌ Erreur:', error);
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
 * DELETE /api/v1/setup/tmdb
 * Supprime la clé API TMDB depuis le backend
 */
export const DELETE: APIRoute = async ({ request }) => {
  try {
    // Récupérer l'ID utilisateur depuis le token d'authentification
    const authHeader = request.headers.get('Authorization');
    let userId: string | null = null;
    
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      const payload = verifyToken(token);
      if (payload) {
        userId = payload.userId || payload.id || null;
      }
    }

    if (!userId) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Utilisateur non authentifié',
        }),
        {
          status: 401,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    // Supprimer depuis le backend
    const { getBackendUrlAsync } = await import('../../../../lib/backend-url.js');
    const backendUrl =
      getBackendUrlOverrideFromRequest(request) ||
      (await getBackendUrlAsync());
    const backendApiUrl = `${backendUrl}/api/tmdb/key`;
    
    const backendResponse = await fetch(backendApiUrl, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'X-User-ID': userId,
      },
    });

    if (!backendResponse.ok) {
      const errorText = await backendResponse.text().catch(() => '');
      const errorData = errorText ? JSON.parse(errorText).catch(() => ({})) : {};
      console.error('[TMDB DELETE] ❌ Erreur backend:', errorData);
      return new Response(
        JSON.stringify({
          success: false,
          error: errorData.message || 'Erreur lors de la suppression de la clé API TMDB dans le backend',
        }),
        {
          status: backendResponse.status,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    console.log('[TMDB DELETE] ✅ Clé API TMDB supprimée du backend');

    return new Response(
      JSON.stringify({
        success: true,
        data: null,
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('[TMDB DELETE] ❌ Erreur:', error);
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
