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

const loginSchema = z.object({
  email: z.string().min(1, 'Email ou nom d\'utilisateur requis'),
  password: z.string().min(1, 'Mot de passe requis'),
});

/**
 * API de connexion pour le client
 * Utilise la base de données du serveur (popcorn-server/.data/local.db)
 * Retourne accessToken et refreshToken (pas de cookies)
 */
export const POST: APIRoute = async ({ request }) => {
  try {
    console.log('[LOGIN] 🔐 Début de la tentative de connexion...');
    
    // Récupérer l'adresse IP du client
    const clientIp = request.headers.get('x-forwarded-for') || 
                     request.headers.get('x-real-ip') || 
                     'unknown';
    
    const body = await request.json();
    const validation = loginSchema.safeParse(body);

    if (!validation.success) {
      console.log('[LOGIN] ❌ Validation échouée - IP:', clientIp);
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

    console.log('[LOGIN] 🔐 Tentative de connexion pour:', emailOrUsername, 'IP:', clientIp);

    // Auth via backend (plus aucun accès DB depuis le client)
    const { getBackendUrlAsync } = await import('../../../../lib/backend-url.js');
    const backendUrl =
      getBackendUrlOverrideFromRequest(request) ||
      (await getBackendUrlAsync());
    const backendApiUrl = `${backendUrl}/api/client/auth/login`;

    // #region agent log
    fetch('http://127.0.0.1:7246/ingest/0bc97b62-c537-46ab-80a5-8129f8a58360',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'auth/login.ts:58',message:'LOGIN proxy -> backend',data:{backendApiUrl,hasPassword:!!password,emailLen:emailOrUsername.length},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'AUTH'})}).catch(()=>{});
    // #endregion

    const backendResponse = await fetch(backendApiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email: emailOrUsername, password }),
    });

    // #region agent log
    fetch('http://127.0.0.1:7246/ingest/0bc97b62-c537-46ab-80a5-8129f8a58360',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({location:'auth/login.ts:71',message:'LOGIN backend response',data:{status:backendResponse.status,ok:backendResponse.ok},timestamp:Date.now(),sessionId:'debug-session',runId:'run1',hypothesisId:'AUTH'})}).catch(()=>{});
    // #endregion

    if (!backendResponse.ok) {
      const errorText = await backendResponse.text().catch(() => '');
      let errorData: any = {};
      try { errorData = errorText ? JSON.parse(errorText) : {}; } catch { errorData = {}; }
      return new Response(
        JSON.stringify({
          success: false,
          error: errorData.error || 'InvalidCredentials',
          message: errorData.message || errorData.error || 'Email ou mot de passe incorrect',
        }),
        { status: backendResponse.status, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const backendData = await backendResponse.json().catch(() => ({}));
    const backendUser = backendData?.data?.user;
    const userId = backendUser?.id as string | undefined;
    const userEmail = (backendUser?.email as string | undefined) || null;
    const username = (backendUser?.username as string | undefined) || userEmail || emailOrUsername;

    if (!userId) {
      return new Response(
        JSON.stringify({ success: false, error: 'InvalidResponse', message: 'Réponse backend invalide' }),
        { status: 502, headers: { 'Content-Type': 'application/json' } }
      );
    }

    console.log('[LOGIN] ✅ Connexion validée par backend - User ID:', userId, 'IP:', clientIp);

    // Générer les tokens avec durées différentes
    const accessToken = generateAccessToken({
      userId: userId,
      username,
    });
    
    const refreshToken = generateRefreshToken({
      userId: userId,
      username,
    });

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          user: {
            id: userId,
            email: userEmail,
          },
          accessToken,
          refreshToken,
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
    console.error('[LOGIN] ❌ Erreur lors de la connexion:', error);
    
    let errorMessage = 'Une erreur est survenue lors de la connexion';
    let errorStack = '';
    
    if (error instanceof Error) {
      errorMessage = error.message;
      errorStack = error.stack || '';
      console.error('[LOGIN] ❌ Stack trace:', errorStack);
    } else {
      console.error('[LOGIN] ❌ Erreur non-Error:', typeof error, error);
    }
    
    return new Response(
      JSON.stringify({
        success: false,
        error: 'InternalServerError',
        message: errorMessage,
        ...(process.env.NODE_ENV === 'development' && errorStack ? { stack: errorStack } : {}),
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
