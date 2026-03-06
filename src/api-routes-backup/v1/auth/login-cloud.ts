export const prerender = false;

import type { APIRoute } from 'astro';
import { getPopcornWebApiUrl } from '../../../../lib/api/popcorn-web.js';
import { generateAccessToken, generateRefreshToken } from '../../../../lib/auth/jwt.js';
import { z } from 'zod';

const loginCloudSchema = z.object({
  // Compte cloud (popcorn-web) => email obligatoire
  email: z.string().email('Email invalide'),
  password: z.string().min(1, 'Mot de passe requis'),
});

/**
 * API de connexion avec compte cloud (popcorn-web)
 * Proxy vers l'API popcorn-web (/api/v1/auth/login).
 *
 * Note: on génère aussi un JWT local (popcorn-client) pour authentifier les routes du client.
 */
export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json();
    const validation = loginCloudSchema.safeParse(body);

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

    const { email: emailOrUsername, password } = validation.data;
    const popcornWebUrl = getPopcornWebApiUrl();
    const popcornWebApiUrl = `${popcornWebUrl}/auth/login`;

    const popcornWebResponse = await fetch(popcornWebApiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: emailOrUsername, password }),
    });

    if (!popcornWebResponse.ok) {
      const errorText = await popcornWebResponse.text().catch(() => '');
      let errorData: any = {};
      try { errorData = errorText ? JSON.parse(errorText) : {}; } catch { errorData = {}; }

      return new Response(
        JSON.stringify({
          success: false,
          error: errorData.error || 'InvalidCredentials',
          message: errorData.message || errorData.error || 'Email ou mot de passe incorrect',
        }),
        {
          status: popcornWebResponse.status,
          headers: { 'Content-Type': 'application/json' },
        }
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

    // Générer aussi les tokens JWT locaux (pour les routes protégées du client)
    const accessToken = generateAccessToken({
      userId: cloudUserId,
      username: emailOrUsername,
    });
    
    const refreshToken = generateRefreshToken({
      userId: cloudUserId,
      username: emailOrUsername,
    });

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          user: {
            id: cloudUserId,
            email: cloudEmail || emailOrUsername,
          },
          accessToken,
          refreshToken,
          cloudAccessToken,
          cloudRefreshToken,
        },
      }),
      {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );
  } catch (error) {
    console.error('Erreur lors de la connexion cloud:', error);
    
    let errorMessage = 'Une erreur est survenue lors de la connexion';
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
