export const prerender = false;

import type { APIRoute } from 'astro';
import { getDb } from '../../../../../lib/db/client.js';
import { z } from 'zod';

const testTmdbKeySchema = z.object({
  apiKey: z.string().min(1, 'La clé API est requise'),
});

/**
 * POST /api/v1/setup/tmdb/test
 * Teste une clé API TMDB
 */
export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json();
    const validation = testTmdbKeySchema.safeParse(body);

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

    // Tester la clé en faisant une requête vers l'API TMDB
    try {
      const response = await fetch(`https://api.themoviedb.org/3/configuration?api_key=${apiKey}`, {
        method: 'GET',
        headers: {
          'Accept': 'application/json',
        },
      });

      if (response.ok) {
        return new Response(
          JSON.stringify({
            success: true,
            data: {
              valid: true,
              message: 'Clé API TMDB valide',
            },
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      } else {
        const errorData = await response.json().catch(() => ({}));
        return new Response(
          JSON.stringify({
            success: true,
            data: {
              valid: false,
              message: errorData.status_message || `Erreur TMDB: ${response.status}`,
            },
          }),
          {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      }
    } catch (fetchError) {
      return new Response(
        JSON.stringify({
          success: true,
          data: {
            valid: false,
            message: fetchError instanceof Error ? fetchError.message : 'Erreur réseau lors du test',
          },
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }
  } catch (error) {
    console.error('[TMDB TEST] ❌ Erreur:', error);
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
