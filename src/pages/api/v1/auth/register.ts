export const prerender = false;

import type { APIRoute } from 'astro';
import { generateAccessToken, generateRefreshToken } from '../../../../lib/auth/jwt.js';
import { z } from 'zod';

const registerSchema = z.object({
  email: z.string().email('Email invalide'),
  password: z.string().min(8, 'Le mot de passe doit contenir au moins 8 caractères'),
  inviteCode: z.string().min(1, 'Code d\'invitation requis'),
});

/**
 * API d'inscription pour le client
 * Retourne accessToken et refreshToken (pas de cookies)
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
        {
          status: 400,
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );
    }

    const { email, password, inviteCode } = validation.data;

    // Register via backend (plus aucun accès DB depuis le client)
    const { getBackendUrlAsync } = await import('../../../../lib/backend-url.js');
    const backendUrl = await getBackendUrlAsync();
    const backendApiUrl = `${backendUrl}/api/client/auth/register`;

    // Username: on garde le comportement actuel (email comme username)
    const username = email;

    // #region agent log
    fetch('http://127.0.0.1:7246/ingest/0bc97b62-c537-46ab-80a5-8129f8a58360',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'auth/register.ts:44',message:'REGISTER proxy -> backend',data:{backendApiUrl,emailLen:email.length,inviteLen:inviteCode.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'AUTH'})}).catch(()=>{});
    // #endregion

    const backendResponse = await fetch(backendApiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email,
        username,
        password,
        invite_code: inviteCode,
      }),
    });

    // #region agent log
    fetch('http://127.0.0.1:7246/ingest/0bc97b62-c537-46ab-80a5-8129f8a58360',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'auth/register.ts:60',message:'REGISTER backend response',data:{status:backendResponse.status,ok:backendResponse.ok},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'AUTH'})}).catch(()=>{});
    // #endregion

    if (!backendResponse.ok) {
      const errorText = await backendResponse.text().catch(() => '');
      let errorData: any = {};
      try { errorData = errorText ? JSON.parse(errorText) : {}; } catch { errorData = {}; }
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
      return new Response(
        JSON.stringify({ success: false, error: 'InvalidResponse', message: 'Réponse backend invalide' }),
        { status: 502, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Générer les tokens
    const accessToken = generateAccessToken({
      userId: userId,
      username: email,
    });
    
    const refreshToken = generateRefreshToken({
      userId: userId,
      username: email,
    });

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          user: {
            id: userId,
            email: email,
          },
          accessToken,
          refreshToken,
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
    console.error('Erreur lors de l\'inscription:', error);
    
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
