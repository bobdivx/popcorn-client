export const prerender = false;

import type { APIRoute } from 'astro';
import { verifyToken, generateAccessToken, generateRefreshToken } from '../../../../lib/auth/jwt.js';
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

const refreshSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token requis'),
});

/**
 * POST /api/v1/auth/refresh
 * Vérifie le refresh token local et émet une nouvelle paire de tokens.
 */
export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json();
    const validation = refreshSchema.safeParse(body);

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

    const { refreshToken } = validation.data;
    const payload = verifyToken(refreshToken);

    if (!payload) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'InvalidToken',
          message: 'Refresh token invalide ou expiré',
        }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const userId = payload.userId || payload.id;
    const emailFromToken = (payload as any)?.email || (payload as any)?.username || '';

    if (!userId) {
      return new Response(JSON.stringify({ success: false, error: 'InvalidToken', message: 'Token invalide' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Enrichissement best-effort via backend pour récupérer l'email à jour
    let userEmail = emailFromToken;
    try {
      const { getBackendUrlAsync } = await import('../../../../lib/backend-url.js');
      const backendUrl = getBackendUrlOverrideFromRequest(request) || (await getBackendUrlAsync());
      const backendApiUrl = `${backendUrl}/api/client/auth/users/${encodeURIComponent(String(userId))}`;
      const backendResponse = await fetch(backendApiUrl, { method: 'GET', headers: { 'Content-Type': 'application/json' } });
      if (backendResponse.ok) {
        const backendData = await backendResponse.json().catch(() => ({}));
        userEmail = backendData?.data?.email || userEmail;
      }
    } catch {
      // ignore
    }

    const newAccessToken = generateAccessToken({ userId: String(userId), username: userEmail || '' });
    const newRefreshToken = generateRefreshToken({ userId: String(userId), username: userEmail || '' });

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          accessToken: newAccessToken,
          refreshToken: newRefreshToken,
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

