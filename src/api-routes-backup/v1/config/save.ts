export const prerender = false;

import type { APIRoute } from 'astro';
import { getPopcornWebApiUrl } from '../../../../lib/api/popcorn-web.js';

/**
 * Proxy popcorn-web (cloud) pour éviter CORS.
 * - GET  /api/v1/config/save  -> popcorn-web /api/v1/config/save
 * - POST /api/v1/config/save  -> popcorn-web /api/v1/config/save
 *
 * Auth: forward `Authorization: Bearer <cloudAccessToken>`
 */
async function proxyToPopcornWeb(request: Request, method: 'GET' | 'POST'): Promise<Response> {
  const popcornWebBase = getPopcornWebApiUrl(); // ex: https://.../api/v1
  const targetUrl = `${popcornWebBase}/config/save`;

  const authHeader = request.headers.get('Authorization') || '';
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  };
  if (authHeader) headers['Authorization'] = authHeader;

  const init: RequestInit = { method, headers };
  if (method === 'POST') {
    const bodyText = await request.text().catch(() => '');
    init.body = bodyText || '{}';
  }

  const upstream = await fetch(targetUrl, init);
  const body = await upstream.text();

  return new Response(body || '{}', {
    status: upstream.status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export const GET: APIRoute = async ({ request }) => {
  try {
    return await proxyToPopcornWeb(request, 'GET');
  } catch (error) {
    return new Response(
      JSON.stringify({
        success: false,
        error: 'UpstreamError',
        message: error instanceof Error ? error.message : 'Erreur proxy popcorn-web',
      }),
      { status: 502, headers: { 'Content-Type': 'application/json' } }
    );
  }
};

export const POST: APIRoute = async ({ request }) => {
  try {
    return await proxyToPopcornWeb(request, 'POST');
  } catch (error) {
    return new Response(
      JSON.stringify({
        success: false,
        error: 'UpstreamError',
        message: error instanceof Error ? error.message : 'Erreur proxy popcorn-web',
      }),
      { status: 502, headers: { 'Content-Type': 'application/json' } }
    );
  }
};

