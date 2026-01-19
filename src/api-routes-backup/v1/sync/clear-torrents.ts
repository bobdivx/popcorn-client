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
 * POST /api/v1/sync/clear-torrents
 * Proxy vers backend /api/sync/clear-torrents avec { user_id }
 */
export const POST: APIRoute = async ({ request }) => {
  try {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ success: false, error: 'Unauthorized', message: 'Non authentifié' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const token = authHeader.substring(7);
    const payload = verifyToken(token);
    if (!payload) {
      return new Response(JSON.stringify({ success: false, error: 'Unauthorized', message: 'Token invalide' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const userId = payload.userId || payload.id;
    if (!userId) {
      return new Response(JSON.stringify({ success: false, error: 'Unauthorized', message: 'Token invalide' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const { getBackendUrlAsync } = await import('../../../../lib/backend-url.js');
    const backendUrl = getBackendUrlOverrideFromRequest(request) || (await getBackendUrlAsync());

    const upstream = await fetch(`${backendUrl}/api/sync/clear-torrents`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: String(userId) }),
    });

    const body = await upstream.text();
    return new Response(body || '{}', { status: upstream.status, headers: { 'Content-Type': 'application/json' } });
  } catch (error) {
    return new Response(
      JSON.stringify({ success: false, error: 'InternalServerError', message: error instanceof Error ? error.message : 'Erreur inconnue' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};

