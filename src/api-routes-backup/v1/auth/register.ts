export const prerender = false;

import type { APIRoute } from 'astro';
import { generateAccessToken, generateRefreshToken } from '../../../../lib/auth/jwt.js';
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

const registerSchema = z.object({
  email: z.string().email('Email invalide'),
  password: z.string().min(8, 'Le mot de passe doit contenir au moins 8 caractères'),
  inviteCode: z.string().min(1, "Code d'invitation requis"),
});

/**
 * POST /api/v1/auth/register
 * Proxy vers backend Rust (/api/client/auth/register) + génération des JWT locaux.
 */
export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json();
    const validation = registerSchema.safeParse(body);

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

    const { email, password, inviteCode } = validation.data;
    const username = email;

    const { getBackendUrlAsync } = await import('../../../../lib/backend-url.js');
    const backendUrl = getBackendUrlOverrideFromRequest(request) || (await getBackendUrlAsync());
    const backendApiUrl = `${backendUrl}/api/client/auth/register`;

    const backendResponse = await fetch(backendApiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        username,
        password,
        invite_code: inviteCode,
      }),
    });

    if (!backendResponse.ok) {
      const errorText = await backendResponse.text().catch(() => '');
      let errorData: any = {};
      try {
        errorData = errorText ? JSON.parse(errorText) : {};
      } catch {
        errorData = {};
      }
      return new Response(
        JSON.stringify({
          success: false,
          error: errorData.error || 'RegisterError',
          message: errorData.message || 'Erreur lors de la création du compte',
        }),
        { status: backendResponse.status, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const backendData = await backendResponse.json().catch(() => ({}));
    const backendUser = backendData?.data;
    const userId = backendUser?.id as string | undefined;

    if (!userId) {
      return new Response(JSON.stringify({ success: false, error: 'InvalidResponse', message: 'Réponse backend invalide' }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const accessToken = generateAccessToken({ userId, username: email });
    const refreshToken = generateRefreshToken({ userId, username: email });

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          user: { id: userId, email },
          accessToken,
          refreshToken,
        },
      }),
      { status: 201, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({
        success: false,
        error: 'InternalServerError',
        message: error instanceof Error ? error.message : "Une erreur est survenue lors de l'inscription",
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};

