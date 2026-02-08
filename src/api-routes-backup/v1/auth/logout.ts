export const prerender = false;

import type { APIRoute } from 'astro';

/**
 * POST /api/v1/auth/logout
 * Stateless côté serveur: le client supprime ses tokens localement.
 */
export const POST: APIRoute = async () => {
  return new Response(
    JSON.stringify({
      success: true,
      message: 'Déconnexion réussie',
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
};

