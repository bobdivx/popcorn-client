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
 * GET /api/v1/sync/status
 * Proxy vers le backend Rust /api/sync/status
 */
export const GET: APIRoute = async ({ request }) => {
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
    const backendApiUrl = `${backendUrl}/api/sync/status?user_id=${encodeURIComponent(String(userId))}`;

    const headers: HeadersInit = { 'Content-Type': 'application/json' };
    const clientIp = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown';
    if (clientIp !== 'unknown') headers['X-Forwarded-For'] = clientIp;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    try {
      const response = await fetch(backendApiUrl, { method: 'GET', headers, signal: controller.signal });
      clearTimeout(timeoutId);
      const body = await response.text();
      return new Response(body || '{}', { status: response.status, headers: { 'Content-Type': 'application/json' } });
    } catch (fetchError) {
      clearTimeout(timeoutId);
      if (fetchError instanceof Error && fetchError.name === 'AbortError') {
        return new Response(
          JSON.stringify({ success: false, error: 'Timeout', message: 'Le backend Rust ne répond pas (timeout).' }),
          { status: 504, headers: { 'Content-Type': 'application/json' } }
        );
      }
      throw fetchError;
    }
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

