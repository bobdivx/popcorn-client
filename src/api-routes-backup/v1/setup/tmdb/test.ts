export const prerender = false;

import type { APIRoute } from 'astro';
import { verifyToken } from '../../../../../lib/auth/jwt.js';
import { z } from 'zod';

const testTmdbKeySchema = z.object({
  apiKey: z.string().min(1, 'La clé API est requise'),
});

/**
 * POST /api/v1/setup/tmdb/test
 * Deux modes:
 * - Sans body: vérifie que l'utilisateur a une clé TMDB configurée côté backend.
 * - Avec body { apiKey }: teste une clé TMDB (sans la sauvegarder).
 */
export const POST: APIRoute = async ({ request }) => {
  try {
    const rawBody = await request.text();

    // Mode 1: test d'une clé fournie (utilisable avant sauvegarde)
    if (rawBody && rawBody.trim().length > 0) {
      const body = JSON.parse(rawBody);
      const validation = testTmdbKeySchema.safeParse(body);
      if (!validation.success) {
        return new Response(
          JSON.stringify({
            success: false,
            error: 'ValidationError',
            message: validation.error.errors[0].message,
          }),
          { status: 400, headers: { 'Content-Type': 'application/json' } }
        );
      }

      const { apiKey } = validation.data;
      try {
        const response = await fetch(`https://api.themoviedb.org/3/configuration?api_key=${encodeURIComponent(apiKey)}`, {
          method: 'GET',
          headers: { Accept: 'application/json' },
        });

        if (response.ok) {
          return new Response(
            JSON.stringify({ success: true, data: { valid: true, message: 'Clé API TMDB valide' } }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }

        const errorData = await response.json().catch(() => ({}));
        return new Response(
          JSON.stringify({
            success: true,
            data: {
              valid: false,
              message: errorData.status_message || `Erreur TMDB: ${response.status}`,
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      } catch (fetchError) {
        return new Response(
          JSON.stringify({
            success: true,
            data: {
              valid: false,
              message: fetchError instanceof Error ? fetchError.message : 'Erreur réseau lors du test',
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } }
        );
      }
    }

    // Mode 2: vérifie la clé existante (stockée côté backend) pour l'utilisateur courant
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ success: false, error: 'Unauthorized', message: 'Non authentifié' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const token = authHeader.substring(7);
    const payload = verifyToken(token);
    const userId = payload?.userId || payload?.id;
    if (!userId) {
      return new Response(JSON.stringify({ success: false, error: 'Unauthorized', message: 'Token invalide' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const { getBackendUrlAsync } = await import('../../../../../lib/backend-url.js');
    const backendUrl = await getBackendUrlAsync();

    const r = await fetch(`${backendUrl}/api/tmdb/key`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'X-User-ID': String(userId),
      },
    });

    if (!r.ok) {
      return new Response(
        JSON.stringify({
          success: true,
          data: { valid: false, message: 'Impossible de contacter le backend pour vérifier la clé TMDB.' },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const data = await r.json().catch(() => ({}));
    const hasKey = !!data?.data?.has_key;

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          valid: hasKey,
          message: hasKey ? 'Clé TMDB configurée.' : 'Aucune clé TMDB configurée.',
        },
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({
        success: false,
        error: 'InternalServerError',
        message: error instanceof Error ? error.message : 'Erreur inconnue',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
