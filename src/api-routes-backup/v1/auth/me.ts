export const prerender = false;

import type { APIRoute } from 'astro';
import { verifyToken } from '../../../../lib/auth/jwt.js';

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

/**
 * GET /api/v1/auth/me
 * Retourne l'utilisateur courant (basé sur le JWT local).
 * Optionnellement, enrichit via le backend Rust (/api/client/auth/users/:id).
 *
 * Format attendu par `serverApi.getMe()`:
 * { success: true, data: { id: string, email: string | null } }
 */
export const GET: APIRoute = async ({ request }) => {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return new Response(JSON.stringify({ success: false, error: 'Unauthorized', message: 'Non authentifié' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const token = authHeader.substring(7);
    const payload = verifyToken(token);

    if (!payload) {
      return new Response(JSON.stringify({ success: false, error: 'Unauthorized', message: 'Token invalide' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const userId = payload.userId || payload.id;
    const emailFromToken = (payload as any)?.email || (payload as any)?.username || null;

    if (!userId) {
      return new Response(JSON.stringify({ success: false, error: 'Unauthorized', message: 'Token invalide' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Enrichissement best-effort via backend
    try {
      const { getBackendUrlAsync } = await import('../../../../lib/backend-url.js');
      const backendUrl = getBackendUrlOverrideFromRequest(request) || (await getBackendUrlAsync());
      const backendApiUrl = `${backendUrl}/api/client/auth/users/${encodeURIComponent(String(userId))}`;

      const backendResponse = await fetch(backendApiUrl, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });

      if (backendResponse.ok) {
        const backendData = await backendResponse.json().catch(() => ({}));
        const backendUser = backendData?.data;
        if (backendUser?.id) {
          return new Response(
            JSON.stringify({
              success: true,
              data: {
                id: backendUser.id,
                email: backendUser.email ?? null,
              },
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }
      }
    } catch {
      // Fallback plus bas
    }

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          id: String(userId),
          email: emailFromToken,
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
