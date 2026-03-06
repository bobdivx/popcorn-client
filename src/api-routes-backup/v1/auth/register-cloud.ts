export const prerender = false;

import type { APIRoute } from 'astro';
import { getPopcornWebApiUrl } from '../../../../lib/api/popcorn-web.js';
import { generateAccessToken, generateRefreshToken } from '../../../../lib/auth/jwt.js';
import { z } from 'zod';

const registerCloudSchema = z.object({
  email: z.string().email('Email invalide'),
  password: z.string().min(8, 'Le mot de passe doit contenir au moins 8 caractères'),
  inviteCode: z.string().min(1, 'Code d\'invitation requis'),
});

/**
 * API d'inscription synchronisée (popcorn-web + DB locale)
 * Proxy vers l'API popcorn-web (/api/v1/auth/register).
 *
 * Note: on génère aussi un JWT local (popcorn-client) pour authentifier les routes du client.
 */
export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json();
    const validation = registerCloudSchema.safeParse(body);

    if (!validation.success) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'ValidationError',
          message: validation.error.errors[0].message,
        }),
        {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );
    }

    const { email, password, inviteCode } = validation.data;

    const popcornWebUrl = getPopcornWebApiUrl();
    const popcornWebApiUrl = `${popcornWebUrl}/auth/register`;

    const popcornWebResponse = await fetch(popcornWebApiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, inviteCode }),
    });

    if (!popcornWebResponse.ok) {
      const errorText = await popcornWebResponse.text().catch(() => '');
      let errorData: any = {};
      try { errorData = errorText ? JSON.parse(errorText) : {}; } catch { errorData = {}; }

      return new Response(
        JSON.stringify({
          success: false,
          error: errorData.error || 'RegisterError',
          message: errorData.message || errorData.error || 'Erreur lors de l\'inscription',
        }),
        { status: popcornWebResponse.status, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const popcornWebData = await popcornWebResponse.json().catch(() => ({}));
    const cloudUser = popcornWebData?.data?.user;
    const cloudUserId = cloudUser?.id as string | undefined;
    const cloudEmail = cloudUser?.email as string | undefined;
    const cloudAccessToken = popcornWebData?.data?.accessToken as string | undefined;
    const cloudRefreshToken = popcornWebData?.data?.refreshToken as string | undefined;

    if (!cloudUserId || !cloudAccessToken || !cloudRefreshToken) {
      return new Response(JSON.stringify({ success: false, error: 'InvalidResponse' }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Générer les tokens JWT locaux
    const accessToken = generateAccessToken({
      userId: cloudUserId,
      username: email,
    });
    
    const refreshToken = generateRefreshToken({
      userId: cloudUserId,
      username: email,
    });

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          user: {
            id: cloudUserId,
            email: cloudEmail || email,
          },
          accessToken,
          refreshToken,
          cloudAccessToken,
          cloudRefreshToken,
        },
      }),
      {
        status: 201,
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );
  } catch (error) {
    console.error('Erreur lors de l\'inscription cloud:', error);
    
    let errorMessage = 'Une erreur est survenue lors de l\'inscription';
    if (error instanceof Error) {
      errorMessage = error.message;
    }
    
    return new Response(
      JSON.stringify({
        success: false,
        error: 'InternalServerError',
        message: errorMessage,
      }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );
  }
};
