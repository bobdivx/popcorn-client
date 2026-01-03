import type { APIContext } from 'astro';
import { verifyToken, extractTokenFromHeader } from './jwt';

export interface AuthenticatedContext extends APIContext {
  user: {
    userId: string;
    email: string;
  };
}

/**
 * Middleware d'authentification pour protéger les routes API
 * Vérifie la présence et la validité du token JWT
 */
export async function requireAuth(context: APIContext): Promise<AuthenticatedContext> {
  const authHeader = context.request.headers.get('Authorization');
  const token = extractTokenFromHeader(authHeader);

  if (!token) {
    return new Response(
      JSON.stringify({
        success: false,
        error: 'Unauthorized',
        message: 'Token d\'authentification manquant',
      }),
      {
        status: 401,
        headers: {
          'Content-Type': 'application/json',
        },
      }
    ) as any;
  }

  try {
    const decoded = verifyToken(token);

    if (decoded.type !== 'access') {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Unauthorized',
          message: 'Type de token invalide',
        }),
        {
          status: 401,
          headers: {
            'Content-Type': 'application/json',
          },
        }
      ) as any;
    }

    // Ajouter les informations utilisateur au contexte
    (context as any).user = {
      userId: decoded.userId,
      email: decoded.email,
    };

    return context as AuthenticatedContext;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Token invalide';
    
    return new Response(
      JSON.stringify({
        success: false,
        error: 'Unauthorized',
        message,
      }),
      {
        status: 401,
        headers: {
          'Content-Type': 'application/json',
        },
      }
    ) as any;
  }
}

/**
 * Middleware optionnel qui vérifie l'authentification mais ne renvoie pas d'erreur
 * Utile pour les routes qui peuvent être accessibles avec ou sans authentification
 */
export async function optionalAuth(context: APIContext): Promise<AuthenticatedContext | APIContext> {
  const authHeader = context.request.headers.get('Authorization');
  const token = extractTokenFromHeader(authHeader);

  if (!token) {
    return context;
  }

  try {
    const decoded = verifyToken(token);

    if (decoded.type === 'access') {
      (context as any).user = {
        userId: decoded.userId,
        email: decoded.email,
      };
      return context as AuthenticatedContext;
    }
  } catch (error) {
    // Ignorer les erreurs pour l'auth optionnelle
  }

  return context;
}