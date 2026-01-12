export const prerender = false;

import type { APIRoute } from 'astro';
import { getDb } from '../../../../lib/db/client.js';
import { verifyPassword } from '../../../../lib/auth/password.js';
import { generateAccessToken, generateRefreshToken } from '../../../../lib/auth/jwt.js';
import { z } from 'zod';

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
    
    // Détecter si l'input ressemble à un email
    const isEmailFormat = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailOrUsername);
    console.log('[LOGIN] Format détecté:', isEmailFormat ? 'email' : 'username');
    
    // Utiliser la base de données du serveur (popcorn-server/.data/local.db)
    const db = getDb();
    let userResult;
    
    if (isEmailFormat) {
      // Chercher d'abord par email, puis par username si pas trouvé
      userResult = await db.execute({
        sql: 'SELECT id, email, username, password_hash FROM users WHERE email = ? AND password_hash IS NOT NULL',
        args: [emailOrUsername],
      });
      
      // Si pas trouvé par email, essayer par username
      if (userResult.rows.length === 0) {
        userResult = await db.execute({
          sql: 'SELECT id, email, username, password_hash FROM users WHERE username = ? AND password_hash IS NOT NULL',
          args: [emailOrUsername],
        });
      }
    } else {
      // Chercher par username uniquement
      userResult = await db.execute({
        sql: 'SELECT id, email, username, password_hash FROM users WHERE username = ? AND password_hash IS NOT NULL',
        args: [emailOrUsername],
      });
    }
    
    console.log('[LOGIN] Résultat DB:', userResult.rows.length, 'utilisateur(s) trouvé(s)');
    
    if (userResult.rows.length === 0) {
      console.log('[LOGIN] ❌ Aucun utilisateur trouvé avec cet identifiant:', emailOrUsername, 'IP:', clientIp);
      return new Response(
        JSON.stringify({
          success: false,
          error: 'InvalidCredentials',
          message: 'Email ou mot de passe incorrect',
        }),
        {
          status: 401,
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );
    }

    const user = userResult.rows[0];
    const passwordHash = user.password_hash as string;
    const userId = user.id as string;
    const userEmail = (user.email as string) || emailOrUsername;
    const username = (user as any).username || emailOrUsername;

    // Vérifier le mot de passe
    console.log('[LOGIN] Vérification du mot de passe pour:', emailOrUsername);
    
    if (!passwordHash) {
      console.log('[LOGIN] ❌ Aucun hash de mot de passe trouvé pour cet utilisateur');
      return new Response(
        JSON.stringify({
          success: false,
          error: 'InvalidCredentials',
          message: 'Email ou mot de passe incorrect',
        }),
        {
          status: 401,
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );
    }
    
    const isPasswordValid = await verifyPassword(password, passwordHash);
    console.log('[LOGIN] Mot de passe valide:', isPasswordValid);

    if (!isPasswordValid) {
      console.log('[LOGIN] ❌ Mot de passe invalide pour:', emailOrUsername);
      return new Response(
        JSON.stringify({
          success: false,
          error: 'InvalidCredentials',
          message: 'Email ou mot de passe incorrect',
        }),
        {
          status: 401,
          headers: {
            'Content-Type': 'application/json',
          },
        }
      );
    }
    
    console.log('[LOGIN] ✅ Connexion réussie pour:', emailOrUsername, 'User ID:', userId, 'IP:', clientIp);

    // Générer les tokens avec durées différentes
    const accessToken = generateAccessToken({
      userId: userId,
      username: userEmail || username,
    });
    
    const refreshToken = generateRefreshToken({
      userId: userId,
      username: userEmail || username,
    });

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          user: {
            id: userId,
            email: userEmail || null,
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
