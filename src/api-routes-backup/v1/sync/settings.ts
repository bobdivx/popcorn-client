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

function requireAuth(request: Request): Response | { ok: true } {
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
  return { ok: true };
}

async function getBackendUrl(request: Request): Promise<string> {
  const { getBackendUrlAsync } = await import('../../../../lib/backend-url.js');
  return getBackendUrlOverrideFromRequest(request) || (await getBackendUrlAsync());
}

/**
 * GET /api/v1/sync/settings -> backend /api/sync/settings
 */
export const GET: APIRoute = async ({ request }) => {
  const auth = requireAuth(request);
  if (auth instanceof Response) return auth;

  try {
    const backendUrl = await getBackendUrl(request);
    const upstream = await fetch(`${backendUrl}/api/sync/settings`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
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

/**
 * PUT /api/v1/sync/settings -> backend /api/sync/settings
 */
export const PUT: APIRoute = async ({ request }) => {
  const auth = requireAuth(request);
  if (auth instanceof Response) return auth;

  try {
    const backendUrl = await getBackendUrl(request);
    const bodyText = await request.text().catch(() => '');

    const upstream = await fetch(`${backendUrl}/api/sync/settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: bodyText || '{}',
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

